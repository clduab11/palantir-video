import { assertNever } from "@/lib/tise/never";
import type { AssertionKind, Opinion } from "@/lib/tise/types";

const EPS = 1e-9;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function snapToSimplex(bIn: number, dIn: number, uIn: number, a: number): Opinion {
  let b = clamp01(bIn);
  let d = clamp01(dIn);
  let u = clamp01(uIn);

  // Dogmatic leftover u from floating-point drift is not evidence.
  if (u <= EPS) {
    u = 0;
    const mass = b + d;
    if (mass <= EPS) {
      return { b: 0, d: 0, u: 1, a, projected: a };
    }
    b /= mass;
    d /= mass;
  } else {
    const sum = b + d + u;
    if (sum <= EPS) {
      return { b: 0, d: 0, u: 1, a, projected: a };
    }
    b /= sum;
    d /= sum;
    u = Math.max(0, 1 - b - d);
    if (u <= EPS) {
      u = 0;
      const mass = b + d;
      if (mass <= EPS) {
        return { b: 0, d: 0, u: 1, a, projected: a };
      }
      b /= mass;
      d /= mass;
    }
  }

  const projected = clamp01(b + a * u);
  return { b, d, u, a, projected };
}

export function normalizeOpinion(
  bRaw: number,
  dRaw: number,
  uRaw: number,
  aRaw = 0.5,
): Opinion {
  const bPos = Math.max(0, Number.isFinite(bRaw) ? bRaw : 0);
  const dPos = Math.max(0, Number.isFinite(dRaw) ? dRaw : 0);
  const uPos = Math.max(0, Number.isFinite(uRaw) ? uRaw : 0);
  const total = bPos + dPos + uPos;
  const a = clamp01(aRaw);

  if (total <= EPS) {
    return { b: 0, d: 0, u: 1, a, projected: a };
  }

  return snapToSimplex(bPos / total, dPos / total, uPos / total, a);
}

export function vacuousOpinion(baseRate = 0.5): Opinion {
  const a = clamp01(baseRate);
  return { b: 0, d: 0, u: 1, a, projected: a };
}

export function temporalFreshnessWeight(
  ageMs: number,
  halfLifeMs = 90 * 60 * 1000,
): number {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
  const decay = Math.pow(2, -ageMs / Math.max(60_000, halfLifeMs));
  return Math.min(1, Math.max(0.12, decay));
}

/**
 * Josang Trust Discounting operator (omega^A_X = p_T * omega^B_X):
 * Low source reliability or temporal decay transfers belief/disbelief mass
 * into epistemic uncertainty u rather than fabricating opposing disbelief.
 */
export function trustDiscount(opinion: Opinion, trustScalar: number): Opinion {
  const p = clamp01(trustScalar);
  const b = p * opinion.b;
  const d = p * opinion.d;
  const u = Math.max(0, 1 - b - d);
  return normalizeOpinion(b, d, u, opinion.a);
}

/**
 * Josang Cumulative Consensus operator (Section 12.3):
 * Combines independent evidence sources (e.g., SIGINT + GEOINT).
 */
export function cumulativeFuse(left: Opinion, right: Opinion): Opinion {
  const uA = left.u;
  const uB = right.u;
  const kappa = uA + uB - uA * uB;

  if (kappa <= EPS) {
    const b = 0.5 * (left.b + right.b);
    const d = 0.5 * (left.d + right.d);
    return normalizeOpinion(b, d, 0, 0.5 * (left.a + right.a));
  }

  const b = (left.b * uB + right.b * uA) / kappa;
  const d = (left.d * uB + right.d * uA) / kappa;
  const u = (uA * uB) / kappa;

  const denomA = uA + uB - 2 * uA * uB;
  const a =
    Math.abs(denomA) <= EPS
      ? 0.5 * (left.a + right.a)
      : (left.a * uB + right.a * uA - (left.a + right.a) * uA * uB) / denomA;

  return normalizeOpinion(b, d, u, a);
}

/**
 * Josang Averaging Belief Fusion operator (Section 12.5):
 * Idempotent (omega (+) omega === omega), used for same-source observations so
 * repeated pings from one emitter/informant never self-corroborate.
 */
