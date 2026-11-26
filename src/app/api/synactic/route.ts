import { NextResponse } from "next/server";

import { ingestAndSynthesize } from "@/lib/tise";
import { pullSynacticEvents, synacticStatus } from "@/lib/synactic/client";

export async function GET() {
  return NextResponse.json(synacticStatus());
}

export async function POST() {
  const status = synacticStatus();
  if (!status.configured) {
    return NextResponse.json(
      { error: status.reason, status },
      { status: 503 },
    );
  }

  try {
    const pulled = await pullSynacticEvents();
    const result = ingestAndSynthesize(pulled.events);
    return NextResponse.json({
      tool: pulled.tool,
      synthesis: result,
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synactic pull failed";
    return NextResponse.json({ error: message, status }, { status: 502 });
  }
}
