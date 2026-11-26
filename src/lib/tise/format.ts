import { assertNever } from "./never";
import type { ThreatLevel, VectorType } from "./types";

export function threatRank(level: ThreatLevel): number {
  switch (level) {
    case "LOW":
      return 0;
    case "MEDIUM":
      return 1;
    case "HIGH":
      return 2;
    case "CRITICAL":
      return 3;
    default:
      return assertNever(level, "threat");
  }
}

export function vectorTone(vector: VectorType): string {
  switch (vector) {
    case "SIGINT":
      return "text-cyan-300 border-cyan-500/40 bg-cyan-500/10";
    case "HUMINT":
      return "text-violet-300 border-violet-500/40 bg-violet-500/10";
    case "GEOINT":
      return "text-lime-300 border-lime-500/40 bg-lime-500/10";
    default:
      return assertNever(vector, "vector");
  }
}

export function threatTone(level: ThreatLevel): string {
  switch (level) {
    case "LOW":
      return "text-zinc-300 border-zinc-500/40 bg-zinc-500/10";
    case "MEDIUM":
      return "text-amber-200 border-amber-500/40 bg-amber-500/10";
    case "HIGH":
      return "text-orange-200 border-orange-500/50 bg-orange-500/15";
    case "CRITICAL":
      return "text-red-200 border-red-500/60 bg-red-600/20";
    default:
      return assertNever(level, "threat");
  }
}

export function formatZulu(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "Z").slice(0, 19) + "Z";
}

export function ageLabel(timestamp: string, now: Date): string {
  const delta = now.getTime() - Date.parse(timestamp);
  if (Number.isNaN(delta)) return "—";
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}
