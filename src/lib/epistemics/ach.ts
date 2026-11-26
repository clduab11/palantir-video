import { assertNever } from "@/lib/tise/never";
import type {
  AchEvaluation,
  Claim,
  Cluster,
  ConflictEntry,
  DeceptionAssessment,
  HypothesisId,
  HypothesisScore,
  RankedCollectionGap,
} from "@/lib/tise/types";

import { normalizeOpinion } from "./subjective-logic";

const HYPOTHESIS_META: Record<
  HypothesisId,
  { label: string; description: string; prior: number }
> = {
  H1_PREPARED_DEFENSE: {
    label: "H1: Embedded Fighting Position",
    description:
      "Hostile element occupies a fortified urban structure with corroborated kinetic/thermal/EM signatures.",
    prior: 0.28,
  },
  H2_COORDINATED_AMBUSH: {
    label: "H2: L-Shaped Ambush / Lure",
    description:
      "Adversary baits QRF along a canalized approach (overpass/bridge) using staged tips or decoy emitters.",
    prior: 0.22,
  },
  H3_DECEPTION_FEINT: {
    label: "H3: Electronic Spoof / Unmanned Decoy",
    description:
      "Observed RF or walk-in reporting is simulated to fix ISR or draw fire away from actual movement.",
    prior: 0.25,
  },
  H4_STALE_OR_VACANT: {
    label: "H4: Displaced / Vacant AOI",
    description:
      "Prior occupants have exfiltrated or sensor traffic reflects civilian background and stale reporting.",
    prior: 0.25,
  },
};

function shannonEntropyBits(probs: readonly number[]): number {
  let h = 0;
  for (const p of probs) {
    if (p > 1e-9) h -= p * Math.log2(p);
  }
  return h;
}

function diagnosticityLogWeight(
  claim: Claim,
  hypothesis: HypothesisId,
  corroboratedSites: ReadonlySet<string>,
): number {
  const strength = claim.opinion.b - claim.opinion.d;
  const isCorroborated = corroboratedSites.has(claim.siteKey);

  switch (hypothesis) {
    case "H1_PREPARED_DEFENSE": {
      if (claim.kind === "static_defense") return 1.35 * Math.max(0.1, claim.opinion.b);
      if (claim.kind === "thermal_positive" && isCorroborated) {
        return 1.15 * claim.opinion.b;
      }
      if (claim.kind === "em_active" && isCorroborated) return 0.95 * claim.opinion.b;
      if (claim.kind === "decoy") return -0.35 * claim.confidence;
      if (claim.kind === "absence" || claim.kind === "thermal_none") {
        return isCorroborated ? -0.45 : -0.15;
      }
      return 0.2 * strength;
    }
    case "H2_COORDINATED_AMBUSH": {
      if (claim.kind === "ambush") return isCorroborated ? 1.65 : 0.95 * claim.confidence;
      if (claim.kind === "decoy") return 0.75 * claim.confidence;
      if (claim.kind === "movement") return 0.65 * claim.opinion.b;
      if (claim.kind === "static_defense" && !isCorroborated) return 0.25;
      return 0;
    }
    case "H3_DECEPTION_FEINT": {
      if (claim.kind === "decoy") return 1.45 * claim.confidence;
      if (claim.kind === "thermal_none" || claim.kind === "absence") {
        return 0.75 * claim.opinion.d;
      }
      if (claim.kind === "static_defense" && isCorroborated) return -0.85;
      if (claim.kind === "thermal_positive" && isCorroborated) return -0.7;
      return 0;
    }
    case "H4_STALE_OR_VACANT": {
      if (claim.kind === "absence" || claim.kind === "thermal_none" || claim.kind === "em_none") {
        return 1.1 * claim.opinion.d;
      }
      if (claim.opinion.u > 0.65) return 0.6 * claim.opinion.u;
      if (claim.kind === "thermal_positive" && isCorroborated) return -1.3;
      if (claim.kind === "static_defense" && isCorroborated) return -1.2;
      return 0;
    }
    default:
      return assertNever(hypothesis, "ACH hypothesis");
  }
}

/**
 * Heuer Analysis of Competing Hypotheses (ACH-SL) + Expected Information Gain
 * (Kullback-Leibler / Shannon entropy reduction in bits) for collection tasking.
 */
