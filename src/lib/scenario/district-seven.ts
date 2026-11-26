import type { TiseEvent } from "@/lib/tise";

function isoMinutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/**
 * Fictional urban QRF training stream. Landmarks, grids, and sources are
 * invented. This is sample data for the instrument, not a live collection.
 */
export function districtSevenScenario(now = new Date()): TiseEvent[] {
  return [
    {
      event_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      timestamp: isoMinutesAgo(now, 240),
      vector_type: "HUMINT",
      source_id: "SOURCE_09",
      location: {
        mgrs: "18S UJ 23855 06840",
        description: "Building 12, second floor",
      },
      payload:
        "Informant places 6-8 armed personnel in Building 12, second floor. Heavy weapons mentioned. No names. Last seen four hours ago.",
      confidence_score: 0.62,
      provenance: "HUMINT SOURCE_09 / handler DET-41 / debrief log D7-441",
      perceived_threat_level: "MEDIUM",
    },
    {
      event_id: "0d5f3a2b-1c8e-4a77-9b21-6e4c8f0a12d3",
      timestamp: isoMinutesAgo(now, 12),
      vector_type: "GEOINT",
      source_id: "UAV-THM-04",
      location: {
        mgrs: "18S UJ 23481 06512",
        description: "Warehouse 7 loading dock",
      },
      payload:
        "Thermal: two heat signatures in Warehouse 7 loading dock. Building 12 still cold — no thermal, no movement. Market square dense civilian heat.",
      confidence_score: 0.81,
      provenance: "GEOINT UAV-THM-04 / orbit 14 / sensor WESCAM-MX15",
      perceived_threat_level: "MEDIUM",
    },
    {
      event_id: "a18b44c0-9e2d-4f01-8c55-2b9d77e1c4aa",
      timestamp: isoMinutesAgo(now, 9),
      vector_type: "SIGINT",
      source_id: "ELINT-17",
      location: {
        mgrs: "18S UJ 23481 06512",
        description: "Warehouse 7",
      },
      payload:
        "RPK-pattern burst radio, two signatures, Warehouse 7 net, high duty cycle. Callsigns unknown.",
      confidence_score: 0.88,
      provenance: "SIGINT ELINT-17 / DF cut 3 / collection task CT-77",
      perceived_threat_level: "HIGH",
    },
    {
      event_id: "b7e2c910-4a11-4d8f-93c0-1f6a2e8d55b0",
      timestamp: isoMinutesAgo(now, 8),
      vector_type: "SIGINT",
      source_id: "CEL-PING-22",
      location: {
        mgrs: "18S UJ 23690 06620",
        description: "Market square",
      },
      payload:
        "Cellular ping cluster, 14 devices, Market square. Mixed civilian pattern. No tactical radio in this cut.",
      confidence_score: 0.74,
      provenance: "SIGINT CEL-PING-22 / passive IMSI catcher tasking P-22",
      perceived_threat_level: "LOW",
    },
    {
      event_id: "c3d91e44-6b70-4c2a-af11-90e4b3c7d812",
      timestamp: isoMinutesAgo(now, 7),
      vector_type: "HUMINT",
      source_id: "PATROL-3",
      location: {
        mgrs: "18S UJ 23855 06840",
        description: "Building 12 approaches",
      },
      payload:
        "Local shopkeeper reports men moving from Building 12 toward Warehouse 7 twenty minutes ago. Unconfirmed. No weapons seen by the shopkeeper.",
      confidence_score: 0.51,
      provenance: "HUMINT PATROL-3 / walk-in / field notes FN-19",
      perceived_threat_level: "MEDIUM",
    },
    {
      event_id: "d4a10b28-8e55-41c3-9f60-77c1a2b3d4e5",
      timestamp: isoMinutesAgo(now, 6),
      vector_type: "SIGINT",
      source_id: "DRONE-EM-08",
      location: {
        mgrs: "18S UJ 23940 06980",
        description: "Mosque courtyard",
      },
      payload:
        "Strong VHF at Mosque courtyard. No corresponding UAV motion. Signature matches known decoy repeater profile. Confidence is in the RF match, not in occupancy.",
      confidence_score: 0.91,
      provenance: "SIGINT DRONE-EM-08 / UAV-EM payload / library hit DECOY-RPTR-3",
      perceived_threat_level: "HIGH",
    },
    {
      event_id: "e5b21c39-9f66-42d4-a071-88d2b3c4e5f6",
      timestamp: isoMinutesAgo(now, 5),
      vector_type: "GEOINT",
      source_id: "UAV-EO-04",
      location: {
        mgrs: "18S UJ 23940 06980",
        description: "Mosque courtyard",
      },
      payload:
        "Mosque courtyard: no personnel, parked van, possible antenna. No thermal of an armed group. Courtyard otherwise empty.",
      confidence_score: 0.84,
      provenance: "GEOINT UAV-EO-04 / orbit 14 / NIIRS 5 still",
      perceived_threat_level: "MEDIUM",
    },
    {
      event_id: "f6c32d4a-a077-43e5-b182-99e3c4d5f607",
      timestamp: isoMinutesAgo(now, 4),
      vector_type: "HUMINT",
      source_id: "SOURCE_09",
      location: {
        mgrs: "18S UJ 23120 06210",
        description: "Overpass",
      },
      payload:
        "Same source now claims QRF will be hit at the Overpass if they approach Warehouse 7. Ambush language. Source was not on the ground for this claim.",
      confidence_score: 0.47,
      provenance: "HUMINT SOURCE_09 / handler DET-41 / second debrief D7-442",
      perceived_threat_level: "HIGH",
    },
    {
      event_id: "07d43e5b-b188-44f6-c293-aa04d5e60718",
      timestamp: isoMinutesAgo(now, 3),
      vector_type: "SIGINT",
      source_id: "ELINT-17",
      location: {
        mgrs: "18S UJ 23485 06518",
        description: "Warehouse 7 roof",
      },
      payload:
        "Second RPK signature, same net, Warehouse 7 roof. Heavy weapons presence on the net.",
      confidence_score: 0.86,
      provenance: "SIGINT ELINT-17 / DF cut 4 / collection task CT-77",
      perceived_threat_level: "CRITICAL",
    },
    {
      event_id: "18e54f6c-c299-4507-d3a4-bb15e6f71829",
      timestamp: isoMinutesAgo(now, 2),
      vector_type: "GEOINT",
      source_id: "CHG-DET-01",
      location: {
        mgrs: "18S UJ 23481 06512",
        description: "Warehouse 7 roof",
      },
      payload:
        "Change detection: sandbags on Warehouse 7 roof since last pass 90 minutes ago. Civilian foot traffic at Market square unchanged.",
      confidence_score: 0.79,
      provenance: "GEOINT CHG-DET-01 / stereo pair T-90 / T-0",
      perceived_threat_level: "HIGH",
    },
    {
      event_id: "29f6507d-d3aa-4618-e4b5-cc26f708293a",
      timestamp: isoMinutesAgo(now, 1),
      vector_type: "SIGINT",
      source_id: "HASH-NOISE-1",
      location: {
        mgrs: "18S UJ 23010 06005",
        description: "Unidentified fringe cell",
      },
      payload: "Unidentified hash burst. No demod. Likely noise.",
      confidence_score: 0.12,
      provenance: "SIGINT HASH-NOISE-1 / unassigned receiver",
      perceived_threat_level: "LOW",
    },
    {
      event_id: "3a07618e-e4bb-4729-f5c6-dd3708193a4b",
      timestamp: isoMinutesAgo(now, 0),
      vector_type: "GEOINT",
      source_id: "UAV-THM-04",
      location: {
        mgrs: "18S UJ 23481 06512",
        description: "Warehouse 7 roof",
      },
      payload:
        "New heat bloom Warehouse 7 roof, 3-4 bodies. Building 12 still cold. Market square civilian heat unchanged.",
      confidence_score: 0.83,
      provenance: "GEOINT UAV-THM-04 / orbit 15 / sensor WESCAM-MX15",
      perceived_threat_level: "HIGH",
    },
  ];
}

export const SCENARIO_META = {
  id: "district-seven",
  name: "District Seven",
  classification: "TRAINING INSTRUMENT // FICTIONAL AOI",
  description:
    "Contested high-density block. Warehouse 7 is the real fighting position. Mosque courtyard EM is a decoy. Building 12 HUMINT is stale and cold on GEOINT. Market square is full of civilians.",
} as const;
