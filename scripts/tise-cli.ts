import { readFileSync } from "node:fs";

import { exportCotXml } from "@/lib/interop/cot";
import { isScenarioId, scenarioEvents } from "@/lib/scenario/catalog";
import { ingestAndSynthesize } from "@/lib/tise";

const [command, target, ...rest] = process.argv.slice(2);
const formatFlag = rest.find((arg) => arg.startsWith("--format="))?.split("=")[1] ?? "sitrep";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (command !== "synthesize" || !target) {
  fail("Usage: npm run tise -- synthesize <scenario-id|file.json> --format=sitrep|cot|json");
}

const now = new Date("2026-11-26T14:00:00.000Z");
const input = isScenarioId(target)
  ? scenarioEvents(target, now)
  : JSON.parse(readFileSync(target, "utf8"));

const synthesis = ingestAndSynthesize(input, { now });

if (formatFlag === "json") {
  console.log(
    JSON.stringify(
      {
        posture: synthesis.sitrep.recommendedPosture,
        threat: synthesis.sitrep.threatSurface.threatLevel,
        deception: synthesis.sitrep.friction.deceptionRisk,
        sitrep: synthesis.sitrep,
        rejected: synthesis.rejected,
      },
      null,
      2,
    ),
  );
} else if (formatFlag === "cot") {
  const outcome = exportCotXml({ synthesis, mode: "awareness", now });
  if (!outcome.ok) fail(outcome.policyDecision.message);
  console.log(outcome.xml);
} else if (formatFlag === "sitrep") {
  console.log(synthesis.sitrepText);
} else {
  fail(`Unknown format ${formatFlag}`);
}
