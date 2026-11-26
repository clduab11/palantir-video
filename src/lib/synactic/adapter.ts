import { sha256Hex } from "@/lib/crypto/sha256";
import { findSecretShapedField } from "@/lib/policy/secret-guard";
import { latLonToMgrs, parseTiseEvent } from "@/lib/tise";
import type { ThreatLevel, TiseEvent, VectorType } from "@/lib/tise/types";
import { THREAT_LEVELS, VECTOR_TYPES } from "@/lib/tise/types";

/**
 * Verified shape of clduab11/the-synactic's SynacticEvent v1 envelope:
 * @see https://github.com/clduab11/the-synactic/blob/main/synactic/packages/contracts/src/event.ts
 */
export type SynacticEnvelope = {
  version: 1;
  id: string;
  type: string;
  timestamp: string;
  provenance: {
    sourceId: string;
    sourceUri: string;
    retrievedAt: string;
    integrityHash: string | null;
  };
  payload: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isSynacticEnvelope(value: unknown): value is SynacticEnvelope {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.id !== "string" || typeof value.type !== "string") {
    return false;
  }
  if (typeof value.timestamp !== "string") return false;
  if (!isRecord(value.provenance)) return false;
  if (typeof value.provenance.sourceId !== "string") return false;
  if (typeof value.provenance.sourceUri !== "string") return false;
  if (typeof value.payload !== "object" || value.payload === null) return false;
  if (findSecretShapedField(value.payload) !== null) return false;
  return true;
}

function asVector(value: unknown): VectorType | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  if ((VECTOR_TYPES as readonly string[]).includes(upper)) {
    return upper as VectorType;
  }
  if (
    upper.includes("SIG") ||
    upper.includes("ELINT") ||
    upper.includes("RF") ||
    upper.includes("ANOMAL") ||
    upper.includes("CONVERG")
  ) {
    return "SIGINT";
  }
  if (
    upper.includes("HUM") ||
    upper.includes("OSINT") ||
    upper.includes("REPORT") ||
    upper.includes("CONFLICT") ||
    upper.includes("UCDP") ||
    upper.includes("ACLED")
  ) {
    return "HUMINT";
  }
  if (
    upper.includes("GEO") ||
    upper.includes("IMINT") ||
    upper.includes("UAV") ||
    upper.includes("POPULATION") ||
    upper.includes("FIRMS") ||
    upper.includes("AIRSPACE")
  ) {
    return "GEOINT";
  }
  return null;
}

function asThreat(value: unknown): ThreatLevel | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  if ((THREAT_LEVELS as readonly string[]).includes(upper)) {
    return upper as ThreatLevel;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Map a SynacticEvent onto the TISE schema.
 * Invariant: confidence_score is NEVER invented. If the envelope carries no
 * grounded confidence/veracity metric, confidence_score is omitted so
 * parseTiseEvent rejects it loudly at the gate.
 */
export function synacticToTise(envelope: SynacticEnvelope): unknown {
  const payload = envelope.payload;
  const location = isRecord(payload.location) ? payload.location : payload;
  const lat =
    asNumber(location.lat) ??
    asNumber(location.latitude) ??
    asNumber(payload.lat) ??
    asNumber(payload.latitude);
  const lon =
    asNumber(location.lon) ??
    asNumber(location.lng) ??
    asNumber(location.longitude) ??
    asNumber(payload.lon) ??
    asNumber(payload.longitude);

  const directMgrs =
    asString(payload.mgrs) ??
    asString(location.mgrs) ??
    asString(payload.grid);
  const mgrs =
    directMgrs ?? (lat !== null && lon !== null ? latLonToMgrs(lat, lon, 5) ?? "" : "");

  const description =
    asString(payload.description) ??
    asString(location.description) ??
    asString(payload.locationName) ??
    asString(payload.place) ??
    asString(payload.country) ??
    envelope.type;

  const vector =
    asVector(payload.vector_type) ??
    asVector(payload.vector) ??
    asVector(payload.discipline) ??
    asVector(envelope.type) ??
    "HUMINT";

  const confidence =
    asNumber(payload.confidence_score) ??
    asNumber(payload.confidence) ??
    asNumber(payload.veracity);

  const threat =
    asThreat(payload.perceived_threat_level) ??
    asThreat(payload.threat) ??
    asThreat(payload.severity) ??
    "MEDIUM";

  const body =
    asString(payload.payload) ??
    asString(payload.summary) ??
    asString(payload.headline) ??
    asString(payload.text) ??
    JSON.stringify(payload);

  const computedHash =
    envelope.provenance.integrityHash ??
    `sha256:${sha256Hex(JSON.stringify(payload))}`;

  return {
    event_id: envelope.id,
    timestamp: envelope.timestamp,
    vector_type: vector,
    source_id: envelope.provenance.sourceId,
    location: {
      mgrs,
      description,
      ...(lat !== null ? { lat } : {}),
      ...(lon !== null ? { lon } : {}),
    },
    payload: body,
    ...(confidence === null ? {} : { confidence_score: confidence }),
    provenance: `${envelope.provenance.sourceId} ${envelope.provenance.sourceUri} retrieved ${envelope.provenance.retrievedAt} hash=${computedHash}`,
    perceived_threat_level: threat,
    integrity_hash: computedHash,
  };
}

export function wrapUpstreamRowAsSynacticEnvelope(input: {
  tool: string;
  index: number;
  row: Record<string, unknown>;
  sourceHost: string;
  now: Date;
}): SynacticEnvelope {
  const retrievedAt = input.now.toISOString();
  const rawHash = sha256Hex(JSON.stringify(input.row));
  const uuid = [
    rawHash.slice(0, 8),
    rawHash.slice(8, 12),
    `4${rawHash.slice(13, 16)}`,
    `8${rawHash.slice(17, 20)}`,
    rawHash.slice(20, 32),
  ].join("-");

  const timestamp =
    asString(input.row.timestamp) ??
    asString(input.row.date) ??
    asString(input.row.event_date) ??
    retrievedAt;

  return {
    version: 1,
    id: asString(input.row.id) ?? uuid,
    type: `synactic.${input.tool}`,
    timestamp: Number.isNaN(Date.parse(timestamp)) ? retrievedAt : timestamp,
    provenance: {
      sourceId: `synactic.${input.tool}`,
      sourceUri: `https://${input.sourceHost}/api/mcp#${input.tool}`,
      retrievedAt,
      integrityHash: `sha256:${rawHash}`,
    },
    payload: input.row,
  };
}

export function adaptInbound(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      isSynacticEnvelope(item) ? synacticToTise(item) : item,
    );
  }
  if (isRecord(raw) && Array.isArray(raw.events)) {
    return {
      ...raw,
      events: raw.events.map((item) =>
        isSynacticEnvelope(item) ? synacticToTise(item) : item,
      ),
    };
  }
  if (isSynacticEnvelope(raw)) return synacticToTise(raw);
  return raw;
}

export function validateAdapted(raw: unknown): TiseEvent | { error: string } {
  const adapted = isSynacticEnvelope(raw) ? synacticToTise(raw) : raw;
  const parsed = parseTiseEvent(adapted);
  if (!parsed.ok) return { error: parsed.reason };
  return parsed.event;
}
