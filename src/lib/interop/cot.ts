import {
  buildDefaultTisePolicies,
  createAuditRecord,
  evaluatePolicy,
  type ApprovalGrant,
  type PolicyDecision,
  type ToolCallAuditRecord,
} from "@/lib/policy/action-policy";
import { eventIntegrityHash } from "@/lib/tise/lexicon";
import { localOrigin, toDisplayLatLon } from "@/lib/interop/training-chart";
import { parseMgrs } from "@/lib/tise/mgrs";
import type { Cluster, SynthesisResult } from "@/lib/tise/types";

export type CotExportMode = "awareness" | "nomination";

export type CotExportOutcome =
  | {
      ok: true;
      mode: CotExportMode;
      xml: string;
      eventCount: number;
      policyDecision: PolicyDecision;
      auditRecord: ToolCallAuditRecord;
      consumedGrant: ApprovalGrant | null;
    }
  | {
      ok: false;
      mode: CotExportMode;
      policyDecision: PolicyDecision;
      auditRecord: ToolCallAuditRecord;
    };

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cotEventForCluster(
  cluster: Cluster,
  result: SynthesisResult,
  mode: CotExportMode,
  grant: ApprovalGrant | null,
  display: { lat: number; lon: number },
): string {
  const nowIso = result.asOf;
  const staleIso = new Date(Date.parse(nowIso) + 15 * 60 * 1000).toISOString();
  const sampleMgrs = cluster.events[0]
    ? parseMgrs(cluster.events[0].location.mgrs)
    : null;
  const basePrecision = sampleMgrs?.precisionMeters ?? 100;
  const ce = Math.max(5, Math.round(basePrecision * (1 + 2 * cluster.opinion.u)));

  const cotType =
    mode === "nomination" &&
    result.sitrep.recommendedPosture === "STRIKE" &&
    !cluster.noStrike &&
    cluster.cotType.startsWith("a-h-")
      ? "b-m-p-s-p-i"
      : cluster.cotType;

  const hashes = cluster.events
    .map((ev) => eventIntegrityHash(ev).slice(0, 19))
    .join(",");

  const remarks = [
    `TISE ${result.sitrep.sitrepId}`,
    "Display datum, not a survey geocode. MGRS label is training geometry.",
    `Posture=${result.sitrep.recommendedPosture}`,
    `Site=${cluster.siteLabel}`,
    `STANAG=${cluster.admiraltyCode}`,
    `Veracity=${cluster.veracity.toFixed(2)}`,
    `Opinion=(b:${cluster.opinion.b.toFixed(2)},d:${cluster.opinion.d.toFixed(2)},u:${cluster.opinion.u.toFixed(2)})`,
    cluster.noStrike ? "NO_STRIKE_COLLATERAL=TRUE" : "NO_STRIKE_COLLATERAL=FALSE",
    `Provenance=${hashes}`,
  ].join(" | ");

  const approvalTag = grant
    ? `\n      <approval grantId="${escapeXml(grant.grantId)}" grantedBy="${escapeXml(grant.grantedBy)}" grantedAt="${escapeXml(grant.grantedAt)}" expiresAt="${escapeXml(grant.expiresAt)}"/>`
    : "";

  return [
    `  <event version="2.0" uid="${escapeXml(`TISE-${cluster.id}-${cluster.siteKey}`)}" type="${escapeXml(cotType)}" how="m-g" time="${escapeXml(nowIso)}" start="${escapeXml(nowIso)}" stale="${escapeXml(staleIso)}">`,
    `    <point lat="${display.lat.toFixed(6)}" lon="${display.lon.toFixed(6)}" hae="0.0" ce="${ce.toFixed(1)}" le="9999999.0"/>`,
    `    <detail>`,
    `      <contact callsign="${escapeXml(`TISE-${cluster.siteLabel.toUpperCase().slice(0, 18)}`)}"/>`,
    `      <precisionlocation geopointsrc="MGRS" altsrc="UNKNOWN"/>`,
    `      <tise mode="${escapeXml(mode)}" mgrs="${escapeXml(cluster.cell100m)}" veracity="${cluster.veracity.toFixed(3)}" admiralty="${escapeXml(cluster.admiraltyCode)}" noStrike="${cluster.noStrike}" posture="${escapeXml(result.sitrep.recommendedPosture)}"/>${approvalTag}`,
    `      <remarks>${escapeXml(remarks)}</remarks>`,
    `    </detail>`,
    `  </event>`,
  ].join("\n");
}

