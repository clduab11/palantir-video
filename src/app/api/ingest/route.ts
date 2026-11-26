import { NextResponse } from "next/server";

import { ingestAndSynthesize } from "@/lib/tise";
import { adaptInbound } from "@/lib/synactic/adapter";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "REJECTED: body is not JSON" },
      { status: 400 },
    );
  }

  const adapted = adaptInbound(body);
  const nowIso =
    adapted !== null &&
    typeof adapted === "object" &&
    "now" in adapted &&
    typeof adapted.now === "string"
      ? adapted.now
      : undefined;
  const now = nowIso ? new Date(nowIso) : new Date();
  const result = ingestAndSynthesize(adapted, { now });
  return NextResponse.json(result);
}
