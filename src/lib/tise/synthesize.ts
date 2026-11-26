import {
  deriveAnalyticConfidence,
  icd203LikelihoodTerm,
} from "@/lib/interop/tradecraft";

import { deceptionRisk } from "./conflict";
import { entityLabel, eventAdmiralty, eventIntegrityHash } from "./lexicon";
import { parseMgrs } from "./mgrs";
import type {
  AchEvaluation,
  Claim,
  Cluster,
  ConflictEntry,
  DeceptionAssessment,
  DetectedEntity,
  EngineOptions,
  KineticTrigger,
  Posture,
  Sitrep,
  ThreatLevel,
  TiseEvent,
} from "./types";

const THREAT_RANK: Record<ThreatLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function maxThreat(levels: ThreatLevel[]): ThreatLevel {
  let best: ThreatLevel = "LOW";
  for (const level of levels) {
    if (THREAT_RANK[level] > THREAT_RANK[best]) best = level;
  }
  return best;
}

function threatFromVeracity(
  perceived: ThreatLevel,
  veracity: number,
  deception: ReturnType<typeof deceptionRisk>,
): ThreatLevel {
  if (deception === "HIGH" && perceived === "CRITICAL") return "HIGH";
  if (veracity < 0.45 && perceived === "CRITICAL") return "HIGH";
  if (veracity < 0.35) {
    if (perceived === "CRITICAL") return "MEDIUM";
    if (perceived === "HIGH") return "MEDIUM";
  }
  return perceived;
}

function entityLine(entity: DetectedEntity): string {
  const status = entity.corroborated ? "confirmed" : "suspected";
  const cite = entity.citations.slice(0, 2).join(" ");
  return `${status} ${entityLabel(entity.kind)} at ${entity.siteLabel} (p=${entity.confidence.toFixed(2)}, vectors=${entity.vectors.join("/")}) ${cite}`.trim();
}

function enemyPosture(
  entities: readonly DetectedEntity[],
  conflicts: readonly ConflictEntry[],
  claims: readonly Claim[],
  deceptions: readonly DeceptionAssessment[],
): string {
  const parts: string[] = [];

  const fortifiedSites = [
    ...new Set(
      entities
        .filter(
          (entity) =>
            entity.corroborated &&
            (entity.kind === "SANDBAGS" ||
              entity.kind === "RPK" ||
              entity.kind === "PKM" ||
              entity.kind === "DSHK" ||
              entity.kind === "MORTAR" ||
              entity.kind === "HEAVY_WEAPONS"),
        )
        .map((entity) => entity.siteLabel),
    ),
  ];
  if (fortifiedSites.length > 0) {
    parts.push(`Defensive/Embedded at ${fortifiedSites.join(", ")}`);
  }

  const decoySites = [
    ...new Set(
      deceptions
        .filter(
          (d) =>
            (d.whaleyClass === "DECOYING" || d.whaleyClass === "MIMICKING") &&
            d.falsityScore >= 0.4,
        )
        .map((d) => d.siteLabel),
    ),
  ];
  if (decoySites.length > 0) {
    parts.push(`Decoy/Deceptive EM at ${decoySites.join(", ")}`);
  }

  const contestedSites = [
    ...new Set(
      conflicts
        .filter(
          (conflict) =>
            conflict.class === "uncorroborated" ||
            conflict.class === "presence_absence",
        )
        .map((conflict) => conflict.siteLabel)
        .filter((label) => !fortifiedSites.includes(label) && !decoySites.includes(label)),
    ),
  ];
  if (contestedSites.length > 0) {
    parts.push(`${contestedSites.join(", ")} occupancy UNVERIFIED`);
  }

  const ambushClaims = claims.filter((claim) => claim.kind === "ambush");
  if (ambushClaims.length > 0) {
    const ambushSites = [...new Set(ambushClaims.map((c) => c.siteLabel))];
    const multiAmbush =
      new Set(ambushClaims.map((c) => c.vector)).size >= 2;
    parts.push(
      multiAmbush
        ? `Corroborated ambush geometry at ${ambushSites.join(", ")}`
        : `Possible ambush geometry at ${ambushSites.join(", ")} (single-vector)`,
    );
  }

  const moveClaims = claims.filter((claim) => claim.kind === "movement");
  if (moveClaims.length > 0) {
    parts.push(`Mobile/Infiltrating activity noted (${moveClaims[0]?.siteLabel})`);
  }

  return parts.length > 0 ? parts.join("; ") : "Insufficient posture evidence";
}