export function evaluateAch(input: {
  claims: readonly Claim[];
  clusters: readonly Cluster[];
  conflicts: readonly ConflictEntry[];
  deceptions: readonly DeceptionAssessment[];
  conflictMassC0: number;
}): AchEvaluation {
  const corroboratedSites = new Set(
    input.clusters
      .filter((cluster) => cluster.vectors.length >= 2 && cluster.veracity >= 0.55)
      .map((cluster) => cluster.siteKey),
  );

  const ids: HypothesisId[] = [
    "H1_PREPARED_DEFENSE",
    "H2_COORDINATED_AMBUSH",
    "H3_DECEPTION_FEINT",
    "H4_STALE_OR_VACANT",
  ];

  if (input.claims.length === 0) {
    const uniform = ids.map((id) => ({
      id,
      label: HYPOTHESIS_META[id].label,
      description: HYPOTHESIS_META[id].description,
      posterior: id === "H4_STALE_OR_VACANT" ? 0.4 : 0.2,
      opinion: normalizeOpinion(0, 0, 1, 0.25),
      supportingEvents: [],
      refutingEvents: [],
    }));
    return {
      hypotheses: uniform,
      leadingHypothesis: "H4_STALE_OR_VACANT",
      entropyBits: shannonEntropyBits(uniform.map((h) => h.posterior)),
      maxEntropyBits: 2,
      conflictMassC0: 0,
      rankedGaps: [],
    };
  }

  const rawScores = ids.map((id) => {
    const meta = HYPOTHESIS_META[id];
    let logScore = Math.log(meta.prior);
    const supporting = new Set<string>();
    const refuting = new Set<string>();

    for (const claim of input.claims) {
      const delta = diagnosticityLogWeight(claim, id, corroboratedSites);
      logScore += delta;
      if (delta >= 0.35) supporting.add(claim.eventId);
      if (delta <= -0.35) refuting.add(claim.eventId);
    }

    if (id === "H2_COORDINATED_AMBUSH") {
      const doubleSpoof =
        input.deceptions.filter((d) => d.falsityScore >= 0.42).length >= 2 &&
        input.claims.some((c) => c.kind === "ambush");
      if (doubleSpoof) logScore += 1.35;
    }

    return {
      id,
      logScore,
      supporting: [...supporting],
      refuting: [...refuting],
    };
  });

  const maxLog = Math.max(...rawScores.map((r) => r.logScore));
  const expScores = rawScores.map((r) => Math.exp(r.logScore - maxLog));
  const expSum = expScores.reduce((a, b) => a + b, 0) || 1;

  const meanUncertainty =
    input.claims.reduce((sum, c) => sum + c.opinion.u, 0) / input.claims.length;

  const hypotheses: HypothesisScore[] = rawScores
    .map((row, idx) => {
      const posterior = (expScores[idx] ?? 0) / expSum;
      const u = Math.min(0.85, Math.max(0.08, meanUncertainty * 0.85));
      const b = posterior * (1 - u);
      const d = (1 - posterior) * (1 - u);
      return {
        id: row.id,
        label: HYPOTHESIS_META[row.id].label,
        description: HYPOTHESIS_META[row.id].description,
        posterior,
        opinion: normalizeOpinion(b, d, u, HYPOTHESIS_META[row.id].prior),
        supportingEvents: row.supporting,
        refutingEvents: row.refuting,
      };
    })
    .sort((a, b) => b.posterior - a.posterior);

  const posteriors = hypotheses.map((h) => h.posterior);
  const currentEntropy = shannonEntropyBits(posteriors);

  const rankedGaps = rankVerificationGaps({
    claims: input.claims,
    clusters: input.clusters,
    conflicts: input.conflicts,
    deceptions: input.deceptions,
    currentEntropy,
    posteriorsByHypothesis: new Map(hypotheses.map((h) => [h.id, h.posterior])),
  });

  return {
    hypotheses,
    leadingHypothesis: hypotheses[0]?.id ?? "H4_STALE_OR_VACANT",
    entropyBits: currentEntropy,
    maxEntropyBits: 2,
    conflictMassC0: input.conflictMassC0,
    rankedGaps,
  };
}

function simulateExpectedInfoGain(
  currentEntropy: number,
  pTargetHypotheses: number,
  sensorReliability: number,
): number {
  const pResolve = Math.min(0.95, Math.max(0.05, pTargetHypotheses));
  const postEntropyIfPositive = currentEntropy * (1 - 0.68 * sensorReliability);
  const postEntropyIfNegative = currentEntropy * (1 - 0.52 * sensorReliability);
  const expectedPost =
    pResolve * postEntropyIfPositive + (1 - pResolve) * postEntropyIfNegative;
  return Math.max(0.04, currentEntropy - expectedPost);
}

