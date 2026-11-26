import { assertNever } from "./never";
import type { Sitrep } from "./types";

export function formatSitrep(sitrep: Sitrep): string {
  const entities = sitrep.threatSurface.detectedEntities
    .map((line) => `    *   ${line}`)
    .join("\n");
  const conflicts = sitrep.friction.conflictLog
    .map((line) => `    *   ${line}`)
    .join("\n");
  const decay = sitrep.friction.dataDecay
    .map((line) => `    *   ${line}`)
    .join("\n");
  const triggers = sitrep.kineticTriggers
    .map((trigger) => {
      const flag = trigger.armed ? "ARMED" : "WATCH";
      return `    *   [${flag}] If ${stripIf(trigger.condition)} → ${trigger.action}`;
    })
    .join("\n");
  const gaps = sitrep.verificationGaps
    .map((line) => `    *   ${line}`)
    .join("\n");

  return [
    `**[SITREP_ID: ${sitrep.sitrepId}]**`,
    `**[TIMESTAMP: ${sitrep.timestamp}]**`,
    `**[AOI (Area of Interest): ${sitrep.aoi}]**`,
    `**[ICD-203 ANALYTIC CONFIDENCE: ${sitrep.analyticConfidence}]**`,
    ``,
    `> ${sitrep.estimativeAssessment}`,
    ``,
    `**I. THREAT SURFACE SUMMARY**`,
    `*   **Detected Entities:**`,
    entities,
    `*   **Threat Level:** ${sitrep.threatSurface.threatLevel}`,
    `*   **Enemy Posture:** ${sitrep.threatSurface.enemyPosture}`,
    ``,
    `**II. INTELLIGENCE FRICTION & DISSONANCE**`,
    `*   **Conflict Log:**`,
    conflicts,
    `*   **Deception Risk:** ${sitrep.friction.deceptionRisk}`,
    `*   **Data Decay:**`,
    decay,
    ``,
    `**III. KINETIC TRIGGERS (ACTIONABLE INDICATORS)**`,
    triggers,
    ``,
    `**IV. VERIFICATION GAPS (THE "BLIND SPOTS")**`,
    gaps,
    ``,
    `**V. RECOMMENDED POSTURE**`,
    `*   ${sitrep.recommendedPosture} — ${sitrep.postureRationale}`,
  ].join("\n");
}

function stripIf(condition: string): string {
  return condition.replace(/^If\s+/i, "");
}

export function postureTone(
  posture: Sitrep["recommendedPosture"],
): "hold" | "maneuver" | "strike" | "withdraw" {
  switch (posture) {
    case "HOLD":
      return "hold";
    case "MANEUVER":
      return "maneuver";
    case "STRIKE":
      return "strike";
    case "WITHDRAW":
      return "withdraw";
    default:
      return assertNever(posture, "posture");
  }
}