function buildTriggers(
  entities: readonly DetectedEntity[],
  claims: readonly Claim[],
  clusters: readonly Cluster[],
  deceptions: readonly DeceptionAssessment[],
): KineticTrigger[] {
  const hasManpads = entities.some((entity) => entity.kind === "MANPADS");
  const primaryKinetic = clusters.find(
    (c) => c.hot && c.vectors.length >= 2 && !c.noStrike,
  );
  const heavyWeaponPresent = entities.some(
    (entity) =>
      entity.kind === "RPK" ||
      entity.kind === "PKM" ||
      entity.kind === "DSHK" ||
      entity.kind === "MORTAR",
  );
  const decoyAssessment = deceptions.find(
    (d) => d.whaleyClass === "DECOYING" && d.falsityScore >= 0.4,
  );
  const ambushClaim = claims.find((claim) => claim.kind === "ambush");
  const civilianClaim = claims.find((claim) => claim.kind === "civilian");

  const triggers: KineticTrigger[] = [
    {
      condition:
        "If MANPADS-type RF signature is detected anywhere in the 1km AOI",
      action:
        "Immediate air hold. Rotary-wing stays below masking terrain until emitter is localized.",
      armed: hasManpads,
    },
    {
      condition: primaryKinetic
        ? `If additional crew-served weapon RF (PKM/DShK/mortar) joins the ${primaryKinetic.siteLabel} net`
        : "If multi-vector crew-served weapon signatures converge on a fortified structure",
      action: primaryKinetic
        ? `Treat ${primaryKinetic.siteLabel} as a prepared fighting position. Isolate flanks; do not advance down canalized avenues.`
        : "Upgrade structure to prepared fighting position and establish standoff containment.",
      armed: heavyWeaponPresent,
    },
  ];

  if (decoyAssessment) {
    triggers.push({
      condition: `If GEOINT confirms armed personnel at ${decoyAssessment.siteLabel} coincident with the RF emitter`,
      action:
        "Prior Whaley DECOYING assessment is VOID. Re-score cluster veracity and re-task overhead EO/IR.",
      armed: true,
    });
  } else {
    triggers.push({
      condition:
        "If high-duty-cycle VHF/UHF appears without corresponding thermal or EO motion",
      action:
        "Classify emitter as suspected decoy repeater (STANAG credibility 5); withhold fire and task EO PID.",
      armed: false,
    });
  }

  if (ambushClaim) {
    triggers.push({
      condition: `If SIGINT or GEOINT detects movement at ${ambushClaim.siteLabel} coincident with QRF maneuver`,
      action:
        "Abort approach immediately. Assume L-shaped fire sack, break contact, and call second UAV pass.",
      armed: true,
    });
  }

  if (civilianClaim) {
    triggers.push({
      condition: `If non-combatant density at ${civilianClaim.siteLabel} disperses while hostile net stays active`,
      action:
        "Re-verify collateral no-strike overlay via live IMINT before any kinetic posture escalation.",
      armed: true,
    });
  }

  return triggers;
}

