import { adaptInbound, isSynacticEnvelope, wrapUpstreamRowAsSynacticEnvelope } from "./adapter";

export type SynacticStatus = {
  configured: boolean;
  urlHost: string | null;
  verifiedTools: readonly string[];
  reason: string;
};

/**
 * Verified MCP tools published in clduab11/the-synactic's
 * public/.well-known/mcp/server-card.json (112-tool registry).
 */
export const SYNCTIC_UPSTREAM_TOOLS = [
  {
    name: "get_conflict_events",
    arguments: { limit: 20, since_days: 7 },
  },
  {
    name: "get_signal_convergence",
    arguments: { min_domains: 2 },
  },
  {
    name: "get_temporal_anomalies",
    arguments: { min_severity: "medium" },
  },
  {
    name: "get_population_exposure",
    arguments: { mode: "events" },
  },
] as const;

function configuredUrl(): URL | null {
  const raw = process.env.SYNCTIC_MCP_URL ?? process.env.SYNCTIC_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function synacticStatus(): SynacticStatus {
  const url = configuredUrl();
  const key = process.env.SYNCTIC_API_KEY;
  const verifiedTools = SYNCTIC_UPSTREAM_TOOLS.map((t) => t.name);
  if (!url) {
    return {
      configured: false,
      urlHost: null,
      verifiedTools,
      reason:
        "SYNCTIC_MCP_URL is unset. Running deterministic local vignettes (no SSRF-exposed URL input).",
    };
  }
  if (!key) {
    return {
      configured: false,
      urlHost: url.host,
      verifiedTools,
      reason:
        "SYNCTIC_API_KEY is unset. Upstream MCP host is registered but unauthenticated calls are blocked.",
    };
  }
  return {
    configured: true,
    urlHost: url.host,
    verifiedTools,
    reason: `Ready to pull envelopes from ${url.host} via X-WorldMonitor-Key.`,
  };
}

type JsonRpcResult = {
  result?: {
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
  };
  error?: { message?: string; code?: number };
};

async function rpc(
  url: URL,
  key: string,
  method: string,
  params: Record<string, unknown>,
): Promise<JsonRpcResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-WorldMonitor-Key": key,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Synactic MCP HTTP ${response.status}`);
  }
  return (await response.json()) as JsonRpcResult;
}

function unpack(result: JsonRpcResult): unknown {
  if (result.error) {
    throw new Error(result.error.message ?? "Synactic MCP error");
  }
  if (result.result?.structuredContent) return result.result.structuredContent;
  const text = result.result?.content?.find((block) => block.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload !== null && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.events)) return record.events;
    if (Array.isArray(record.alerts)) return record.alerts;
    if (Array.isArray(record.anomalies)) return record.anomalies;
    if (Array.isArray(record.data)) return record.data;
    if (record.data && typeof record.data === "object") {
      const data = record.data as Record<string, unknown>;
      if (Array.isArray(data.events)) return data.events;
      if (Array.isArray(data.alerts)) return data.alerts;
      if (Array.isArray(data.anomalies)) return data.anomalies;
    }
  }
  return [];
}

export async function pullSynacticEvents(): Promise<{
  events: unknown;
  tool: string;
  sample: false;
}> {
  const url = configuredUrl();
  const key = process.env.SYNCTIC_API_KEY;
  if (!url || !key) {
    throw new Error("Synactic is not configured on this host.");
  }

  const now = new Date();
  let lastError = "No the-synactic MCP tool returned event records.";

  for (const spec of SYNCTIC_UPSTREAM_TOOLS) {
    try {
      const result = await rpc(url, key, "tools/call", {
        name: spec.name,
        arguments: spec.arguments,
      });
      const payload = unpack(result);
      const rows = extractRows(payload);
      if (rows.length > 0) {
        const envelopes = rows.map((row, index) =>
          isSynacticEnvelope(row)
            ? row
            : row !== null && typeof row === "object" && !Array.isArray(row)
              ? wrapUpstreamRowAsSynacticEnvelope({
                  tool: spec.name,
                  index,
                  row: row as Record<string, unknown>,
                  sourceHost: url.host,
                  now,
                })
              : row,
        );
        return {
          events: adaptInbound(envelopes),
          tool: spec.name,
          sample: false,
        };
      }
      lastError = `${spec.name} returned an empty snapshot.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}
