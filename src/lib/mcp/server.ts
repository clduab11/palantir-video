import { scenarioEvents, type ScenarioId, isScenarioId } from "@/lib/scenario/catalog";
import { exportCotXml } from "@/lib/interop/cot";
import { ingestAndSynthesize, type SynthesisResult } from "@/lib/tise";
import { adaptInbound } from "@/lib/synactic/adapter";

export const TISE_MCP_TOOLS = [
  {
    name: "tise_synthesize_stream",
    description:
      "Run the deterministic TISE loop on a TISE event array or a named training vignette. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        scenario: {
          type: "string",
          enum: ["district-seven", "corridor-mirage", "iron-anvil", "blackout-ddil"],
        },
        events: { type: "array" },
      },
    },
  },
  {
    name: "tise_score_deception",
    description:
      "Schubert leave-one-out falsity and Whaley class for each accepted event. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        scenario: { type: "string" },
        events: { type: "array" },
      },
    },
  },
  {
    name: "tise_rank_collection_gaps",
    description:
      "Rank verification gaps by expected information gain in bits. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        scenario: { type: "string" },
        events: { type: "array" },
      },
    },
  },
  {
    name: "tise_export_cot",
    description:
      "Export an awareness Cursor-on-Target v2.0 document. Strike nomination is refused on this read-only tool.",
    inputSchema: {
      type: "object",
      properties: {
        scenario: { type: "string" },
        events: { type: "array" },
        mode: { type: "string", enum: ["awareness", "nomination"] },
      },
    },
  },
] as const;

type ToolArgs = {
  scenario?: string;
  events?: unknown;
  mode?: string;
};

function synthesizeArgs(args: ToolArgs): SynthesisResult {
  const now = new Date();
  if (args.scenario && isScenarioId(args.scenario)) {
    return ingestAndSynthesize(scenarioEvents(args.scenario as ScenarioId, now), {
      now,
    });
  }
  return ingestAndSynthesize(adaptInbound(args.events ?? []), { now });
}

export function callTiseTool(
  name: string,
  args: ToolArgs,
): { ok: true; data: unknown } | { ok: false; error: string } {
  if (name === "tise_export_cot" && args.mode === "nomination") {
    return {
      ok: false,
      error:
        "tise_export_cot is read-only. Strike nomination requires a commander grant on POST /api/export/cot.",
    };
  }

  const synthesis = synthesizeArgs(args);
  switch (name) {
    case "tise_synthesize_stream":
      return {
        ok: true,
        data: {
          sitrep: synthesis.sitrep,
          sitrepText: synthesis.sitrepText,
          rejected: synthesis.rejected.length,
          clusters: synthesis.clusters.map((cluster) => ({
            id: cluster.id,
            site: cluster.siteLabel,
            veracity: Number(cluster.veracity.toFixed(3)),
            admiralty: cluster.admiraltyCode,
            vectors: cluster.vectors,
          })),
        },
      };
    case "tise_score_deception":
      return {
        ok: true,
        data: synthesis.deceptionAssessments.map((row) => ({
          eventId: row.eventId,
          sourceId: row.sourceId,
          site: row.siteLabel,
          falsity: Number(row.falsityScore.toFixed(3)),
          whaley: row.whaleyClass,
          conflictDrop: Number(row.conflictDrop.toFixed(3)),
        })),
      };
    case "tise_rank_collection_gaps":
      return { ok: true, data: synthesis.ach.rankedGaps };
    case "tise_export_cot": {
      const outcome = exportCotXml({ synthesis, mode: "awareness" });
      if (!outcome.ok) return { ok: false, error: outcome.policyDecision.message };
      return { ok: true, data: { xml: outcome.xml, eventCount: outcome.eventCount } };
    }
    default:
      return { ok: false, error: `Unknown tool ${name}` };
  }
}

export function mcpDispatch(body: unknown): unknown {
  const message =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  const id = "id" in message ? message.id : null;
  const method = typeof message.method === "string" ? message.method : "";

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "tise", version: "1.0.0" },
      },
    };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TISE_MCP_TOOLS } };
  }

  if (method === "tools/call") {
    const params =
      message.params !== null && typeof message.params === "object"
        ? (message.params as Record<string, unknown>)
        : {};
    const name = typeof params.name === "string" ? params.name : "";
    const args =
      params.arguments !== null && typeof params.arguments === "object"
        ? (params.arguments as ToolArgs)
        : {};
    const called = callTiseTool(name, args);
    if (!called.ok) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: called.error }],
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(called.data) }],
        structuredContent: called.data,
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}