function recommendPosture(input: {
  threat: ThreatLevel;
  deception: ReturnType<typeof deceptionRisk>;
  entities: readonly DetectedEntity[];
  conflicts: readonly ConflictEntry[];
  claims: readonly Claim[];
  deceptions: readonly DeceptionAssessment[];
  ach: AchEvaluation;
  maxVeracity: number;
}): { posture: Posture; rationale: string } {
  const {
    threat,
    deception,
    entities,
    claims,
    deceptions,
    ach,
    maxVeracity,
  } = input;

  const civilians = claims.some(
    (claim) => claim.kind === "civilian" && claim.confidence >= 0.55,
  );
  const ambushClaims = claims.filter((claim) => claim.kind === "ambush");
  const ambushVectors = new Set(ambushClaims.map((c) => c.vector));

  const kineticCorroborated = entities.some(
    (entity) =>
      entity.corroborated &&
      (entity.kind === "RPK" ||
        entity.kind === "PKM" ||
        entity.kind === "DSHK" ||
        entity.kind === "MORTAR" ||
        entity.kind === "HEAVY_WEAPONS" ||
        entity.kind === "SANDBAGS" ||
        entity.kind === "INFANTRY"),
  );

  const coordinatedAmbushTrap =
    (ambushVectors.size >= 2 && deception !== "LOW") ||
    (ambushClaims.length >= 1 &&
      ach.leadingHypothesis === "H2_COORDINATED_AMBUSH" &&
      deceptions.filter((d) => d.falsityScore >= 0.42).length >= 2);

  if (coordinatedAmbushTrap) {
    return {
      posture: "WITHDRAW",
      rationale:
        "Coordinated ambush/bait geometry detected alongside active deception indicators. Break contact with the canalized approach and re-establish standoff.",
    };
  }

  const canStrike =
    kineticCorroborated &&
    deception === "LOW" &&
    !civilians &&
    ambushClaims.length === 0 &&
    maxVeracity >= 0.7 &&
    (threat === "HIGH" || threat === "CRITICAL");

  if (canStrike) {
    return {
      posture: "STRIKE",
      rationale:
        "Multi-vector corroborated kinetic target, low deception risk, and zero civilian collateral constraint in the AOI. Subject to human ActionPolicy grant.",
    };
  }

  if (
    kineticCorroborated &&
    (civilians || deception !== "LOW" || ambushClaims.length > 0)
  ) {
    const primarySite =
      entities.find((e) => e.corroborated && e.kind !== "ANTENNA")?.siteLabel ??
      "primary hot zone";
    return {
      posture: "MANEUVER",
      rationale: `${primarySite} is a corroborated fighting position, but ${[
        civilians ? "civilian collateral presence" : null,
        deception !== "LOW" ? `${deception.toLowerCase()} deception risk` : null,
        ambushClaims.length > 0 ? "unconfirmed ambush warning" : null,
      ]
        .filter(Boolean)
        .join(", ")} forbids STRIKE. Reposition, isolate, and task highest-EIG collection.`,
    };
  }

  if (threat === "LOW" || maxVeracity < 0.45) {
    return {
      posture: "HOLD",
      rationale:
        "Epistemic uncertainty dominates (thin or stale reporting). Hold position, maintain local security, and refuse to maneuver on unverified single-source claims.",
    };
  }

  return {
    posture: "HOLD",
    rationale:
      "Cross-vector friction remains unresolved. Hold in place until top-ranked verification gap closes.",
  };
}

function dataDecay(events: readonly TiseEvent[], now: Date, staleMs: number): string[] {
  const notes: string[] = [];
  for (const event of events) {
    const age = now.getTime() - Date.parse(event.timestamp);
    if (age <= staleMs) continue;
    const hours = age / 3_600_000;
    notes.push(
      `${event.vector_type} ${event.source_id} (${event.event_id.slice(0, 8)}) is ${hours.toFixed(1)}h old — tactical relevance decaying (${event.location.description}).`,
    );
  }
  if (notes.length === 0) {
    notes.push("No stale records in the current collection window.");
  }
  return notes;
}

function aoiFromEvents(events: readonly TiseEvent[]): string {
  const cells = new Set<string>();
  for (const event of events) {
    const parsed = parseMgrs(event.location.mgrs);
    if (parsed) cells.add(parsed.cell1km);
  }
  if (cells.size === 0) return "UNKNOWN";
  return [...cells].join(" / ");
}

function buildSourceEndnotes(events: readonly TiseEvent[]): string[] {
  return events.map((ev, idx) => {
    const adm = eventAdmiralty(ev);
    const hash = eventIntegrityHash(ev).slice(0, 19);
    return `[${idx + 1}] ${ev.source_id} (${ev.vector_type}, STANAG ${adm.code}) @ ${ev.timestamp} — ${ev.provenance} (${hash})`;
  });
}