/**
 * Generates an ATAK / TAK Server Cursor-on-Target (CoT v2.0) XML bundle.
 * Strike target nomination packages ("nomination") are gated by ActionPolicy
 * and require a non-expired, unconsumed commander ApprovalGrant.
 */
export function exportCotXml(input: {
  synthesis: SynthesisResult;
  mode?: CotExportMode;
  approvalGrant?: ApprovalGrant | null;
  now?: Date;
}): CotExportOutcome {
  const mode = input.mode ?? "awareness";
  const now = input.now ?? new Date(input.synthesis.asOf);
  const requiresWriteGate = mode === "nomination";
  const toolName = requiresWriteGate
    ? "tise.export.cot.strike"
    : "tise.export.cot.awareness";
  const sideEffects = requiresWriteGate
    ? ["c2.cot_nomination"]
    : ["c2.cot_awareness"];

  const policies = buildDefaultTisePolicies(input.approvalGrant ?? null);
  const policyDecision = evaluatePolicy(
    policies,
    {
      toolName,
      classification: requiresWriteGate ? "write" : "read",
      requestedSideEffects: sideEffects,
      arguments: {
        sitrepId: input.synthesis.sitrep.sitrepId,
        posture: input.synthesis.sitrep.recommendedPosture,
        clusterCount: input.synthesis.clusters.length,
        mode,
      },
    },
    { now },
  );

  const auditRecord = createAuditRecord({
    toolName,
    decision: policyDecision,
    args: {
      sitrepId: input.synthesis.sitrep.sitrepId,
      mode,
      posture: input.synthesis.sitrep.recommendedPosture,
    },
    grantId: input.approvalGrant?.grantId ?? null,
    now,
  });

  if (policyDecision.decision !== "allow") {
    return {
      ok: false,
      mode,
      policyDecision,
      auditRecord,
    };
  }

  const consumedGrant: ApprovalGrant | null =
    requiresWriteGate && input.approvalGrant
      ? {
          ...input.approvalGrant,
          usedAt: now.toISOString(),
        }
      : null;

  const origin = localOrigin(
    input.synthesis.clusters.map((cluster) => ({
      lat: cluster.centroid.lat,
      lon: cluster.centroid.lon,
    })),
  );
  const eventsXml = input.synthesis.clusters
    .map((cluster) =>
      cotEventForCluster(
        cluster,
        input.synthesis,
        mode,
        consumedGrant,
        toDisplayLatLon(
          { lat: cluster.centroid.lat, lon: cluster.centroid.lon },
          origin,
        ),
      ),
    )
    .join("\n");

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- TISE-v1 Cursor-on-Target v2.0 Export | SITREP ${escapeXml(input.synthesis.sitrep.sitrepId)} | Mode: ${escapeXml(mode.toUpperCase())} -->`,
    `<events version="2.0" generator="TISE-v1" posture="${escapeXml(input.synthesis.sitrep.recommendedPosture)}" analyticConfidence="${escapeXml(input.synthesis.sitrep.analyticConfidence)}">`,
    eventsXml,
    `</events>`,
  ].join("\n");

  return {
    ok: true,
    mode,
    xml,
    eventCount: input.synthesis.clusters.length,
    policyDecision,
    auditRecord,
    consumedGrant,
  };
}
