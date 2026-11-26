import { describe, expect, it } from "vitest";

import { evaluateAch } from "@/lib/epistemics/ach";
import { normalizeOpinion } from "@/lib/epistemics/subjective-logic";
import { buildAdmiraltyRating } from "@/lib/interop/tradecraft";
import type { Claim } from "@/lib/tise/types";

const admiralty = buildAdmiraltyRating("B", 2);

function makeClaim(
  input: Pick<Claim, "eventId" | "kind" | "opinion"> & Partial<Claim>,
): Claim {
  return {
    vector: "HUMINT",
    sourceId: input.sourceId ?? input.eventId,
    landmark: "OVERPASS",
    siteKey: "OVERPASS",
    siteLabel: "Overpass",
    confidence: 0.8,
    admiralty,
    integrityHash: "sha256:test",
    excerpt: "test",
    ...input,
  };
}

describe("Heuer ACH expected information gain", () => {
  it("holds on H4 with no claims and reports max entropy of 2 bits", () => {
    const ach = evaluateAch({
      claims: [],
      clusters: [],
      conflicts: [],
      deceptions: [],
      conflictMassC0: 0,
    });
    expect(ach.leadingHypothesis).toBe("H4_STALE_OR_VACANT");
    expect(ach.maxEntropyBits).toBe(2);
    expect(ach.rankedGaps).toEqual([]);
    expect(ach.entropyBits).toBeGreaterThan(1.8);
    expect(ach.entropyBits).toBeLessThanOrEqual(2);
  });

  it("ranks collection gaps by EIG and keeps posteriors on the simplex", () => {
    const ambush = makeClaim({
      eventId: "e-ambush",
      kind: "ambush",
      opinion: normalizeOpinion(0.7, 0.1, 0.2),
    });
    const decoy = makeClaim({
      eventId: "e-decoy",
      kind: "decoy",
      siteKey: "MOSQUE_COURTYARD",
      siteLabel: "Mosque courtyard",
      vector: "SIGINT",
      opinion: normalizeOpinion(0.1, 0.6, 0.3),
    });
    const ach = evaluateAch({
      claims: [ambush, decoy],
      clusters: [],
      conflicts: [],
      deceptions: [
        {
          eventId: "e-decoy",
          sourceId: "e-decoy",
          vector: "SIGINT",
          siteKey: "MOSQUE_COURTYARD",
          siteLabel: "Mosque courtyard",
          conflictDrop: 0.4,
          entropyDelta: 0.2,
          falsityScore: 0.62,
          whaleyClass: "DECOYING",
          rationale: "test",
        },
      ],
      conflictMassC0: 0.4,
    });

    const posteriorSum = ach.hypotheses.reduce((sum, row) => sum + row.posterior, 0);
    expect(posteriorSum).toBeCloseTo(1, 12);
    expect(ach.rankedGaps.length).toBeGreaterThan(0);
    expect(ach.rankedGaps.every((gap) => gap.expectedInfoGainBits > 0)).toBe(true);
    const eig = ach.rankedGaps.map((gap) => gap.expectedInfoGainBits);
    const sorted = [...eig].sort((a, b) => b - a);
    expect(eig).toEqual(sorted);
  });
});
