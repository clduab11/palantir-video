import { beforeEach, describe, expect, it } from "vitest";

import { POST as exportCot } from "@/app/api/export/cot/route";
import { POST as mcpPost } from "@/app/api/mcp/route";
import { POST as synthesizePost } from "@/app/api/synthesize/route";
import { mintCommanderApprovalGrant } from "@/lib/policy/action-policy";
import { resetCommanderGrantLedger } from "@/lib/policy/grant-ledger";
import { ironAnvilScenario } from "@/lib/scenario/iron-anvil";

const NOW = new Date("2026-11-26T14:00:00.000Z");
const SECRET_PAYLOAD = "token sk-live-abcdefghijklmnopqrstuvwxyz";

beforeEach(() => {
  resetCommanderGrantLedger();
});

async function postJson(
  handler: (request: Request) => Promise<Response>,
  path: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await handler(
    new Request(`http://127.0.0.1:4317${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

describe("POST /api/synthesize secret-guard", () => {
  it("rejects secret-shaped payloads before fusion", async () => {
    const events = ironAnvilScenario(NOW);
    const seeded = events[0];
    if (!seeded) throw new Error("missing iron-anvil seed");

    const direct = await postJson(synthesizePost, "/api/synthesize", {
      ...seeded,
      payload: SECRET_PAYLOAD,
    });
    expect(direct.status).toBe(400);
    expect(String(direct.json.error)).toMatch(/secret-shaped/i);

    const wrapped = await postJson(synthesizePost, "/api/synthesize", {
      events,
      api_key: "sk-live-abcdefghijklmnopqrstuvwxyz",
    });
    expect(wrapped.status).toBe(400);
    expect(String(wrapped.json.error)).toMatch(/secret-shaped/i);
  });
});

describe("POST /api/export/cot grant gate", () => {
  it("returns 403 without a grant, on replay, on expiry, and on a tampered grant", async () => {
    const events = ironAnvilScenario(NOW);

    const missing = await postJson(exportCot, "/api/export/cot", {
      events,
      mode: "nomination",
    });
    expect(missing.status).toBe(403);

    const grant = mintCommanderApprovalGrant("QRF-6", new Date(), 60_000);
    const first = await postJson(exportCot, "/api/export/cot", {
      events,
      mode: "nomination",
      approval: grant,
    });
    expect(first.status).toBe(200);
    expect(typeof first.json.xml).toBe("string");

    const replay = await postJson(exportCot, "/api/export/cot", {
      events,
      mode: "nomination",
      approval: grant,
    });
    expect(replay.status).toBe(403);
    expect(String(replay.json.error)).toMatch(/already consumed|single-use/i);

    const expiredGrant = mintCommanderApprovalGrant(
      "QRF-6",
      new Date(Date.now() - 60_000),
      10_000,
    );
    const expired = await postJson(exportCot, "/api/export/cot", {
      events,
      mode: "nomination",
      approval: expiredGrant,
    });
    expect(expired.status).toBe(403);
    expect(String(expired.json.error)).toMatch(/expired/i);

    const fresh = mintCommanderApprovalGrant("QRF-6-ACTUAL", new Date(), 60_000);
    const tampered = {
      ...fresh,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const invalid = await postJson(exportCot, "/api/export/cot", {
      events,
      mode: "nomination",
      approval: tampered,
    });
    expect(invalid.status).toBe(403);
    expect(String(invalid.json.error)).toMatch(/invalid or tampered/i);

    const malformed = await postJson(exportCot, "/api/export/cot", {
      events,
      mode: "nomination",
      approval: { grantId: "nope", grantedBy: "QRF-6" },
    });
    expect(malformed.status).toBe(400);
    expect(String(malformed.json.error)).toMatch(/malformed/i);
  });
});

describe("POST /api/mcp read-only nomination refusal", () => {
  it("refuses nomination mode including mixed case", async () => {
    const refused = await postJson(mcpPost, "/api/mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "tise_export_cot",
        arguments: { scenario: "iron-anvil", mode: "NOMINATION" },
      },
    });
    expect(refused.status).toBe(200);
    const result = refused.json.result as {
      isError?: boolean;
      content?: { text?: string }[];
    };
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toMatch(/read-only/i);

    const secret = await postJson(mcpPost, "/api/mcp", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "tise_synthesize_stream",
        arguments: { apiKey: "sk-live-abcdefghijklmnopqrstuvwxyz" },
      },
    });
    const secretResult = secret.json.result as {
      isError?: boolean;
      content?: { text?: string }[];
    };
    expect(secretResult.isError).toBe(true);
    expect(secretResult.content?.[0]?.text).toMatch(/secret-shaped/i);
  });
});
