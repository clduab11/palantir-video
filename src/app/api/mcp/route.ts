import { NextResponse } from "next/server";

import { mcpDispatch } from "@/lib/mcp/server";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  return NextResponse.json(mcpDispatch(body));
}

export async function GET() {
  return NextResponse.json(
    {
      name: "tise",
      protocol: "mcp",
      card: "/.well-known/mcp/server-card.json",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
