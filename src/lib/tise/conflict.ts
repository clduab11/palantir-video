import {
  deriveDeceptionRisk,
} from "@/lib/epistemics/deception";
import {
  fuseSourceScopedOpinions,
  pairwiseDempsterConflict,
  trustDiscount,
  vacuousOpinion,
} from "@/lib/epistemics/subjective-logic";
import { buildAdmiraltyRating, type InfoCredibility } from "@/lib/interop/tradecraft";

import { eventAdmiralty } from "./lexicon";
import { assertNever } from "./never";
import type {
  Claim,
  Cluster,
  ConflictEntry,
  DeceptionAssessment,
  DeceptionRisk,
  Opinion,
  VectorType,
  WhaleyDeceptionClass,
} from "./types";

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function opposing(
  leftKind: Claim["kind"],
  rightKind: Claim["kind"],
): ConflictEntry["class"] | null {
  const pair = new Set([leftKind, rightKind]);
  if (pair.has("presence") && pair.has("absence")) return "presence_absence";
  if (pair.has("thermal_positive") && pair.has("thermal_none")) {
    return "presence_absence";
  }
  if (pair.has("em_active") && pair.has("thermal_none")) {
    return "em_without_physical";
  }
  if (pair.has("em_active") && pair.has("absence")) return "spoof";
  if (pair.has("em_active") && pair.has("decoy")) return "spoof";
  if (pair.has("movement") && pair.has("static_defense")) return null;
  return null;
}

function whaleyForConflictClass(
  klass: ConflictEntry["class"],
): WhaleyDeceptionClass {
  switch (klass) {
    case "spoof":
    case "em_without_physical":
      return "DECOYING";
    case "uncorroborated":
      return "INVENTING";
    case "presence_absence":
      return "MASKING";
    default:
      return assertNever(klass, "conflict class");
  }
}

