import { NextResponse } from "next/server";

import {
  getScenario,
  isScenarioId,
  scenarioEvents,
} from "@/lib/scenario/catalog";
import { ingestAndSynthesize } from "@/lib/tise";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("id") ?? "district-seven";
  if (!isScenarioId(requested)) {
    return NextResponse.json(
      { error: `Unknown scenario ${requested}` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const scenario = getScenario(requested);
  const now = new Date();
  const events = scenarioEvents(requested, now);
  const result = ingestAndSynthesize(events, { now });
  return NextResponse.json(
    {
      meta: {
        id: scenario.id,
        name: scenario.name,
        classification: scenario.classification,
        description: scenario.description,
        expectedPosture: scenario.expectedPosture,
      },
      events,
      synthesis: { ...result, sample: true },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
