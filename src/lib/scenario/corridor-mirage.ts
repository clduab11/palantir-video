import type { TiseEvent } from "@/lib/tise";

function isoMinutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/**
 * Fictional canalized approach. A spoofed emitter and a planted walk-in
 * both point the QRF into an overpass fire sack. Training data only.
 */
export function corridorMirageScenario(now = new Date()): TiseEvent[] {
  return [
    {
      event_id: "11aa1111-1111-4111-8111-111111111111",
      timestamp: isoMinutesAgo(now, 11),
      vector_type: "HUMINT",
      source_id: "WALK-IN-4",
      location: {
        mgrs: "18S UJ 23120 06210",
        description: "Overpass south abutment",
      },
      payload:
        "Walk-in claims the QRF will be hit at the Overpass if they push the rail depot. Ambush language, L-shaped fire sack. Source was not on the ground.",
      confidence_score: 0.46,
      provenance: "HUMINT WALK-IN-4 / unverified / second debrief CM-12",
      perceived_threat_level: "HIGH",
      source_reliability: "D",
      info_credibility: 4,
    },
    {
      event_id: "22bb2222-2222-4222-8222-222222222222",
      timestamp: isoMinutesAgo(now, 8),
      vector_type: "SIGINT",
      source_id: "SPOOF-NET-2",
      location: {
        mgrs: "18S UJ 23125 06218",
        description: "Overpass",
      },
      payload:
        "High-duty-cycle VHF at the Overpass. Signature matches a known decoy repeater. Traffic explicitly cues an ambush on any force crossing the span. No corresponding motion on the cut.",
      confidence_score: 0.9,
      provenance: "SIGINT SPOOF-NET-2 / library hit DECOY-RPTR-9",
      perceived_threat_level: "CRITICAL",
      source_reliability: "B",
      info_credibility: 5,
    },
    {
      event_id: "33cc3333-3333-4333-8333-333333333333",
      timestamp: isoMinutesAgo(now, 6),
      vector_type: "GEOINT",
      source_id: "UAV-EO-11",
      location: {
        mgrs: "18S UJ 23120 06210",
        description: "Overpass",
      },
      payload:
        "Overpass deck and abutments: no personnel, no thermal, parked van with an antenna. Courtyard-style empty span.",
      confidence_score: 0.84,
      provenance: "GEOINT UAV-EO-11 / orbit 3 / NIIRS 6 still",
      perceived_threat_level: "MEDIUM",
      source_reliability: "A",
      info_credibility: 2,
    },
    {
      event_id: "44dd4444-4444-4444-8444-444444444444",
      timestamp: isoMinutesAgo(now, 5),
      vector_type: "GEOINT",
      source_id: "UAV-THM-11",
      location: {
        mgrs: "18S UJ 22840 06490",
        description: "Rail depot east wall",
      },
      payload:
        "Thermal: heat bloom and bodies along the rail depot east wall, off the advertised approach. Sandbags and a firing pit. This is not on the Overpass.",
      confidence_score: 0.81,
      provenance: "GEOINT UAV-THM-11 / orbit 3 / WESCAM-MX15",
      perceived_threat_level: "HIGH",
      source_reliability: "A",
      info_credibility: 2,
    },
    {
      event_id: "55ee5555-5555-4555-8555-555555555555",
      timestamp: isoMinutesAgo(now, 4),
      vector_type: "SIGINT",
      source_id: "ELINT-31",
      location: {
        mgrs: "18S UJ 22840 06490",
        description: "Rail depot",
      },
      payload:
        "Short RPK-pattern burst on a separate net at the rail depot. Low duty cycle, consistent with a gun team waiting off-axis.",
      confidence_score: 0.77,
      provenance: "SIGINT ELINT-31 / DF cut 2",
      perceived_threat_level: "HIGH",
      source_reliability: "B",
      info_credibility: 2,
    },
    {
      event_id: "66ff6666-6666-4666-8666-666666666666",
      timestamp: isoMinutesAgo(now, 3),
      vector_type: "HUMINT",
      source_id: "RECON-2",
      location: {
        mgrs: "18S UJ 23130 06200",
        description: "Overpass",
      },
      payload:
        "Eyes-on recon confirms the Overpass lure: if the column crosses, it will be hit from the rail depot flank. Ambush geometry, not a fight on the span itself.",
      confidence_score: 0.8,
      provenance: "HUMINT RECON-2 / EYES-ON / JTAC scratch log CM-19",
      perceived_threat_level: "CRITICAL",
      source_reliability: "B",
      info_credibility: 2,
    },
  ];
}

export const CORRIDOR_MIRAGE_META = {
  id: "corridor-mirage",
  name: "Corridor Mirage",
  classification: "TRAINING INSTRUMENT // FICTIONAL AOI",
  description:
    "A decoy repeater and a planted walk-in both advertise an ambush on the overpass while the real gun team waits at the rail depot.",
  expectedPosture: "WITHDRAW",
} as const;
