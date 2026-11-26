import { describe, expect, it } from "vitest";

import {
  aggregatedUncertaintyBits,
  classifyWhaleyDeception,
  evaluateCounterDeception,
  setDempsterCombination,
} from "@/lib/epistemics/deception";
import { normalizeOpinion } from "@/lib/epistemics/subjective-logic";
import { buildAdmiraltyRating } from "@/lib/interop/tradecraft";
import type { Claim, EnrichedEvent } from "@/lib/tise/types";

const admiralty = buildAdmiraltyRating("B", 2);

function makeClaim(
  input: Pick<Claim, "eventId" | "kind" | "opinion"> & Partial<Claim>,
): Claim {
  return {
    vector: "SIGINT",
    sourceId: input.sourceId ?? input.eventId,
    landmark: "WAREHOUSE_7",
    siteKey: "WAREHOUSE_7",
    siteLabel: "Warehouse 7",
    confidence: 0.8,
    admiralty,
    integrityHash: "sha256:test",
    excerpt: "test",
    ...input,
  };
}

function makeEvent(
  id: string,
  extra?: Partial<EnrichedEvent>,
): EnrichedEvent {
  return {
    event_id: id,
    timestamp: "2026-11-26T14:00:00.000Z",
    vector_type: "SIGINT",
    source_id: id,
    location: { mgrs: "18S UJ 23481 06512", description: "Warehouse 7" },
    payload: "test",
    confidence_score: 0.8,
    provenance: "lab",
    perceived_threat_level: "HIGH",
    integrityHash: "sha256:test",
    admiralty,
    ageMinutes: 0,
    temporalWeight: 1,
    quarantined: false,
    ...extra,
  };
}

describe("Schubert leave-one-out", () => {
  it("returns zero conflict for a single opinion and vacuous empty set", () => {
    const single = setDempsterCombination([normalizeOpinion(0.7, 0.1, 0.2)]);
    expect(single.conflictMass).toBeLessThan(1e-9);
    expect(single.combined.u).toBeGreaterThan(0);
    const empty = setDempsterCombination([]);
    expect(empty.conflictMass).toBe(0);
    expect(empty.combined.u).toBe(1);
  });

  it("drops conflict when the dissenting report is withheld", () => {
    const present = makeClaim({
      eventId: "e-present",
      kind: "presence",
      vector: "SIGINT",
      opinion: normalizeOpinion(0.88, 0.02, 0.1),
    });
    const absent = makeClaim({
      eventId: "e-absent",
      kind: "absence",
      vector: "GEOINT",
      sourceId: "UAV-1",
      opinion: normalizeOpinion(0.02, 0.88, 0.1),
    });
    const { assessments, globalConflictMassC0 } = evaluateCounterDeception(
      [
        makeEvent("e-present"),
        makeEvent("e-absent", {
          vector_type: "GEOINT",
          source_id: "UAV-1",
        }),
      ],
      [present, absent],
    );
    expect(globalConflictMassC0).toBeGreaterThan(0.5);
    expect(assessments).toHaveLength(2);
    expect(assessments.every((row) => row.conflictDrop > 0.5)).toBe(true);
    expect(assessments.every((row) => row.falsityScore > 0.5)).toBe(true);
  });

  it("scores an isolated decoy without a peer set", () => {
    const decoy = makeClaim({
      eventId: "e-decoy",
      kind: "decoy",
      opinion: normalizeOpinion(0.1, 0.7, 0.2),
    });
    const { assessments } = evaluateCounterDeception(
      [makeEvent("e-decoy")],
      [decoy],
    );
    expect(assessments[0]?.falsityScore).toBeCloseTo(0.72, 5);
    expect(assessments[0]?.whaleyClass).toBe("DECOYING");
    expect(assessments[0]?.conflictDrop).toBe(0);
  });
});

describe("Whaley classification", () => {
  it("labels simulation and dissimulation from claim pattern", () => {
    const decoy = makeClaim({
      eventId: "e1",
      kind: "decoy",
      opinion: normalizeOpinion(0.1, 0.6, 0.3),
    });
    expect(
      classifyWhaleyDeception({
        eventClaims: [decoy],
        siteClaims: [decoy],
        falsityScore: 0.2,
      }),
    ).toBe("DECOYING");

    const humint = makeClaim({
      eventId: "e2",
      kind: "ambush",
      vector: "HUMINT",
      opinion: normalizeOpinion(0.5, 0.1, 0.4),
    });
    expect(
      classifyWhaleyDeception({
        eventClaims: [humint],
        siteClaims: [humint],
        falsityScore: 0.4,
      }),
    ).toBe("INVENTING");

    const civilian = makeClaim({
      eventId: "e3",
      kind: "civilian",
      vector: "GEOINT",
      opinion: normalizeOpinion(0.2, 0.2, 0.6),
    });
    const weapons = makeClaim({
      eventId: "e4",
      kind: "static_defense",
      vector: "GEOINT",
      opinion: normalizeOpinion(0.7, 0.1, 0.2),
    });
    expect(
      classifyWhaleyDeception({
        eventClaims: [weapons],
        siteClaims: [civilian, weapons],
        falsityScore: 0.1,
      }),
    ).toBe("MASKING");

    expect(
      classifyWhaleyDeception({
        eventClaims: [weapons],
        siteClaims: [weapons],
        falsityScore: 0.5,
      }),
    ).toBe("MIMICKING");
    expect(
      classifyWhaleyDeception({
        eventClaims: [weapons],
        siteClaims: [weapons],
        falsityScore: 0.3,
      }),
    ).toBe("DAZZLING");
  });

  it("keeps AU on [0, 1] for vacuous and dogmatic opinions", () => {
    expect(aggregatedUncertaintyBits(normalizeOpinion(0, 0, 1))).toBe(1);
    expect(aggregatedUncertaintyBits(normalizeOpinion(1, 0, 0))).toBe(0);
    expect(aggregatedUncertaintyBits(normalizeOpinion(0.6, 0.3, 0.1))).toBeGreaterThan(
      0,
    );
    expect(aggregatedUncertaintyBits(normalizeOpinion(0.6, 0.3, 0.1))).toBeLessThanOrEqual(
      1,
    );
  });
});
