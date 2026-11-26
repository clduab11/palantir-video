import { z } from "zod";

import { sha256Hex } from "@/lib/crypto/sha256";
import { wasCommanderGrantConsumed } from "@/lib/policy/grant-ledger";
import { noSecretShapedFields } from "@/lib/policy/secret-guard";

/**
 * Clean-room mirror of clduab11/the-synactic's deterministic ActionPolicy
 * and single-use expiring ApprovalGrant gate:
 * - Default-deny when no policy matches.
 * - Read operations allowed when matched.
 * - Write operations (e.g., exporting a STRIKE target CoT nomination)
 *   return "require-approval" until an operator signs a non-expired grant.
 * - Autonomous kinetic execution is permanently denied by charter.
 */
export const PolicyEffectSchema = z.enum(["allow", "deny"]);
export type PolicyEffect = z.infer<typeof PolicyEffectSchema>;

export const ToolClassificationSchema = z.enum(["read", "write"]);
export type ToolClassification = z.infer<typeof ToolClassificationSchema>;

export type ToolDecision = "allow" | "deny" | "require-approval";

export const ReasonCodes = {
  NoMatchingPolicy: "no-matching-policy",
  SideEffectNotAllowed: "side-effect-not-allowed",
  PolicyDenied: "policy-denied",
  ReadAllowed: "read-allowed",
  WriteRequiresApproval: "write-requires-approval",
  ApprovalExpired: "approval-expired",
  ApprovalAlreadyUsed: "approval-already-used",
  ApprovalInvalid: "approval-invalid",
  WriteApproved: "write-approved",
} as const;

export type PolicyReasonCode = (typeof ReasonCodes)[keyof typeof ReasonCodes];

export const REASON_MESSAGES: Record<PolicyReasonCode, string> = {
  "no-matching-policy": "Denied: no policy matches requested tool (default-deny).",
  "side-effect-not-allowed":
    "Denied: requested side effect is outside the policy allowlist.",
  "policy-denied":
    "Denied by charter: autonomous kinetic execution is permanently prohibited.",
  "read-allowed": "Allowed: deterministic read-only intelligence synthesis.",
  "write-requires-approval":
    "Human approval required: write/nomination exports require a signed commander grant.",
  "approval-expired":
    "Human approval required: commander grant has expired.",
  "approval-already-used":
    "Human approval required: single-use commander grant was already consumed.",
  "approval-invalid":
    "Human approval required: commander grant is invalid or tampered.",
  "write-approved":
    "Allowed: valid human commander grant verified for write/nomination export.",
};

export const ApprovalGrantSchema = z
  .strictObject({
    grantId: z.string().min(1),
    grantedBy: z.string().min(1),
    grantedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
    expiresAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
    singleUse: z.literal(true).default(true),
    usedAt: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)))
      .nullable(),
  })
  .refine((g) => Date.parse(g.expiresAt) > Date.parse(g.grantedAt), {
    message: "expiresAt must be strictly after grantedAt",
  });

export type ApprovalGrant = z.infer<typeof ApprovalGrantSchema>;

export const ActionPolicySchema = z.strictObject({
  policyId: z.string().min(1),
  toolPattern: z.string().min(1),
  effect: PolicyEffectSchema.default("deny"),
  classification: ToolClassificationSchema.default("read"),
  approval: ApprovalGrantSchema.nullable(),
  allowedSideEffects: z.array(z.string().min(1)).default([]),
});

export type ActionPolicy = z.infer<typeof ActionPolicySchema>;

export const ToolCallDescriptorSchema = z.strictObject({
  toolName: z.string().min(1),
  classification: ToolClassificationSchema.optional(),
  requestedSideEffects: z.array(z.string().min(1)).default([]),
  arguments: z.record(z.string(), z.unknown()).superRefine(noSecretShapedFields).optional(),
});

export type ToolCallDescriptorInput = z.input<typeof ToolCallDescriptorSchema>;

export type PolicyDecision = {
  readonly decision: ToolDecision;
  readonly reasonCode: PolicyReasonCode;
  readonly policyId: string | null;
  readonly message: string;
};

export type ToolCallAuditRecord = {
  readonly callId: string;
  readonly timestamp: string;
  readonly toolName: string;
  readonly decision: PolicyDecision;
  readonly argsDigest: string;
  readonly grantId: string | null;
};

export function matchesToolPattern(toolPattern: string, toolName: string): boolean {
  if (toolPattern === toolName) return true;
  if (toolPattern.endsWith("*")) {
    return toolName.startsWith(toolPattern.slice(0, -1));
  }
  return false;
}

type RankedPolicy = {
  readonly policy: ActionPolicy;
  readonly prefixLength: number;
  readonly exact: boolean;
};

function compareRanked(a: RankedPolicy, b: RankedPolicy): number {
  if (a.prefixLength !== b.prefixLength) return b.prefixLength - a.prefixLength;
  if (a.exact !== b.exact) return a.exact ? -1 : 1;
  if (a.policy.effect !== b.policy.effect) {
    return a.policy.effect === "deny" ? -1 : 1;
  }
  return a.policy.policyId.localeCompare(b.policy.policyId);
}

export function commanderGrantFingerprint(input: {
  grantedBy: string;
  grantedAt: string;
  expiresAt: string;
  singleUse: boolean;
}): string {
  return `GRT-${sha256Hex(
    `${input.grantedBy}:${input.grantedAt}:${input.expiresAt}:${input.singleUse ? "1" : "0"}`,
  )
    .slice(0, 10)
    .toUpperCase()}`;
}

export function grantIntegrityIntact(grant: ApprovalGrant): boolean {
  return grant.grantId === commanderGrantFingerprint(grant);
}

