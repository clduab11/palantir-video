import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { renderScorecard, runEval } from "@/lib/eval/scorecard";

const rows = runEval();
const markdown = renderScorecard(rows);
const out = path.resolve("docs/EVAL-SCORECARD.md");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, markdown);
console.log(markdown);
if (rows.some((row) => !row.pass)) {
  process.exitCode = 1;
}