export function synthesizeSitrep(input: {
  events: readonly TiseEvent[];
  clusters: readonly Cluster[];
  claims: readonly Claim[];
  conflicts: readonly ConflictEntry[];
  deceptions: readonly DeceptionAssessment[];
  ach: AchEvaluation;
  entities: readonly DetectedEntity[];
  now: Date;
  options: EngineOptions;
}): Sitrep {
  const staleMs = input.options.staleMs ?? 90 * 60 * 1000;
  const deception = deceptionRisk(
    input.conflicts,
    input.claims,
    input.deceptions,
  );
  const perceived = maxThreat(
    input.events.map((event) => event.perceived_threat_level),
  );
  const maxVeracity = input.clusters.reduce(
    (best, cluster) => Math.max(best, cluster.veracity),
    0,
  );
  const threat = threatFromVeracity(perceived, maxVeracity, deception);
  const { posture, rationale } = recommendPosture({
    threat,
    deception,
    entities: input.entities,
    conflicts: input.conflicts,
    claims: input.claims,
    deceptions: input.deceptions,
    ach: input.ach,
    maxVeracity,
  });

  const detectedEntities =
    input.entities.length > 0
      ? [...input.entities]
          .sort((a, b) => Number(b.corroborated) - Number(a.corroborated))
          .map(entityLine)
      : ["No combatant signatures survived triage."];

  const distinctVectors = new Set(input.events.map((e) => e.vector_type)).size;
  const meanUncertainty =
    input.clusters.length > 0
      ? input.clusters.reduce((s, c) => s + c.opinion.u, 0) / input.clusters.length
      : 1;

  const analyticConfidence = deriveAnalyticConfidence({
    uncertainty: meanUncertainty,
    vectorCount: distinctVectors,
    deceptionHigh: deception === "HIGH",
  });

  const leadHyp = input.ach.hypotheses[0];
  const likelihoodPhrase = icd203LikelihoodTerm(leadHyp?.posterior ?? 0.25);
  const estimativeAssessment = leadHyp
    ? `We assess ${leadHyp.label} is ${likelihoodPhrase} across the AOI. Analytic confidence is ${analyticConfidence}, resting on ${input.events.length} provenance-verified reports across ${distinctVectors} discipline(s) (Dempster conflict c0=${input.ach.conflictMassC0.toFixed(2)}, residual entropy H=${input.ach.entropyBits.toFixed(2)} bits).`
    : `Insufficient reporting to form an estimative assessment. Analytic confidence is LOW.`;

  const sitrepId = `TISE-${input.now.toISOString().replace(/[-:]/g, "").slice(0, 15)}`;

  const gapLines =
    input.ach.rankedGaps.length > 0
      ? input.ach.rankedGaps.map((g) => g.summary)
      : ["No critical verification gap declared — continue baseline ISR collection."];

  return {
    sitrepId,
    timestamp: input.now.toISOString(),
    aoi: aoiFromEvents(input.events),
    analyticConfidence,
    estimativeAssessment,
    threatSurface: {
      detectedEntities,
      threatLevel: threat,
      enemyPosture: enemyPosture(
        input.entities,
        input.conflicts,
        input.claims,
        input.deceptions,
      ),
    },
    friction: {
      conflictLog:
        input.conflicts.length > 0
          ? input.conflicts.map(
              (conflict) =>
                `${conflict.summary} [K=${conflict.dempsterConflictK.toFixed(2)} | Whaley=${conflict.whaleyClass}]`,
            )
          : ["No cross-vector contradiction in the current set."],
      deceptionRisk: deception,
      dataDecay: dataDecay(input.events, input.now, staleMs),
    },
    kineticTriggers: buildTriggers(
      input.entities,
      input.claims,
      input.clusters,
      input.deceptions,
    ),
    verificationGaps: gapLines,
    recommendedPosture: posture,
    postureRationale: rationale,
    sourceSummaryEndnotes: buildSourceEndnotes(input.events),
  };
}
