import { scenarioEvents, SCENARIOS } from "@/lib/scenario/catalog";
import { ingestAndSynthesize } from "@/lib/tise";

export const EVAL_CLOCK = new Date("2026-11-26T14:00:00.000Z");

export type EvalRow = {
  id: string;
  expected: string;
  actual: string;
  threat: string;
  deception: string;
  confidence: string;
  leading: string;
  entropy: string;
  rejected: number;
  maxFalsity: string;
  computeMs: number;
  pass: boolean;
};

export function runEval(now = EVAL_CLOCK): EvalRow[] {
  return SCENARIOS.map((scenario) => {
    const result = ingestAndSynthesize(scenarioEvents(scenario.id, now), { now });
    const maxFalsity = result.deceptionAssessments.reduce(
      (best, row) => Math.max(best, row.falsityScore),
      0,
    );
    return {
      id: scenario.id,
      expected: scenario.expectedPosture,
      actual: result.sitrep.recommendedPosture,
      threat: result.sitrep.threatSurface.threatLevel,
      deception: result.sitrep.friction.deceptionRisk,
      confidence: result.sitrep.analyticConfidence,
      leading: result.ach.leadingHypothesis,
      entropy: result.ach.entropyBits.toFixed(2),
      rejected: result.rejected.length,
      maxFalsity: maxFalsity.toFixed(2),
      computeMs: result.computeMs,
      pass: result.sitrep.recommendedPosture === scenario.expectedPosture,
    };
  });
}

export function renderScorecard(rows: EvalRow[], now = EVAL_CLOCK): string {
  const header = [
    "| Vignette | Expected | Actual | Threat | Deception | Confidence | Leading hypothesis | H (bits) | Rejected | Max falsity |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.map(
    (row) =>
      `| ${row.id} | ${row.expected} | ${row.actual}${row.pass ? "" : " FAIL"} | ${row.threat} | ${row.deception} | ${row.confidence} | ${row.leading} | ${row.entropy} | ${row.rejected} | ${row.maxFalsity} |`,
  );
  return [
    "# TISE eval scorecard",
    "",
    `Fixed clock: ${now.toISOString()}. Training vignettes only. A row fails when the posture does not match the vignette contract.`,
    "",
    ...header,
    ...body,
    "",
    rows.every((row) => row.pass)
      ? "Result: all vignettes matched their contracted posture."
      : "Result: one or more vignettes missed their contracted posture.",
    "",
  ].join("\n");
}
