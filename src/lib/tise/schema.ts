import { z } from "zod";

import {
  INFO_CREDIBILITY_GRADES,
  SOURCE_RELIABILITY_GRADES,
  type InfoCredibility,
} from "@/lib/interop/tradecraft";
import { findSecretShapedField, formatSecretPath } from "@/lib/policy/secret-guard";

import { latLonToMgrs } from "./mgrs";
import { THREAT_LEVELS, VECTOR_TYPES, type TiseEvent } from "./types";

const missingField = (key: string, data: unknown): boolean => {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return true;
  }
  return !(key in data);
};

export const TiseLocationSchema = z
  .object({
    mgrs: z.string().trim().optional(),
    description: z.string().trim().min(1, "Location description is required"),
    lat: z.number().min(-80).max(84).optional(),
    lon: z.number().min(-180).max(180).optional(),
  })
  .transform((loc, ctx) => {
    const directMgrs = loc.mgrs?.trim() ?? "";
    if (directMgrs.length >= 5) {
      return {
        mgrs: directMgrs,
        description: loc.description,
        ...(loc.lat !== undefined ? { lat: loc.lat } : {}),
        ...(loc.lon !== undefined ? { lon: loc.lon } : {}),
      };
    }
    if (loc.lat !== undefined && loc.lon !== undefined) {
      const converted = latLonToMgrs(loc.lat, loc.lon, 5);
      if (converted) {
        return {
          mgrs: converted,
          description: loc.description,
          lat: loc.lat,
          lon: loc.lon,
        };
      }
    }
    ctx.addIssue({
      code: "custom",
      path: ["mgrs"],
      message: "MGRS (or valid WGS84 lat/lon) is required",
    });
    return z.NEVER;
  });

const InfoCredibilitySchema = z
  .union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ])
  .refine((val): val is InfoCredibility =>
    (INFO_CREDIBILITY_GRADES as readonly number[]).includes(val),
  );

export const TiseEventSchema = z
  .object({
    event_id: z.string().trim().min(1, "event_id is required"),
    timestamp: z
      .string()
      .trim()
      .min(1, "timestamp is required")
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "timestamp must be ISO-8601",
      }),
    vector_type: z.enum(VECTOR_TYPES),
    source_id: z.string().trim().min(1, "source_id is required"),
    location: TiseLocationSchema,
    payload: z.string().trim().min(1, "payload is required"),
    confidence_score: z
      .number({ error: "confidence_score must be a number 0..1" })
      .min(0)
      .max(1),
    provenance: z.string().trim().min(1, "provenance is required"),
    perceived_threat_level: z.enum(THREAT_LEVELS),
    source_reliability: z.enum(SOURCE_RELIABILITY_GRADES).optional(),
    info_credibility: InfoCredibilitySchema.optional(),
    integrity_hash: z.string().trim().min(1).optional(),
  })
  .superRefine((event, ctx) => {
    if (!event.provenance) {
      ctx.addIssue({
        code: "custom",
        path: ["provenance"],
        message: "REJECTED: missing provenance",
      });
    }
    if (
      typeof event.confidence_score !== "number" ||
      Number.isNaN(event.confidence_score)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["confidence_score"],
        message: "REJECTED: missing confidence_score",
      });
    }
  });

export type ParsedEvent =
  | { ok: true; event: TiseEvent }
  | { ok: false; reason: string; missing: string[] };

export function parseTiseEvent(input: unknown): ParsedEvent {
  const secretHit = findSecretShapedField(input);
  if (secretHit) {
    const eventId =
      input !== null &&
      typeof input === "object" &&
      "event_id" in input &&
      typeof input.event_id === "string"
        ? input.event_id
        : undefined;
    return {
      ok: false,
      reason: `REJECTED: secret-shaped ${secretHit.kind} at ${formatSecretPath(secretHit.path)}${
        eventId ? ` (${eventId})` : ""
      } — credentials cannot ride event envelopes`,
      missing: [],
    };
  }

  const missing: string[] = [];
  if (missingField("provenance", input)) missing.push("provenance");
  if (missingField("confidence_score", input)) missing.push("confidence_score");

  if (missing.length > 0) {
    const eventId =
      input !== null &&
      typeof input === "object" &&
      "event_id" in input &&
      typeof input.event_id === "string"
        ? input.event_id
        : undefined;
    return {
      ok: false,
      reason: `REJECTED: missing required field(s) ${missing.join(", ")}${
        eventId ? ` (${eventId})` : ""
      }`,
      missing,
    };
  }

  const parsed = TiseEventSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: issue
        ? `${issue.path.join(".") || "event"}: ${issue.message}`
        : "Invalid TISE event",
      missing: [],
    };
  }

  return { ok: true, event: parsed.data };
}

export function parseEventStream(input: unknown): {
  candidates: unknown[];
  envelopeError?: string;
} {
  const secretHit = findSecretShapedField(input);
  if (secretHit) {
    return {
      candidates: [],
      envelopeError: `REJECTED: secret-shaped ${secretHit.kind} at ${formatSecretPath(secretHit.path)} — credentials cannot ride event envelopes`,
    };
  }

  if (Array.isArray(input)) {
    return { candidates: input };
  }
  if (input !== null && typeof input === "object") {
    if ("events" in input && Array.isArray(input.events)) {
      return { candidates: input.events };
    }
    if ("event_id" in input || "provenance" in input) {
      return { candidates: [input] };
    }
  }
  return {
    candidates: [],
    envelopeError:
      "Input must be a TISE event, an array of events, or { events: TiseEvent[] }",
  };
}
