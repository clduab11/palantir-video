import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { averagingFuse, cumulativeFuse, normalizeOpinion, trustDiscount, vacuousOpinion } from "@/lib/epistemics/subjective-logic";
import { exportCotXml } from "@/lib/interop/cot";
import { mintCommanderApprovalGrant } from "@/lib/policy/action-policy";
import { scenarioEvents, SCENARIOS } from "@/lib/scenario/catalog";
import { ironAnvilScenario } from "@/lib/scenario/iron-anvil";
import { ingestAndSynthesize, parseTiseEvent } from "@/lib/tise";
import { runEval } from "@/lib/eval/scorecard";
import { renderMilSymbolSvg } from "@/lib/interop/symbology";

const NOW = new Date("2026-11-26T14:00:00.000Z");

function onSimplex(opinion: { b: number; d: number; u: number }): boolean {
  return (
    opinion.b >= -1e-9 &&
    opinion.d >= -1e-9 &&
    opinion.u >= -1e-9 &&
    Math.abs(opinion.b + opinion.d + opinion.u - 1) < 1e-9
  );
}

describe("subjective logic simplex", () => {
  it("stays on the simplex under discounting and fusion", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (b, d, u, trust) => {
          const left = normalizeOpinion(b, d, u, 0.4);
          const right = normalizeOpinion(d, b, u, 0.6);
          expect(onSimplex(left)).toBe(true);
          expect(onSimplex(trustDiscount(left, trust))).toBe(true);
          expect(onSimplex(cumulativeFuse(left, right))).toBe(true);
          expect(onSimplex(averagingFuse([left, left, right]))).toBe(true);
          expect(onSimplex(vacuousOpinion())).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("safety invariants", () => {
  it("rejects secret-shaped payloads", () => {
    const parsed = parseTiseEvent({
      event_id: "11111111-1111-4111-8111-111111111111",
      timestamp: NOW.toISOString(),
      vector_type: "SIGINT",
      source_id: "X",
      location: { mgrs: "18S UJ 23481 06512", description: "Warehouse 7" },
      payload: "token sk-live-abcdefghijklmnopqrstuvwxyz",
      confidence_score: 0.8,
      provenance: "lab",
      perceived_threat_level: "HIGH",
    });
    expect(parsed.ok).toBe(false);
  });

  it("does not let one source echo itself into a strike", () => {
    const seed = ironAnvilScenario(NOW)[2];
    if (!seed) throw new Error("missing seed");
    const copies = Array.from({ length: 8 }, (_, index) => ({
      ...seed,
      event_id: `aaaaaaaa-bbbb-4ccc-8ddd-${index.toString().padStart(12, "0")}`,
      timestamp: new Date(NOW.getTime() - index * 60_000).toISOString(),
    }));
    const result = ingestAndSynthesize(copies, { now: NOW });
    expect(result.sitrep.recommendedPosture).not.toBe("STRIKE");
    expect(result.clusters[0]?.vectors).toEqual(["SIGINT"]);
  });

  it("forbids strike when civilians share the aim point", () => {
    const events = ironAnvilScenario(NOW);
    events.push({
      event_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      timestamp: NOW.toISOString(),
      vector_type: "GEOINT",
      source_id: "UAV-EO-CIV",
      location: {
        mgrs: "18S UJ 24110 07140",
        description: "Industrial yard",
      },
      payload:
        "Dense civilian crowd inside the industrial yard firing pit. Non-combatant heat fills the aim point.",
      confidence_score: 0.93,
      provenance: "GEOINT UAV-EO-CIV / NIIRS 6",
      perceived_threat_level: "HIGH",
      source_reliability: "A",
      info_credibility: 1,
    });
    const result = ingestAndSynthesize(events, { now: NOW });
    expect(result.sitrep.recommendedPosture).not.toBe("STRIKE");
  });
});

describe("vignette contracts", () => {
  it("matches every contracted posture", () => {
    const rows = runEval(NOW);
    expect(rows.every((row) => row.pass)).toBe(true);
    expect(SCENARIOS.map((scenario) => scenario.expectedPosture)).toEqual([
      "MANEUVER",
      "WITHDRAW",
      "STRIKE",
      "HOLD",
    ]);
  });

  it("renders a 2525 symbol and an awareness CoT document", () => {
    const svg = renderMilSymbolSvg("SHGPUCI---*****", { size: 24 });
    expect(svg).toContain("<svg");
    const synthesis = ingestAndSynthesize(scenarioEvents("iron-anvil", NOW), {
      now: NOW,
    });
    const awareness = exportCotXml({ synthesis, mode: "awareness", now: NOW });
    expect(awareness.ok).toBe(true);
    if (awareness.ok) {
      expect(awareness.xml).toContain('version="2.0"');
      expect(awareness.xml).toContain("<point ");
    }
    const blocked = exportCotXml({ synthesis, mode: "nomination", now: NOW });
    expect(blocked.ok).toBe(false);
    const grant = mintCommanderApprovalGrant("QRF-6", NOW, 60_000);
    const allowed = exportCotXml({
      synthesis,
      mode: "nomination",
      approvalGrant: grant,
      now: NOW,
    });
    expect(allowed.ok).toBe(true);
  });
});