export function averagingFuse(opinions: readonly Opinion[]): Opinion {
  if (opinions.length === 0) return vacuousOpinion();
  if (opinions.length === 1) {
    const only = opinions[0];
    if (!only) return vacuousOpinion();
    return normalizeOpinion(only.b, only.d, only.u, only.a);
  }

  const dogmatic = opinions.filter((op) => op.u <= EPS);
  if (dogmatic.length > 0) {
    const b = dogmatic.reduce((sum, op) => sum + op.b, 0) / dogmatic.length;
    const d = dogmatic.reduce((sum, op) => sum + op.d, 0) / dogmatic.length;
    const a = dogmatic.reduce((sum, op) => sum + op.a, 0) / dogmatic.length;
    return normalizeOpinion(b, d, 0, a);
  }

  const n = opinions.length;
  let invUSum = 0;
  for (const op of opinions) {
    invUSum += 1 / op.u;
  }

  let bNum = 0;
  let dNum = 0;
  let aSum = 0;
  for (const op of opinions) {
    const weight = (1 / op.u) / invUSum;
    bNum += weight * op.b;
    dNum += weight * op.d;
    aSum += op.a;
  }

  const u = n / invUSum;
  const scale = 1 - u;
  const massTotal = bNum + dNum;
  if (massTotal <= EPS) {
    return normalizeOpinion(0, 0, 1, aSum / n);
  }
  const b = (bNum / massTotal) * scale;
  const d = (dNum / massTotal) * scale;
  return normalizeOpinion(b, d, u, aSum / n);
}

/**
 * Source-aware multi-claim fusion:
 * 1) Group claims by sourceId and apply idempotent Averaging Fusion within each source.
 * 2) Combine distinct sources via Cumulative Consensus.
 */
export function fuseSourceScopedOpinions(
  items: readonly { sourceId: string; opinion: Opinion }[],
): Opinion {
  if (items.length === 0) return vacuousOpinion();
  const bySource = new Map<string, Opinion[]>();
  for (const item of items) {
    const list = bySource.get(item.sourceId) ?? [];
    list.push(item.opinion);
    bySource.set(item.sourceId, list);
  }

  const perSource: Opinion[] = [];
  for (const group of bySource.values()) {
    perSource.push(averagingFuse(group));
  }

  let acc = perSource[0] ?? vacuousOpinion();
  for (let i = 1; i < perSource.length; i += 1) {
    const next = perSource[i];
    if (next) acc = cumulativeFuse(acc, next);
  }
  return acc;
}

export function pairwiseDempsterConflict(left: Opinion, right: Opinion): number {
  return clamp01(left.b * right.d + left.d * right.b);
}

export function claimPolarity(kind: AssertionKind): 1 | -1 | 0 {
  switch (kind) {
    case "presence":
    case "thermal_positive":
    case "static_defense":
    case "movement":
    case "ambush":
    case "em_active":
      return 1;
    case "absence":
    case "thermal_none":
    case "em_none":
    case "decoy":
      return -1;
    case "civilian":
      return 0;
    default:
      return assertNever(kind, "assertion kind");
  }
}

export function buildClaimOpinion(input: {
  confidenceScore: number;
  trustWeight: number;
  temporalWeight: number;
  kind: AssertionKind;
  baseRate?: number;
}): Opinion {
  const c = clamp01(input.confidenceScore);
  const polarity = claimPolarity(input.kind);
  const baseUncertainty = Math.max(0.06, 1 - c * 0.92);
  let raw: Opinion;

  if (polarity === 1) {
    raw = normalizeOpinion(1 - baseUncertainty, 0, baseUncertainty, input.baseRate ?? 0.5);
  } else if (polarity === -1) {
    raw = normalizeOpinion(0, 1 - baseUncertainty, baseUncertainty, input.baseRate ?? 0.5);
  } else {
    raw = normalizeOpinion(
      0.25 * (1 - baseUncertainty),
      0.25 * (1 - baseUncertainty),
      baseUncertainty + 0.5 * (1 - baseUncertainty),
      input.baseRate ?? 0.5,
    );
  }

  return trustDiscount(raw, input.trustWeight * input.temporalWeight);
}
