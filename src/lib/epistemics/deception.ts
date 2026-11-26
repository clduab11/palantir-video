import type {
  Claim,
  ConflictEntry,
  DeceptionAssessment,
  DeceptionRisk,
  EnrichedEvent,
  Opinion,
  WhaleyDeceptionClass,
} from "@/lib/tise/types";

import { normalizeOpinion } from "./subjective-logic";

const EPS = 1e-9;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Exact O(k) closed-form Dempster conjunctive conflict mass c(V) and
 * normalized BBA over binary occupancy frame {HostilePresent, Absent}:
 *   c(V) = 1 - prod(b_i + u_i) - prod(d_i + u_i) + prod(u_i)
 */
export function setDempsterCombination(opinions: readonly Opinion[]): {
  conflictMass: number;
  combined: Opinion;
} {
  if (opinions.length === 0) {
    return {
      conflictMass: 0,
      combined: normalizeOpinion(0, 0, 1, 0.5),
    };
  }

  let prodBU = 1;
  let prodDU = 1;
  let prodU = 1;

  for (const op of opinions) {
    prodBU *= clamp01(op.b + op.u);
    prodDU *= clamp01(op.d + op.u);
    prodU *= clamp01(op.u);
  }

  const mT = Math.max(0, prodBU - prodU);
  const mF = Math.max(0, prodDU - prodU);
  const mTheta = Math.max(0, prodU);
  const nonConflict = Math.min(1, mT + mF + mTheta);
  const conflictMass = clamp01(1 - nonConflict);

  if (nonConflict <= EPS) {
    return {
      conflictMass: 0.999,
      combined: normalizeOpinion(0.45, 0.45, 0.1, 0.5),
    };
  }

  return {
    conflictMass,
    combined: normalizeOpinion(
      mT / nonConflict,
      mF / nonConflict,
      mTheta / nonConflict,
      0.5,
    ),
  };
}

/**
 * Meyerowitz Aggregated Uncertainty (AU) functional normalized to [0, 1] bits
 * on binary frame {T, F} (Schubert Eqs. 8-11).
 */
export function aggregatedUncertaintyBits(opinion: Opinion): number {
  if (opinion.b <= 0.5 && opinion.d <= 0.5) {
    return 1;
  }
  const p = opinion.b > 0.5 ? clamp01(opinion.b) : clamp01(opinion.d);
  if (p <= EPS || p >= 1 - EPS) return 0;
  const q = 1 - p;
  return clamp01(-(p * Math.log2(p) + q * Math.log2(q)));
}

/**
 * Barton Whaley Denial & Deception classification (Stratagem / Practise to Deceive):
 * - Simulation (Showing the False): DECOYING, MIMICKING, INVENTING
 * - Dissimulation (Hiding the Real): MASKING, REPACKAGING, DAZZLING
 */
export function classifyWhaleyDeception(input: {
  eventClaims: readonly Claim[];
  siteClaims: readonly Claim[];
  falsityScore: number;
}): WhaleyDeceptionClass {
  const { eventClaims, siteClaims, falsityScore } = input;
  const hasDecoy = eventClaims.some((c) => c.kind === "decoy");
  const hasEm = eventClaims.some((c) => c.kind === "em_active");
  const siteCold = siteClaims.some(
    (c) => c.kind === "thermal_none" || c.kind === "absence",
  );
  const siteDecoy = siteClaims.some((c) => c.kind === "decoy");

  if (hasDecoy || (hasEm && (siteCold || siteDecoy))) {
    return "DECOYING";
  }

  const hasAmbushOrPresence = eventClaims.some(
    (c) =>
      (c.kind === "ambush" || c.kind === "presence") && c.vector === "HUMINT",
  );
  const uncorroborated =
    !siteClaims.some(
      (c) =>
        c.vector !== "HUMINT" &&
        (c.kind === "thermal_positive" ||
          c.kind === "presence" ||
          c.kind === "static_defense"),
    );

  if (hasAmbushOrPresence && uncorroborated && falsityScore >= 0.18) {
    return "INVENTING";
  }

  const siteHasCivilians = siteClaims.some((c) => c.kind === "civilian");
  const siteHasWeapons = siteClaims.some(
    (c) => c.kind === "static_defense" || c.kind === "thermal_positive",
  );
  if (siteHasCivilians && siteHasWeapons) {
    return "MASKING";
  }

  if (falsityScore >= 0.45) return "MIMICKING";
  if (falsityScore >= 0.28) return "DAZZLING";
  return "NONE";
}

