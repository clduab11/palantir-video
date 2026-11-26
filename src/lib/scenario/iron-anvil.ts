import type { TiseEvent } from "@/lib/tise";

function isoMinutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/**
 * Fictional evacuated industrial block. Three independent vectors agree on
 * a mortar pit and the yard is clear. Training data only.
 */
export function ironAnvilScenario(now = new Date()): TiseEvent[] {
  return [
    {
      event_id: "a1a1a1a1-1111-4111-8111-aaaaaaaaaaaa",
      timestamp: isoMinutesAgo(now, 9),
      vector_type: "GEOINT",
      source_id: "UAV-THM-20",
      location: {
        mgrs: "18S UJ 24110 07140",
        description: "Industrial yard firing pit",
      },
      payload:
        "Thermal: heat bloom and a mortar team in the industrial yard firing pit. Sandbags and a revetment. Tube is warm.",
      confidence_score: 0.91,
      provenance: "GEOINT UAV-THM-20 / orbit 2 / WESCAM-MX15 calibrated",
      perceived_threat_level: "CRITICAL",
      source_reliability: "A",
      info_credibility: 1,
    },
    {
      event_id: "b2b2b2b2-2222-4222-8222-bbbbbbbbbbbb",
      timestamp: isoMinutesAgo(now, 7),
      vector_type: "GEOINT",
      source_id: "CHG-DET-20",
      location: {
        mgrs: "18S UJ 24112 07142",
        description: "Industrial yard",
      },
      payload:
        "Change detection: new sandbags and a dug-in mortar pit in the industrial yard since the pass 40 minutes ago.",
      confidence_score: 0.86,
      provenance: "GEOINT CHG-DET-20 / stereo pair / NIIRS 6",
      perceived_threat_level: "HIGH",
      source_reliability: "A",
      info_credibility: 1,
    },
    {
      event_id: "c3c3c3c3-3333-4333-8333-cccccccccccc",
      timestamp: isoMinutesAgo(now, 6),
      vector_type: "SIGINT",
      source_id: "ELINT-44",
      location: {
        mgrs: "18S UJ 24110 07140",
        description: "Industrial yard",
      },
      payload:
        "Mortar fire-direction net, industrial yard. Short voice procedure, two stations, high confidence DF.",
      confidence_score: 0.89,
      provenance: "SIGINT ELINT-44 / DF cut 1 / collection task CT-90",
      perceived_threat_level: "CRITICAL",
      source_reliability: "B",
      info_credibility: 1,
    },
    {
      event_id: "d4d4d4d4-4444-4444-8444-dddddddddddd",
      timestamp: isoMinutesAgo(now, 4),
      vector_type: "HUMINT",
      source_id: "OBS-A-7",
      location: {
        mgrs: "18S UJ 24118 07135",
        description: "Industrial yard west berm",
      },
      payload:
        "Eyes-on: four-person mortar team working the industrial yard pit. Infantry with the tube. No bystanders on the berm.",
      confidence_score: 0.84,
      provenance: "HUMINT OBS-A-7 / EYES-ON / recon team RT-7",
      perceived_threat_level: "HIGH",
      source_reliability: "B",
      info_credibility: 2,
    },
    {
      event_id: "e5e5e5e5-5555-4555-8555-eeeeeeeeeeee",
      timestamp: isoMinutesAgo(now, 2),
      vector_type: "GEOINT",
      source_id: "UAV-EO-20",
      location: {
        mgrs: "18S UJ 24110 07140",
        description: "Industrial yard",
      },
      payload:
        "EO still: mortar tube, sandbags, and occupied firing pit in the industrial yard. Yard lanes are clear.",
      confidence_score: 0.88,
      provenance: "GEOINT UAV-EO-20 / orbit 2 / NIIRS 6",
      perceived_threat_level: "HIGH",
      source_reliability: "A",
      info_credibility: 1,
    },
  ];
}

export const IRON_ANVIL_META = {
  id: "iron-anvil",
  name: "Iron Anvil",
  classification: "TRAINING INSTRUMENT // FICTIONAL AOI",
  description:
    "Independent GEOINT, SIGINT, and eyes-on HUMINT converge on a mortar pit in a clear industrial yard.",
  expectedPosture: "STRIKE",
} as const;