function rankVerificationGaps(input: {
  claims: readonly Claim[];
  clusters: readonly Cluster[];
  conflicts: readonly ConflictEntry[];
  deceptions: readonly DeceptionAssessment[];
  currentEntropy: number;
  posteriorsByHypothesis: ReadonlyMap<HypothesisId, number>;
}): RankedCollectionGap[] {
  const gaps: RankedCollectionGap[] = [];
  const seenSites = new Set<string>();

  const pH1 = input.posteriorsByHypothesis.get("H1_PREPARED_DEFENSE") ?? 0.25;
  const pH2 = input.posteriorsByHypothesis.get("H2_COORDINATED_AMBUSH") ?? 0.25;
  const pH3 = input.posteriorsByHypothesis.get("H3_DECEPTION_FEINT") ?? 0.25;
  const pH4 = input.posteriorsByHypothesis.get("H4_STALE_OR_VACANT") ?? 0.25;

  for (const claim of input.claims.filter((c) => c.kind === "ambush")) {
    if (seenSites.has(`ambush:${claim.siteKey}`)) continue;
    seenSites.add(`ambush:${claim.siteKey}`);
    const eig = simulateExpectedInfoGain(input.currentEntropy, pH2 + pH3, 0.88);
    gaps.push({
      id: `GAP-${claim.siteKey}-AMBUSH`,
      siteKey: claim.siteKey,
      siteLabel: claim.siteLabel,
      recommendedSensor: "EO_IR_UAV",
      expectedInfoGainBits: eig,
      resolvesHypotheses: ["H2_COORDINATED_AMBUSH", "H3_DECEPTION_FEINT"],
      summary: `[EIG +${eig.toFixed(2)} bits | EO/IR UAV] Sweep ${claim.siteLabel} before committing route — ambush warning rests on uncorroborated ${claim.vector} (${claim.sourceId}).`,
    });
  }

  for (const dec of input.deceptions.filter(
    (d) => d.whaleyClass === "DECOYING" && d.falsityScore >= 0.4,
  )) {
    if (seenSites.has(`decoy:${dec.siteKey}`)) continue;
    seenSites.add(`decoy:${dec.siteKey}`);
    const eig = simulateExpectedInfoGain(input.currentEntropy, pH3 + pH1, 0.84);
    gaps.push({
      id: `GAP-${dec.siteKey}-DECOY`,
      siteKey: dec.siteKey,
      siteLabel: dec.siteLabel,
      recommendedSensor: "EO_IR_UAV",
      expectedInfoGainBits: eig,
      resolvesHypotheses: ["H3_DECEPTION_FEINT", "H1_PREPARED_DEFENSE"],
      summary: `[EIG +${eig.toFixed(2)} bits | EO/IR PID] Visually PID emitter at ${dec.siteLabel} (Schubert falsity=${dec.falsityScore.toFixed(2)}, Whaley=${dec.whaleyClass}) — distinguish unmanned repeater from occupied CP.`,
    });
  }

  for (const conflict of input.conflicts) {
    if (
      conflict.class !== "presence_absence" &&
      conflict.class !== "uncorroborated"
    ) {
      continue;
    }
    if (seenSites.has(`conflict:${conflict.siteKey}`)) continue;
    seenSites.add(`conflict:${conflict.siteKey}`);
    const eig = simulateExpectedInfoGain(input.currentEntropy, pH1 + pH4, 0.8);
    gaps.push({
      id: `GAP-${conflict.siteKey}-FRICTION`,
      siteKey: conflict.siteKey,
      siteLabel: conflict.siteLabel,
      recommendedSensor: "GROUND_RECON",
      expectedInfoGainBits: eig,
      resolvesHypotheses: ["H1_PREPARED_DEFENSE", "H4_STALE_OR_VACANT"],
      summary: `[EIG +${eig.toFixed(2)} bits | GROUND RECON] Confirm occupancy at ${conflict.siteLabel} via standoff patrol or dedicated stare — ${conflict.left.vector} (${conflict.left.sourceId}) conflicts with cold ${conflict.right.vector}.`,
    });
  }

  for (const cluster of input.clusters) {
    if (
      cluster.hot &&
      cluster.vectors.includes("SIGINT") &&
      cluster.vectors.includes("GEOINT") &&
      !cluster.vectors.includes("HUMINT") &&
      !seenSites.has(`pid:${cluster.siteKey}`)
    ) {
      seenSites.add(`pid:${cluster.siteKey}`);
      const eig = simulateExpectedInfoGain(input.currentEntropy, pH1, 0.62);
      gaps.push({
        id: `GAP-${cluster.siteKey}-PID`,
        siteKey: cluster.siteKey,
        siteLabel: cluster.siteLabel,
        recommendedSensor: "GROUND_RECON",
        expectedInfoGainBits: eig,
        resolvesHypotheses: ["H1_PREPARED_DEFENSE"],
        summary: `[EIG +${eig.toFixed(2)} bits | EYES-ON PID] Establish ground observer eyes-on at ${cluster.siteLabel} — SIGINT/GEOINT converge, closing final positive-ID gate.`,
      });
    }
  }

  for (const claim of input.claims.filter((c) => c.kind === "civilian")) {
    if (seenSites.has(`civ:${claim.siteKey}`)) continue;
    seenSites.add(`civ:${claim.siteKey}`);
    const eig = simulateExpectedInfoGain(input.currentEntropy, 0.35, 0.72);
    gaps.push({
      id: `GAP-${claim.siteKey}-CIV`,
      siteKey: claim.siteKey,
      siteLabel: claim.siteLabel,
      recommendedSensor: "IMINT_PASS",
      expectedInfoGainBits: eig,
      resolvesHypotheses: ["H1_PREPARED_DEFENSE", "H4_STALE_OR_VACANT"],
      summary: `[EIG +${eig.toFixed(2)} bits | IMINT PASS] Track non-combatant density at ${claim.siteLabel} — collateral no-strike constraint active until corridor clears.`,
    });
  }

  return gaps.sort((a, b) => b.expectedInfoGainBits - a.expectedInfoGainBits);
}
