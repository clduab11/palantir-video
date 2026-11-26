import type { TiseEvent } from "@/lib/tise";

function isoMinutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/**
 * Fictional degraded link. Most reports are stale, thin, or rejected.
 * The engine is expected to hold rather than invent a threat.
 */
export function blackoutDdilScenario(now = new Date()): TiseEvent[] {
  return [
    {
      event_id: "01010101-0101-4101-8101-010101010101",
      timestamp: isoMinutesAgo(now, 360),
      vector_type: "HUMINT",
      source_id: "SOURCE_OLD",
      location: {
        mgrs: "18S UJ 25010 08010",
        description: "Water tower",
      },
      payload:
        "Six hours ago a passerby thought they saw men near the water tower. Unconfirmed. No weapons described.",
      confidence_score: 0.38,
      provenance: "HUMINT SOURCE_OLD / stale debrief / not on the ground",
      perceived_threat_level: "LOW",
      source_reliability: "D",
      info_credibility: 4,
    },
    {
      event_id: "02020202-0202-4202-8202-020202020202",
      timestamp: isoMinutesAgo(now, 300),
      vector_type: "SIGINT",
      source_id: "DF-STALE-1",
      location: {
        mgrs: "18S UJ 25220 08220",
        description: "Substation 4",
      },
      payload:
        "Weak burst near substation 4, five hours old. No demod. Possibly a maintenance radio.",
      confidence_score: 0.33,
      provenance: "SIGINT DF-STALE-1 / aged cut / unassigned receiver",
      perceived_threat_level: "LOW",
      source_reliability: "E",
      info_credibility: 6,
    },
    {
      event_id: "03030303-0303-4303-8303-030303030303",
      timestamp: isoMinutesAgo(now, 240),
      vector_type: "GEOINT",
      source_id: "UAV-LATE-1",
      location: {
        mgrs: "18S UJ 25010 08010",
        description: "Water tower",
      },
      payload:
        "Last good frame is four hours old. Water tower looks quiet. No thermal of note on that pass.",
      confidence_score: 0.41,
      provenance: "GEOINT UAV-LATE-1 / link lost after orbit 1",
      perceived_threat_level: "LOW",
      source_reliability: "C",
      info_credibility: 4,
    },
    {
      event_id: "04040404-0404-4404-8404-040404040404",
      timestamp: isoMinutesAgo(now, 20),
      vector_type: "SIGINT",
      source_id: "HASH-NOISE-9",
      location: {
        mgrs: "18S UJ 25500 08500",
        description: "Fringe cell",
      },
      payload: "Unidentified hash burst. No demod. Likely noise.",
      confidence_score: 0.11,
      provenance: "SIGINT HASH-NOISE-9 / unassigned receiver",
      perceived_threat_level: "LOW",
      source_reliability: "E",
      info_credibility: 6,
    },
    {
      event_id: "05050505-0505-4505-8505-050505050505",
      timestamp: isoMinutesAgo(now, 8),
      vector_type: "SIGINT",
      source_id: "HASH-NOISE-10",
      location: {
        mgrs: "18S UJ 25610 08610",
        description: "Second fringe cell",
      },
      payload: "Second unidentified hash. Likely noise. No callsign.",
      confidence_score: 0.14,
      provenance: "SIGINT HASH-NOISE-10 / unassigned receiver",
      perceived_threat_level: "LOW",
      source_reliability: "E",
      info_credibility: 6,
    },
  ];
}

export const BLACKOUT_REJECT = {
  event_id: "06060606-0606-4606-8606-060606060606",
  timestamp: "2026-11-26T14:00:00.000Z",
  vector_type: "HUMINT",
  source_id: "NO-PROVENANCE",
  location: { mgrs: "18S UJ 25010 08010", description: "Water tower" },
  payload: "A rumor without a source trail.",
  confidence_score: 0.9,
  perceived_threat_level: "CRITICAL",
};

export const BLACKOUT_DDIL_META = {
  id: "blackout-ddil",
  name: "Blackout DDIL",
  classification: "TRAINING INSTRUMENT // FICTIONAL AOI",
  description:
    "Denied link. Stale reports, two noise bursts, and one event that fails the provenance gate.",
  expectedPosture: "HOLD",
} as const;
