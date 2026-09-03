/**
 * mcp-trinity server — a minimal, domain-agnostic MCP server that
 * demonstrates the three things servers keep reinventing:
 *
 *   - describe_project  (context)  — a param the host can fill from `.faf`
 *   - remember / recall (memory)   — file-backed against a `.fafm`
 *   - whoami             (identity) — this server's own `.fafa`
 *
 * ...exposed through the two mechanisms already in the ecosystem:
 *
 *   1. Server Card `_meta` — emitted in the `initialize` result AND
 *      readable as the `mcp-trinity://server-card` resource.
 *   2. ai-catalog `.well-known/ai-catalog.json` — three sibling entries
 *      (see catalog-gen.ts), served over HTTP by the http transport.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  InitializeRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contextFieldsFromProjectFaf } from "./context.js";
import { recall, remember } from "./memory.js";
import { trinityMeta, whoami } from "./identity.js";

const here = dirname(fileURLToPath(import.meta.url));
/** Package root — `dist/` at runtime, `src/` under tsx. Both are one up. */
export const ROOT = join(here, "..");
const FAF = join(ROOT, "project.faf");
const FAFM = join(ROOT, "project.fafm");

const SERVER_CARD_URI = "mcp-trinity://server-card";
export const NAME = "mcp-trinity";
export const VERSION = "0.2.0";

export function createServer(): Server {
  const server = new Server(
    { name: NAME, version: VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  // ── Mechanism 1: Server Card _meta ──────────────────────────────────
  // Wire trinityMeta() into the `initialize` result (top-level `_meta`,
  // where it survives client-side schema parsing — inside `serverInfo` it
  // would be stripped). v0.1.0 only console.log'd this; now it's real.
  const sdkOnInitialize = (
    server as unknown as { _oninitialize: (r: unknown) => Promise<Record<string, unknown>> }
  )._oninitialize.bind(server);
  server.setRequestHandler(InitializeRequestSchema, async (req) => ({
    ...(await sdkOnInitialize(req)),
    _meta: trinityMeta(),
  }));

  // ...and as a resource, so any stdio client can read the full card.
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: SERVER_CARD_URI,
        name: "Server Card",
        description: "This server's identity + the trinity _meta block.",
        mimeType: "application/json",
      },
    ],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    if (req.params.uri !== SERVER_CARD_URI) {
      throw new Error(`unknown resource: ${req.params.uri}`);
    }
    return {
      contents: [
        {
          uri: SERVER_CARD_URI,
          mimeType: "application/json",
          text: JSON.stringify(
            { name: NAME, version: VERSION, _meta: trinityMeta() },
            null,
            2,
          ),
        },
      ],
    };
  });

  // ── Tools ───────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "describe_project",
        description: "Describe the current project. `project_name` is required — a host can fill it from a `.faf`.",
        inputSchema: {
          type: "object",
          properties: { project_name: { type: "string", description: "Project name" } },
          required: ["project_name"],
        },
      },
      {
        name: "remember",
        description: "Store a fact in persistent memory (a `.fafm` file).",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, text: { type: "string" } },
          required: ["id", "text"],
        },
      },
      {
        name: "recall",
        description: "Retrieve a fact from persistent memory by id.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
      {
        name: "whoami",
        description: "Return this server's own agent identity (`.fafa`).",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, string>;
    switch (req.params.name) {
      case "describe_project": {
        if (!args.project_name) {
          return {
            content: [
              {
                type: "text",
                text: "⛔ project_name is required — none supplied. A real agent now has to guess or ask. A host that read a .faf would have filled it.",
              },
            ],
          };
        }
        return { content: [{ type: "text", text: `✅ Scoped to project: ${args.project_name}` }] };
      }
      case "remember": {
        remember(FAFM, args.id, args.text);
        return { content: [{ type: "text", text: `remembered: ${args.id}` }] };
      }
      case "recall": {
        const fact = recall(FAFM, args.id);
        return {
          content: [{ type: "text", text: fact ? fact.text : `(no memory for "${args.id}")` }],
        };
      }
      case "whoami":
        return { content: [{ type: "text", text: whoami(ROOT) }] };
      default:
        throw new Error(`unknown tool: ${req.params.name}`);
    }
  });

  return server;
}

/** Read the `.faf`'s fillable fields — used by hosts and the demo. */
export function projectFields(): Record<string, string> {
  return contextFieldsFromProjectFaf(FAF);
}

/** Connect a server instance to a transport (stdio or http). */
export async function serve(transport: Transport): Promise<Server> {
  const server = createServer();
  await server.connect(transport);
  return server;
}

// Direct `tsx src/server.ts` (and the tsx-spawned demo child) → stdio.
if (import.meta.url === `file://${process.argv[1]}`) {
  await serve(new StdioServerTransport());
}
