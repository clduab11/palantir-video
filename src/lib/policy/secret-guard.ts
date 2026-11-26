import { z } from "zod";

/**
 * Clean-room mirror of clduab11/the-synactic's SecretSafeRecord guard:
 * credentials and secret-shaped fields or values are rejected fail-closed
 * before any event envelope or tool-call record enters the TISE pipeline.
 */
export const SECRET_FIELD_PATTERN =
  /(secret|password|passwd|pwd|token|api[-_]?key|apikey|credentials?|bearer|private[-_]?key|access[-_]?key|session[-_]?key|signing[-_]?key)/i;

export const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bgho_[A-Za-z0-9]{20,}/,
  /\bghu_[A-Za-z0-9]{20,}/,
  /\bghs_[A-Za-z0-9]{20,}/,
  /\bghr_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
];

export type SecretShapedHit = {
  readonly path: readonly (string | number)[];
  readonly kind: "key" | "value";
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scanSecrets(
  value: unknown,
  path: readonly (string | number)[],
  seen: WeakSet<object>,
): SecretShapedHit | null {
  if (typeof value === "string") {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(value)) return { path, kind: "value" };
    }
    return null;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    for (let i = 0; i < value.length; i += 1) {
      const hit = scanSecrets(value[i], [...path, i], seen);
      if (hit) return hit;
    }
    return null;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_FIELD_PATTERN.test(key)) {
        return { path: [...path, key], kind: "key" };
      }
      const hit = scanSecrets(child, [...path, key], seen);
      if (hit) return hit;
    }
  }
  return null;
}

export function findSecretShapedField(value: unknown): SecretShapedHit | null {
  return scanSecrets(value, [], new WeakSet());
}

export function formatSecretPath(path: readonly (string | number)[]): string {
  return path.length === 0 ? "<root>" : path.map(String).join(".");
}

export function noSecretShapedFields(value: unknown, ctx: z.RefinementCtx): void {
  const hit = findSecretShapedField(value);
  if (hit) {
    ctx.addIssue({
      code: "custom",
      path: [...hit.path],
      message: `REJECTED: secret-shaped ${hit.kind} at ${formatSecretPath(hit.path)} — credentials must never ride event envelopes`,
    });
  }
}

export const SecretSafeRecordSchema = z
  .record(z.string(), z.unknown())
  .superRefine(noSecretShapedFields);
