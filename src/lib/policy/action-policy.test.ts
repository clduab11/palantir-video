import { beforeEach, describe, expect, it } from "vitest";

import {
  ApprovalGrantSchema,
  buildDefaultTisePolicies,
  evaluatePolicy,
  grantIntegrityIntact,
  mintCommanderApprovalGrant,
  ReasonCodes,
} from "@/lib/policy/action-policy";
import { resetCommanderGrantLedger } from "@/lib/policy/grant-ledger";
import { exportCotXml } from "@/lib/interop/cot";
import { ironAnvilScenario } from "@/lib/scenario/iron-anvil";
import { ingestAndSynthesize } from "@/lib/tise";

const NOW = new Date("2026-11-26T14:00:00.000Z");

beforeEach(() => {
  resetCommanderGrantLedger();
});

describe("default-deny kinetic ban", () => {
  it("denies autonomous kinetic tools even when a grant is attached", () => {
    const grant = mintCommanderApprovalGrant("QRF-6", NOW, 60_000);
    const withSideEffect = evaluatePolicy(
      buildDefaultTisePolicies(grant),
      {
        toolName: "tise.kinetic.fire",
        classification: "write",
        requestedSideEffects: ["kinetic.execute"],
      },
      { now: NOW },
    );
    const bare = evaluatePolicy(
      buildDefaultTisePolicies(grant),
      { toolName: "tise.kinetic.launch", classification: "write" },
      { now: NOW },
    );
    expect(withSideEffect.decision).toBe("deny");
    expect(withSideEffect.policyId).toBe("pol-kinetic-autonomous-ban");
    expect(withSideEffect.reasonCode).toBe(ReasonCodes.PolicyDenied);
    expect(bare.reasonCode).toBe(ReasonCodes.PolicyDenied);
  });

  it("denies unmatched tools", () => {
    const decision = evaluatePolicy(
      buildDefaultTisePolicies(),
      { toolName: "tise.unknown.tool" },
      { now: NOW },
    );
    expect(decision.decision).toBe("deny");
    expect(decision.reasonCode).toBe(ReasonCodes.NoMatchingPolicy);
  });
});

describe("commander grant integrity", () => {
  it("rejects a grant whose expiresAt was extended without a new fingerprint", () => {
    const grant = mintCommanderApprovalGrant("QRF-6", NOW, 60_000);
    expect(grantIntegrityIntact(grant)).toBe(true);
    const tampered = {
      ...grant,
      expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    };
    expect(grantIntegrityIntact(tampered)).toBe(false);
    expect(ApprovalGrantSchema.safeParse({ ...grant, singleUse: false }).success).toBe(
      false,
    );

    const synthesis = ingestAndSynthesize(ironAnvilScenario(NOW), { now: NOW });
    const blocked = exportCotXml({
      synthesis,
      mode: "nomination",
      approvalGrant: tampered,
      now: NOW,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.policyDecision.reasonCode).toBe(ReasonCodes.ApprovalInvalid);
    }
  });

  it("rejects an already-used grant payload and a wall-clock expiry", () => {
    const grant = mintCommanderApprovalGrant("QRF-6", NOW, 10_000);
    const synthesis = ingestAndSynthesize(ironAnvilScenario(NOW), { now: NOW });
    const first = exportCotXml({
      synthesis,
      mode: "nomination",
      approvalGrant: grant,
      now: NOW,
    });
    expect(first.ok).toBe(true);

    const replay = exportCotXml({
      synthesis,
      mode: "nomination",
      approvalGrant: grant,
      now: NOW,
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.policyDecision.reasonCode).toBe(ReasonCodes.ApprovalAlreadyUsed);
    }

    resetCommanderGrantLedger();
    const expired = exportCotXml({
      synthesis,
      mode: "nomination",
      approvalGrant: grant,
      now: new Date(NOW.getTime() + 11_000),
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.policyDecision.reasonCode).toBe(ReasonCodes.ApprovalExpired);
    }
  });
});
