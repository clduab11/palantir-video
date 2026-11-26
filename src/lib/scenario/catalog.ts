import type { Posture, TiseEvent } from "@/lib/tise";

import {
  BLACKOUT_DDIL_META,
  BLACKOUT_REJECT,
  blackoutDdilScenario,
} from "./blackout-ddil";
import { CORRIDOR_MIRAGE_META, corridorMirageScenario } from "./corridor-mirage";
import { districtSevenScenario, SCENARIO_META } from "./district-seven";
import { IRON_ANVIL_META, ironAnvilScenario } from "./iron-anvil";

export type ScenarioId =
  | "district-seven"
  | "corridor-mirage"
  | "iron-anvil"
  | "blackout-ddil";

export type ScenarioDefinition = {
  id: ScenarioId;
  name: string;
  classification: string;
  description: string;
  expectedPosture: Posture;
  hotkey: "1" | "2" | "3" | "4";
  build: (now?: Date) => TiseEvent[];
};

export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: "district-seven",
    name: SCENARIO_META.name,
    classification: SCENARIO_META.classification,
    description: SCENARIO_META.description,
    expectedPosture: "MANEUVER",
    hotkey: "1",
    build: districtSevenScenario,
  },
  {
    id: "corridor-mirage",
    name: CORRIDOR_MIRAGE_META.name,
    classification: CORRIDOR_MIRAGE_META.classification,
    description: CORRIDOR_MIRAGE_META.description,
    expectedPosture: "WITHDRAW",
    hotkey: "2",
    build: corridorMirageScenario,
  },
  {
    id: "iron-anvil",
    name: IRON_ANVIL_META.name,
    classification: IRON_ANVIL_META.classification,
    description: IRON_ANVIL_META.description,
    expectedPosture: "STRIKE",
    hotkey: "3",
    build: ironAnvilScenario,
  },
  {
    id: "blackout-ddil",
    name: BLACKOUT_DDIL_META.name,
    classification: BLACKOUT_DDIL_META.classification,
    description: BLACKOUT_DDIL_META.description,
    expectedPosture: "HOLD",
    hotkey: "4",
    build: blackoutDdilScenario,
  },
];

export function isScenarioId(value: string): value is ScenarioId {
  return SCENARIOS.some((scenario) => scenario.id === value);
}

export function getScenario(id: ScenarioId): ScenarioDefinition {
  const found = SCENARIOS.find((scenario) => scenario.id === id);
  if (!found) {
    throw new Error(`Unknown scenario ${id}`);
  }
  return found;
}

export function scenarioEvents(id: ScenarioId, now = new Date()): unknown[] {
  const events = getScenario(id).build(now);
  if (id !== "blackout-ddil") return events;
  return [
    ...events,
    {
      ...BLACKOUT_REJECT,
      timestamp: now.toISOString(),
    },
  ];
}