export function buildConflicts(claims: readonly Claim[]): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const left = claims[i];
      const right = claims[j];
      if (!left || !right) continue;
      if (left.siteKey !== right.siteKey) continue;
      if (left.eventId === right.eventId) continue;
      if (left.vector === right.vector && left.kind === right.kind) continue;

      const klass = opposing(left.kind, right.kind);
      if (!klass) continue;

      const key = [left.siteKey, klass, left.eventId, right.eventId]
        .sort()
        .join(":");
      if (seen.has(key)) continue;
      seen.add(key);

      conflicts.push({
        landmark: left.landmark,
        siteKey: left.siteKey,
        siteLabel: left.siteLabel,
        class: klass,
        left,
        right,
        dempsterConflictK: pairwiseDempsterConflict(left.opinion, right.opinion),
        whaleyClass: whaleyForConflictClass(klass),
        summary: conflictSummary(left, right, klass),
      });
    }
  }

  const bySite = new Map<string, Claim[]>();
  for (const claim of claims) {
    const list = bySite.get(claim.siteKey) ?? [];
    list.push(claim);
    bySite.set(claim.siteKey, list);
  }

  for (const [siteKey, siteClaims] of bySite) {
    const humintPresence = siteClaims.filter(
      (claim) =>
        claim.vector === "HUMINT" &&
        (claim.kind === "presence" || claim.kind === "ambush"),
    );
    const physical = siteClaims.filter(
      (claim) =>
        (claim.vector === "SIGINT" || claim.vector === "GEOINT") &&
        (claim.kind === "presence" ||
          claim.kind === "thermal_positive" ||
          claim.kind === "em_active" ||
          claim.kind === "static_defense"),
    );
    if (humintPresence.length > 0 && physical.length === 0) {
      const left = humintPresence[0];
      if (!left) continue;
      const right =
        siteClaims.find(
          (claim) => claim.vector !== "HUMINT" && claim.kind === "absence",
        ) ?? siteClaims.find((claim) => claim.vector !== "HUMINT");
      if (!right) {
        conflicts.push({
          landmark: left.landmark,
          siteKey: left.siteKey,
          siteLabel: left.siteLabel,
          class: "uncorroborated",
          left,
          right: left,
          dempsterConflictK: left.opinion.u * 0.5,
          whaleyClass: "INVENTING",
          summary: `HUMINT (${left.sourceId}) places activity at ${left.siteLabel} with no SIGINT/GEOINT corroboration.`,
        });
        continue;
      }
      const key = `uncorroborated:${siteKey}:${left.eventId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({
        landmark: left.landmark,
        siteKey: left.siteKey,
        siteLabel: left.siteLabel,
        class: "uncorroborated",
        left,
        right,
        dempsterConflictK: pairwiseDempsterConflict(left.opinion, right.opinion),
        whaleyClass: "INVENTING",
        summary: `HUMINT (${left.sourceId}) contradicts ${right.vector} (${right.sourceId}) at ${left.siteLabel}.`,
      });
    }
  }

  const unique: ConflictEntry[] = [];
  const seenSummary = new Set<string>();
  for (const conflict of conflicts) {
    if (seenSummary.has(conflict.summary)) continue;
    seenSummary.add(conflict.summary);
    unique.push(conflict);
  }
  return unique;
}

function isPositiveClaim(claim: Claim): boolean {
  return (
    claim.kind === "presence" ||
    claim.kind === "thermal_positive" ||
    claim.kind === "em_active" ||
    claim.kind === "ambush"
  );
}

function conflictSummary(
  left: Claim,
  right: Claim,
  klass: ConflictEntry["class"],
): string {
  const site = left.siteLabel;
  const positive = isPositiveClaim(left) ? left : right;
  const negative = isPositiveClaim(left) ? right : left;
  switch (klass) {
    case "presence_absence":
      return `${positive.vector} (${positive.sourceId}) reports presence at ${site}; ${negative.vector} (${negative.sourceId}) reports absence/cold.`;
    case "em_without_physical":
      return `${positive.vector} EM at ${site} has no matching GEOINT thermal/movement.`;
    case "spoof":
      return `High-confidence EM at ${site} tagged as possible spoof/decoy versus physical scan.`;
    case "uncorroborated":
      return `HUMINT at ${site} is uncorroborated across other vectors.`;
    default:
      return assertNever(klass, "conflict class");
  }
}

export function deceptionRisk(
  conflicts: readonly ConflictEntry[],
  claims: readonly Claim[],
  assessments: readonly DeceptionAssessment[] = [],
): DeceptionRisk {
  return deriveDeceptionRisk(conflicts, assessments, claims);
}

function corroborationBonus(vectors: VectorType[]): number {
  const set = new Set(vectors);
  if (set.has("SIGINT") && set.has("GEOINT") && set.has("HUMINT")) return 0.16;
  if (set.has("SIGINT") && set.has("GEOINT")) return 0.12;
  if (set.has("HUMINT") && (set.has("SIGINT") || set.has("GEOINT"))) return 0.08;
  return 0;
}

export function evaluateClusterEpistemics(input: {
  cluster: Cluster;
  claims: readonly Claim[];
  conflicts: readonly ConflictEntry[];
  deceptions: readonly DeceptionAssessment[];
  now: Date;
  staleMs: number;
}): Cluster {
  const { cluster, claims, conflicts, deceptions, now, staleMs } = input;
  const falsityByEvent = new Map(
    deceptions.map((d) => [d.eventId, d.falsityScore]),
  );

  const memberIds = new Set(cluster.events.map((ev) => ev.event_id));
  const clusterClaims = claims.filter(
    (c) => memberIds.has(c.eventId) && c.siteKey === cluster.siteKey,
  );
  const nonCivilianClaims = clusterClaims.filter((c) => c.kind !== "civilian");

  const discountedItems = nonCivilianClaims.map((claim) => {
    const falsity = falsityByEvent.get(claim.eventId) ?? 0;
    const discounted =
      falsity > 0.05 ? trustDiscount(claim.opinion, 1 - 0.75 * falsity) : claim.opinion;
    return { sourceId: claim.sourceId, opinion: discounted };
  });

  const fusedOpinion: Opinion =
    discountedItems.length > 0
      ? fuseSourceScopedOpinions(discountedItems)
      : vacuousOpinion();

  const siteConflicts = conflicts.filter((c) => c.siteKey === cluster.siteKey);
  const spoofHit =
    siteConflicts.some(
      (c) => c.class === "spoof" || c.class === "em_without_physical",
    ) ||
    deceptions.some(
      (d) =>
        d.siteKey === cluster.siteKey &&
        d.whaleyClass === "DECOYING" &&
        d.falsityScore >= 0.5,
    );

  const staleRatio =
    cluster.events.length === 0
      ? 0
      : cluster.events.filter(
          (ev) => now.getTime() - Date.parse(ev.timestamp) > staleMs,
        ).length / cluster.events.length;

  const frictionPenalty = Math.min(0.32, siteConflicts.length * 0.09);
  const decoyPenalty = spoofHit ? 0.22 : 0;

  const hasCivilianOnly =
    clusterClaims.length > 0 &&
    nonCivilianClaims.length === 0 &&
    clusterClaims.every((c) => c.kind === "civilian");

  const baseSignal = hasCivilianOnly
    ? clusterClaims.reduce((s, c) => s + c.confidence, 0) / clusterClaims.length * 0.72
    : fusedOpinion.b + 0.35 * (1 - fusedOpinion.u) * fusedOpinion.projected;

  const veracity = clamp(
    baseSignal +
      corroborationBonus(cluster.vectors) -
      frictionPenalty -
      decoyPenalty -
      staleRatio * 0.18,
  );

  const noStrike = claims.some(
    (c) => c.siteKey === cluster.siteKey && c.kind === "civilian" && c.confidence >= 0.55,
  );

  const bestReliability =
    cluster.events
      .map((ev) => eventAdmiralty(ev).reliability)
      .sort()[0] ?? "F";
  const credibility: InfoCredibility = spoofHit
    ? 5
    : cluster.vectors.length >= 2 && veracity >= 0.7
      ? 1
      : veracity >= 0.55
        ? 2
        : siteConflicts.length > 0
          ? 4
          : 3;
  const admiraltyCode = buildAdmiraltyRating(bestReliability, credibility).code;

  let sidc = "SUGPUCI---*****";
  let cotType = "a-u-G-U-C";
  if (noStrike && nonCivilianClaims.length === 0) {
    sidc = "SNGPUC----*****";
    cotType = "a-n-G-U-C";
  } else if (spoofHit) {
    sidc = "SJPGPEES--*****";
    cotType = "a-j-G-E-S";
  } else if (veracity >= 0.65 && cluster.vectors.length >= 2) {
    sidc = "SHGPUCI---*****";
    cotType = "a-h-G-U-C-I";
  } else {
    sidc = "SSGPUCI---*****";
    cotType = "a-s-G-U-C-I";
  }

  return {
    ...cluster,
    veracity,
    opinion: fusedOpinion,
    admiraltyCode,
    sidc,
    cotType,
    noStrike,
  };
}