function invalidGrantReason(
  grant: ApprovalGrant,
  now: Date,
): PolicyReasonCode | null {
  if (!grantIntegrityIntact(grant)) {
    return ReasonCodes.ApprovalInvalid;
  }
  if (!(Date.parse(grant.expiresAt) > now.getTime())) {
    return ReasonCodes.ApprovalExpired;
  }
  if (grant.singleUse && grant.usedAt !== null) {
    return ReasonCodes.ApprovalAlreadyUsed;
  }
  if (grant.singleUse && wasCommanderGrantConsumed(grant.grantId)) {
    return ReasonCodes.ApprovalAlreadyUsed;
  }
  return null;
}

export function evaluatePolicy(
  policies: readonly ActionPolicy[],
  call: ToolCallDescriptorInput,
  options?: { now?: Date },
): PolicyDecision {
  const descriptor = ToolCallDescriptorSchema.parse(call);
  const now = options?.now ?? new Date();

  const ranked: RankedPolicy[] = [];
  for (const policy of policies) {
    if (!matchesToolPattern(policy.toolPattern, descriptor.toolName)) continue;
    const exact = !policy.toolPattern.endsWith("*");
    ranked.push({
      policy,
      prefixLength: exact
        ? policy.toolPattern.length
        : policy.toolPattern.length - 1,
      exact,
    });
  }
  ranked.sort(compareRanked);

  const winner = ranked.at(0);
  if (!winner) {
    return {
      decision: "deny",
      reasonCode: ReasonCodes.NoMatchingPolicy,
      policyId: null,
      message: REASON_MESSAGES["no-matching-policy"],
    };
  }

  const policy = winner.policy;
  if (policy.effect === "deny") {
    return {
      decision: "deny",
      reasonCode: ReasonCodes.PolicyDenied,
      policyId: policy.policyId,
      message: REASON_MESSAGES["policy-denied"],
    };
  }

  const allowedSideEffects = new Set(policy.allowedSideEffects);
  const forbidden = descriptor.requestedSideEffects.some(
    (effect) => !allowedSideEffects.has(effect),
  );
  if (forbidden) {
    return {
      decision: "deny",
      reasonCode: ReasonCodes.SideEffectNotAllowed,
      policyId: policy.policyId,
      message: REASON_MESSAGES["side-effect-not-allowed"],
    };
  }

  const classification = descriptor.classification ?? policy.classification;
  if (classification === "read") {
    return {
      decision: "allow",
      reasonCode: ReasonCodes.ReadAllowed,
      policyId: policy.policyId,
      message: REASON_MESSAGES["read-allowed"],
    };
  }

  const grant = policy.approval;
  if (grant === null) {
    return {
      decision: "require-approval",
      reasonCode: ReasonCodes.WriteRequiresApproval,
      policyId: policy.policyId,
      message: REASON_MESSAGES["write-requires-approval"],
    };
  }

  const invalid = invalidGrantReason(grant, now);
  if (invalid !== null) {
    return {
      decision: "require-approval",
      reasonCode: invalid,
      policyId: policy.policyId,
      message: REASON_MESSAGES[invalid],
    };
  }

  return {
    decision: "allow",
    reasonCode: ReasonCodes.WriteApproved,
    policyId: policy.policyId,
    message: REASON_MESSAGES["write-approved"],
  };
}

export function buildDefaultTisePolicies(
  strikeApprovalGrant: ApprovalGrant | null = null,
): ActionPolicy[] {
  return [
    {
      policyId: "pol-tise-read",
      toolPattern: "tise.read.*",
      effect: "allow",
      classification: "read",
      approval: null,
      allowedSideEffects: [],
    },
    {
      policyId: "pol-cot-awareness",
      toolPattern: "tise.export.cot.awareness",
      effect: "allow",
      classification: "read",
      approval: null,
      allowedSideEffects: ["c2.cot_awareness"],
    },
    {
      policyId: "pol-cot-strike-nomination",
      toolPattern: "tise.export.cot.strike",
      effect: "allow",
      classification: "write",
      approval: strikeApprovalGrant,
      allowedSideEffects: ["c2.cot_nomination"],
    },
    {
      policyId: "pol-kinetic-autonomous-ban",
      toolPattern: "tise.kinetic.*",
      effect: "deny",
      classification: "write",
      approval: null,
      allowedSideEffects: [],
    },
  ];
}

export function mintCommanderApprovalGrant(
  grantedBy: string,
  now = new Date(),
  ttlMs = 5 * 60 * 1000,
): ApprovalGrant {
  const grantedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + Math.max(10_000, ttlMs)).toISOString();
  const grantedById = grantedBy.trim() || "QRF-6-ACTUAL";
  const grantId = commanderGrantFingerprint({
    grantedBy: grantedById,
    grantedAt,
    expiresAt,
    singleUse: true,
  });
  return ApprovalGrantSchema.parse({
    grantId,
    grantedBy: grantedById,
    grantedAt,
    expiresAt,
    singleUse: true,
    usedAt: null,
  });
}

export function createAuditRecord(input: {
  toolName: string;
  decision: PolicyDecision;
  args: Record<string, unknown>;
  grantId?: string | null;
  now?: Date;
}): ToolCallAuditRecord {
  const now = input.now ?? new Date();
  const argsDigest = `sha256:${sha256Hex(JSON.stringify(input.args)).slice(0, 16)}`;
  return {
    callId: `CALL-${sha256Hex(`${input.toolName}:${now.toISOString()}:${argsDigest}`).slice(0, 10).toUpperCase()}`,
    timestamp: now.toISOString(),
    toolName: input.toolName,
    decision: input.decision,
    argsDigest,
    grantId: input.grantId ?? null,
  };
}