/**
 * Johan Schubert (FOI-S--5508--SE) Leave-One-Out Counter-Deception:
 * Combines conflict-drop degree of falsity m_Dv = (c0 - cq)/(1 - cq)
 * with Aggregated Uncertainty delta m_DEnt = max(0, AU(V) - AU(V \ {eq}))
 * via Dempster orthogonal sum: F = m_Dv + m_DEnt - m_Dv * m_DEnt.
 */
export function evaluateCounterDeception(
  events: readonly EnrichedEvent[],
  claims: readonly Claim[],
): {
  assessments: DeceptionAssessment[];
  globalConflictMassC0: number;
} {
  const bySite = new Map<string, Claim[]>();
  for (const claim of claims) {
    if (claim.kind === "civilian") continue;
    const list = bySite.get(claim.siteKey) ?? [];
    list.push(claim);
    bySite.set(claim.siteKey, list);
  }

  const siteStats = new Map<
    string,
    { c0: number; au0: number; claims: Claim[] }
  >();
  let maxC0 = 0;

  for (const [siteKey, siteClaims] of bySite) {
    const DeduplicatedByEvent = collapseEventOpinions(siteClaims);
    const full = setDempsterCombination(
      DeduplicatedByEvent.map((row) => row.opinion),
    );
    const au0 = aggregatedUncertaintyBits(full.combined);
    siteStats.set(siteKey, { c0: full.conflictMass, au0, claims: siteClaims });
    if (full.conflictMass > maxC0) maxC0 = full.conflictMass;
  }

  const assessments: DeceptionAssessment[] = [];

  for (const event of events) {
    if (event.quarantined) continue;
    const eventClaims = claims.filter((c) => c.eventId === event.event_id);
    const primarySiteKey = eventClaims[0]?.siteKey ?? "UNKNOWN";
    const primarySiteLabel =
      eventClaims[0]?.siteLabel ?? event.location.description;
    const stat = siteStats.get(primarySiteKey);

    if (!stat || stat.claims.length <= 1) {
      const singleDecoy = eventClaims.some((c) => c.kind === "decoy");
      const singleUnverifiedAmbush =
        event.vector_type === "HUMINT" &&
        eventClaims.some((c) => c.kind === "ambush") &&
        event.confidence_score < 0.6;

      const heuristicFalsity = singleDecoy
        ? 0.72
        : singleUnverifiedAmbush
          ? 0.44
          : 0;
      const whaley = classifyWhaleyDeception({
        eventClaims,
        siteClaims: eventClaims,
        falsityScore: heuristicFalsity,
      });

      assessments.push({
        eventId: event.event_id,
        sourceId: event.source_id,
        vector: event.vector_type,
        siteKey: primarySiteKey,
        siteLabel: primarySiteLabel,
        conflictDrop: 0,
        entropyDelta: singleUnverifiedAmbush ? 0.22 : 0,
        falsityScore: heuristicFalsity,
        whaleyClass: whaley,
        rationale:
          whaley === "NONE"
            ? "Isolated observation; insufficient cross-vector overlap for leave-one-out conflict drop."
            : `Single-vector ${whaley} indicator at ${primarySiteLabel}; requires cross-sensor confirmation.`,
      });
      continue;
    }

    const collapsedWithout = collapseEventOpinions(
      stat.claims.filter((c) => c.eventId !== event.event_id),
    );
    const without = setDempsterCombination(
      collapsedWithout.map((row) => row.opinion),
    );
    const cq = without.conflictMass;
    const auq = aggregatedUncertaintyBits(without.combined);

    const mDv =
      cq >= 0.999 ? 0 : clamp01(Math.max(0, stat.c0 - cq) / (1 - cq));
    const mDEnt = clamp01(Math.max(0, stat.au0 - auq));
    let falsity = clamp01(mDv + mDEnt - mDv * mDEnt);

    const explicitDecoy =
      event.vector_type === "SIGINT" &&
      (eventClaims.some((c) => c.kind === "decoy") ||
        (eventClaims.some((c) => c.kind === "em_active") &&
          stat.claims.some(
            (c) =>
              c.vector === "GEOINT" &&
              (c.kind === "absence" || c.kind === "thermal_none"),
          )));

    if (explicitDecoy) {
      falsity = Math.max(falsity, clamp01(0.58 + 0.35 * mDv));
    }

    const whaley = classifyWhaleyDeception({
      eventClaims,
      siteClaims: stat.claims,
      falsityScore: falsity,
    });

    assessments.push({
      eventId: event.event_id,
      sourceId: event.source_id,
      vector: event.vector_type,
      siteKey: primarySiteKey,
      siteLabel: primarySiteLabel,
      conflictDrop: mDv,
      entropyDelta: mDEnt,
      falsityScore: falsity,
      whaleyClass: whaley,
      rationale: formatDeceptionRationale({
        siteLabel: primarySiteLabel,
        c0: stat.c0,
        cq,
        mDv,
        mDEnt,
        falsity,
        whaley,
      }),
    });
  }

  return {
    assessments: assessments.sort((a, b) => b.falsityScore - a.falsityScore),
    globalConflictMassC0: maxC0,
  };
}

