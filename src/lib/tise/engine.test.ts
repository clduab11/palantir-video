import { describe, expect, it } from "vitest";

import { districtSevenScenario } from "@/lib/scenario/district-seven";
import { isSynacticEnvelope, synacticToTise } from "@/lib/synactic/adapter";
import { ingestAndSynthesize, parseMgrs, parseTiseEvent } from "@/lib/tise";

const NOW = new Date("2026-11-26T14:00:00.000Z");

describe("TISE schema gate", () => {
  it("rejects events missing provenance", () => {
    const result = ingestAndSynthesize(
      [
        {
          event_id: "11111111-1111-4111-8111-111111111111",
          timestamp: NOW.toISOString(),
          vector_type: "SIGINT",
          source_id: "X",
          location: { mgrs: "18S UJ 23481 06512", description: "Warehouse 7" },
          payload: "RPK burst",
          confidence_score: 0.9,
          perceived_threat_level: "HIGH",
        },
      ],
      { now: NOW },
    );
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.missing).toContain("provenance");
    expect(result.rejected[0]?.reason).toMatch(/provenance/i);
  });

  it("rejects events missing confidence_score", () => {
    const parsed = parseTiseEvent({
      event_id: "11111111-1111-4111-8111-111111111111",
      timestamp: NOW.toISOString(),
      vector_type: "HUMINT",
      source_id: "SOURCE_09",
      location: { mgrs: "18S UJ 23855 06840", description: "Building 12" },
      payload: "armed personnel",
      provenance: "SOURCE_09",
      perceived_threat_level: "MEDIUM",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.missing).toContain("confidence_score");
    }
  });
});

describe("MGRS", () => {
  it("parses spaced and compact forms to the same 100m cell", () => {
    const spaced = parseMgrs("18S UJ 23481 06512");
    const compact = parseMgrs("18SUJ2348106512");
    expect(spaced?.cell100m).toBe(compact?.cell100m);
    expect(spaced?.cell1km).toBe("18S UJ 23 06");
  });
});

describe("District Seven adversarial loop", () => {
  const result = ingestAndSynthesize(districtSevenScenario(NOW), { now: NOW });

  it("discards the low-confidence hash noise", () => {
    expect(
      result.discardedNoise.some((event) => event.source_id === "HASH-NOISE-1"),
    ).toBe(true);
  });

  it("clusters Warehouse 7 as a hot zone with SIGINT+GEOINT", () => {
    const warehouse = result.clusters.find(
      (cluster) => cluster.landmark === "WAREHOUSE_7" && cluster.hot,
    );
    expect(warehouse).toBeTruthy();
    expect(warehouse?.vectors).toEqual(expect.arrayContaining(["SIGINT", "GEOINT"]));
    expect(warehouse?.veracity ?? 0).toBeGreaterThan(0.6);
  });

  it("does not promote Building 12 GEOINT to a presence claim", () => {
    expect(
      result.claims.some(
        (claim) =>
          claim.landmark === "BUILDING_12" &&
          claim.vector === "GEOINT" &&
          claim.kind === "presence",
      ),
    ).toBe(false);
  });

  it("flags Building 12 HUMINT against a cold GEOINT picture", () => {
    const friction = result.conflicts.filter(
      (conflict) => conflict.landmark === "BUILDING_12",
    );
    expect(friction.length).toBeGreaterThan(0);
    expect(result.sitrepText).toMatch(/Building 12/i);
    expect(result.sitrepText).toMatch(/SOURCE_09/i);
  });

  it("treats Mosque courtyard EM as deception, not occupancy", () => {
    expect(result.sitrep.friction.deceptionRisk).toBe("HIGH");
    expect(result.sitrepText).toMatch(/decoy|spoof/i);
  });

  it("notes the four-hour HUMINT as decaying", () => {
    expect(
      result.sitrep.friction.dataDecay.some((line) => /4\.0h old|SOURCE_09/i.test(line)),
    ).toBe(true);
  });

  it("does not recommend STRIKE while civilians and deception remain", () => {
    expect(result.sitrep.recommendedPosture).toBe("MANEUVER");
    expect(result.sitrep.threatSurface.threatLevel).not.toBe("LOW");
  });

  it("emits the commander SITREP template", () => {
    expect(result.sitrepText).toContain("**I. THREAT SURFACE SUMMARY**");
    expect(result.sitrepText).toContain("**II. INTELLIGENCE FRICTION & DISSONANCE**");
    expect(result.sitrepText).toContain("**III. KINETIC TRIGGERS (ACTIONABLE INDICATORS)**");
    expect(result.sitrepText).toContain("**IV. VERIFICATION GAPS");
    expect(result.sitrepText).toContain("**V. RECOMMENDED POSTURE**");
    expect(result.sitrepText).toMatch(/MANPADS-type RF signature/i);
  });

  it("never invents a MANPADS detection in this stream", () => {
    expect(
      result.entities.some((entity) => entity.kind === "MANPADS"),
    ).toBe(false);
    const manpads = result.sitrep.kineticTriggers.find((trigger) =>
      /MANPADS/i.test(trigger.condition),
    );
    expect(manpads?.armed).toBe(false);
  });
});

describe("Synactic envelope adapter", () => {
  it("refuses to fabricate confidence when the envelope has none", () => {
    const envelope = {
      version: 1 as const,
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      type: "conflict.event",
      timestamp: NOW.toISOString(),
      provenance: {
        sourceId: "synactic.acled",
        sourceUri: "https://example.invalid/acled",
        retrievedAt: NOW.toISOString(),
        integrityHash: null,
      },
      payload: {
        mgrs: "18S UJ 23481 06512",
        description: "Warehouse 7",
        summary: "Armed clash reported",
      },
    };
    expect(isSynacticEnvelope(envelope)).toBe(true);
    const mapped = synacticToTise(envelope);
    const parsed = parseTiseEvent(mapped);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.missing).toContain("confidence_score");
  });

  it("maps a complete envelope onto TISE", () => {
    const mapped = synacticToTise({
      version: 1,
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      type: "sigint.intercept",
      timestamp: NOW.toISOString(),
      provenance: {
        sourceId: "synactic.elint",
        sourceUri: "https://example.invalid/elint",
        retrievedAt: NOW.toISOString(),
        integrityHash: "abc",
      },
      payload: {
        mgrs: "18S UJ 23481 06512",
        description: "Warehouse 7",
        payload: "RPK-pattern burst radio",
        confidence: 0.77,
        threat: "HIGH",
      },
    });
    const parsed = parseTiseEvent(mapped);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.event.vector_type).toBe("SIGINT");
      expect(parsed.event.confidence_score).toBe(0.77);
      expect(parsed.event.provenance).toMatch(/synactic.elint/);
    }
  });
});
