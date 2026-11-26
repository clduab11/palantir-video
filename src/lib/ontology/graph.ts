import { vacuousOpinion } from "@/lib/epistemics/subjective-logic";
import { eventIntegrityHash } from "@/lib/tise/lexicon";
import type {
  AchEvaluation,
  Claim,
  Cluster,
  ConflictEntry,
  DeceptionAssessment,
  DetectedEntity,
  OntologyGraph,
  OntologyLink,
  OntologyObject,
} from "@/lib/tise/types";

export function buildOntologyGraph(input: {
  clusters: readonly Cluster[];
  entities: readonly DetectedEntity[];
  claims: readonly Claim[];
  conflicts: readonly ConflictEntry[];
  deceptions: readonly DeceptionAssessment[];
  ach: AchEvaluation;
}): OntologyGraph {
  const objects: OntologyObject[] = [];
  const links: OntologyLink[] = [];
  const facilityIdBySite = new Map<string, string>();

  for (const cluster of input.clusters) {
    const isCivilianSite =
      cluster.noStrike &&
      !input.entities.some(
        (e) =>
          e.siteKey === cluster.siteKey &&
          e.kind !== "CELL_CLUSTER" &&
          e.corroborated,
      );

    const objId = `OBJ-FAC-${cluster.siteKey}`;
    facilityIdBySite.set(cluster.siteKey, objId);

    objects.push({
      id: objId,
      kind: isCivilianSite ? "CIVILIAN_ZONE" : "FACILITY",
      label: cluster.siteLabel,
      siteKey: cluster.siteKey,
      mgrs: cluster.cell100m,
      lat: cluster.centroid.lat,
      lon: cluster.centroid.lon,
      sidc: cluster.sidc,
      opinion: cluster.opinion,
      admiraltyCode: cluster.admiraltyCode,
      eventIds: cluster.events.map((ev) => ev.event_id),
      hashes: cluster.events.map(eventIntegrityHash),
    });
  }

  input.entities.forEach((entity, idx) => {
    const isEmitter = entity.kind === "ANTENNA" || entity.kind === "CELL_CLUSTER";
    const isCiv = entity.kind === "CELL_CLUSTER";
    const entId = `OBJ-ENT-${idx + 1}-${entity.kind}-${entity.siteKey}`;
    const parentCluster = input.clusters.find((c) => c.siteKey === entity.siteKey);

    const matchingClaims = input.claims.filter((c) => c.siteKey === entity.siteKey);

    objects.push({
      id: entId,
      kind: isCiv
        ? "CIVILIAN_ZONE"
        : isEmitter
          ? "EMITTER"
          : "WEAPON_SIGNATURE",
      label: `${entity.kind} @ ${entity.siteLabel}`,
      siteKey: entity.siteKey,
      mgrs: parentCluster?.cell100m ?? "UNKNOWN",
      lat: parentCluster?.centroid.lat ?? 0,
      lon: parentCluster?.centroid.lon ?? 0,
      sidc: entity.sidc,
      opinion: parentCluster?.opinion ?? entity.opinion,
      admiraltyCode: parentCluster?.admiraltyCode ?? "C3",
      eventIds: [...new Set(matchingClaims.map((c) => c.eventId))],
      hashes: [...new Set(matchingClaims.map((c) => c.integrityHash))],
    });

    const facId = facilityIdBySite.get(entity.siteKey);
    if (facId) {
      const spoofed = input.deceptions.some(
        (d) =>
          d.siteKey === entity.siteKey &&
          d.whaleyClass === "DECOYING" &&
          d.falsityScore >= 0.45,
      );
      links.push({
        id: `LNK-${entId}-${facId}`,
        fromId: entId,
        toId: facId,
        relation: spoofed ? "SPOOFS" : "CORROBORATES",
        weight: entity.confidence,
        detail: spoofed
          ? `${entity.kind} signature exhibits Whaley DECOYING dissonance against EO/thermal.`
          : `${entity.vectors.join("/")} signature reinforces ${entity.siteLabel}.`,
      });
    }
  });

  input.conflicts.forEach((conflict, idx) => {
    const facId = facilityIdBySite.get(conflict.siteKey);
    if (!facId) return;
    links.push({
      id: `LNK-CONF-${idx + 1}-${conflict.siteKey}`,
      fromId: facId,
      toId: facId,
      relation: conflict.class === "spoof" ? "SPOOFS" : "CONTRADICTS",
      weight: conflict.dempsterConflictK,
      detail: conflict.summary,
    });
  });

  const civZones = objects.filter((o) => o.kind === "CIVILIAN_ZONE");
  const hostileFacilities = objects.filter(
    (o) => o.kind === "FACILITY" && o.sidc.startsWith("SH"),
  );
  for (const civ of civZones) {
    for (const fac of hostileFacilities) {
      links.push({
        id: `LNK-NOSTRIKE-${civ.id}-${fac.id}`,
        fromId: civ.id,
        toId: fac.id,
        relation: "BLOCKS_STRIKE",
        weight: 1,
        detail: `Collateral density at ${civ.label} enforces no-strike gate on ${fac.label}.`,
      });
    }
  }

  for (const gap of input.ach.rankedGaps.slice(0, 4)) {
    const gapId = `OBJ-${gap.id}`;
    const targetFac = facilityIdBySite.get(gap.siteKey);
    const parentCluster = input.clusters.find((c) => c.siteKey === gap.siteKey);
    objects.push({
      id: gapId,
      kind: "COLLECTION_GAP",
      label: `${gap.recommendedSensor} -> ${gap.siteLabel}`,
      siteKey: gap.siteKey,
      mgrs: parentCluster?.cell100m ?? "AOI",
      lat: parentCluster?.centroid.lat ?? 0,
      lon: parentCluster?.centroid.lon ?? 0,
      sidc: "SUGPUCR---*****",
      opinion: vacuousOpinion(),
      admiraltyCode: "F6",
      eventIds: [],
      hashes: [],
    });
    if (targetFac) {
      links.push({
        id: `LNK-TASK-${gapId}-${targetFac}`,
        fromId: gapId,
        toId: targetFac,
        relation: "TASKS_COLLECTION",
        weight: gap.expectedInfoGainBits,
        detail: `Expected entropy reduction +${gap.expectedInfoGainBits.toFixed(2)} bits.`,
      });
    }
  }

  return { objects, links };
}