function collapseEventOpinions(
  siteClaims: readonly Claim[],
): { eventId: string; opinion: Opinion }[] {
  const byEvent = new Map<string, Claim[]>();
  for (const claim of siteClaims) {
    const list = byEvent.get(claim.eventId) ?? [];
    list.push(claim);
    byEvent.set(claim.eventId, list);
  }

  const out: { eventId: string; opinion: Opinion }[] = [];
  for (const [eventId, group] of byEvent) {
    const hasDecoy = group.some((c) => c.kind === "decoy");
    const hasEm = group.some((c) => c.kind === "em_active");
    if (hasDecoy && hasEm) {
      const em = group.find((c) => c.kind === "em_active") ?? group[0]!;
      out.push({ eventId, opinion: em.opinion });
      continue;
    }
    const bAvg = group.reduce((s, c) => s + c.opinion.b, 0) / group.length;
    const dAvg = group.reduce((s, c) => s + c.opinion.d, 0) / group.length;
    const uAvg = group.reduce((s, c) => s + c.opinion.u, 0) / group.length;
    out.push({
      eventId,
      opinion: normalizeOpinion(bAvg, dAvg, uAvg, 0.5),
    });
  }
  return out;
}

function formatDeceptionRationale(input: {
  siteLabel: string;
  c0: number;
  cq: number;
  mDv: number;
  mDEnt: number;
  falsity: number;
  whaley: WhaleyDeceptionClass;
}): string {
  if (input.falsity < 0.12 && input.whaley === "NONE") {
    return `Consistent with peer sensors at ${input.siteLabel} (c0=${input.c0.toFixed(2)} -> cq=${input.cq.toFixed(2)}).`;
  }
  return `Withholding report drops Dempster conflict ${input.c0.toFixed(2)} -> ${input.cq.toFixed(2)} (m_Dv=${input.mDv.toFixed(2)}, dEnt=${input.mDEnt.toFixed(2)}); Whaley=${input.whaley}.`;
}

export function deriveDeceptionRisk(
  conflicts: readonly ConflictEntry[],
  assessments: readonly DeceptionAssessment[],
  claims: readonly Claim[],
): DeceptionRisk {
  const maxFalsity = assessments.reduce(
    (best, row) => Math.max(best, row.falsityScore),
    0,
  );
  const spoofConflicts = conflicts.filter(
    (c) => c.class === "spoof" || c.class === "em_without_physical",
  );
  const highDecoyClaim = claims.some(
    (c) => c.kind === "decoy" && c.confidence >= 0.75,
  );

  if (
    maxFalsity >= 0.62 ||
    (spoofConflicts.length >= 1 && highDecoyClaim) ||
    assessments.filter((a) => a.whaleyClass !== "NONE" && a.falsityScore >= 0.4)
      .length >= 2
  ) {
    return "HIGH";
  }

  if (
    maxFalsity >= 0.3 ||
    spoofConflicts.length >= 1 ||
    conflicts.some((c) => c.class === "uncorroborated")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}
