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
/** Default package root — `dist/` at runtime, `src/` under tsx. Both are one up. */
export const ROOT = join(here, "..");

export const SERVER_CARD_URI = "mcp-trinity://server-card";
export const NAME = "mcp-trinity";
export const VERSION = "0.2.0";

/**
 * The Server Card — this server's identity plus the `_meta` trinity block,
 * one namespaced key per IANA-registered format. Served in-band as the
 * `mcp-trinity://server-card` resource and out-of-band at
 * `/.well-known/mcp/server-card`.
 */
export function serverCard() {
  return { name: NAME, version: VERSION, _meta: trinityMeta() };
}

/**
 * @param root  directory holding `project.faf`, `project.fafm`, `.well-known/`.
 *              Defaults to the package root; a fork or a test points it
 *              somewhere else.
 */
export function createServer(root: string = ROOT): Server {
  const FAF = join(root, "project.faf");
  const FAFM = join(root, "project.fafm");

  const server = new Server(
    { name: NAME, version: VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  // ── Mechanism 1: the Server Card + its _meta trinity block ──────────
  // A Server Card (SEP-2127) is a document, not an initialize field — so
  // it's exposed the two ways a client can actually consume it:
  //   • in-band: the `mcp-trinity://server-card` MCP resource, below
  //   • out-of-band: GET /.well-known/mcp/server-card (http transport)
  // Both return the same object, with `_meta` carrying one namespaced key
  // per IANA-registered format. v0.1.0 only console.log'd this block.
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
          text: JSON.stringify(serverCard(), null, 2),
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
        return { content: [{ type: "text", text: whoami(root) }] };
      default:
        throw new Error(`unknown tool: ${req.params.name}`);
    }
  });

  return server;
}

/** Read a project's `.faf` fillable fields (default: this package). */
export function projectFields(root: string = ROOT): Record<string, string> {
  return contextFieldsFromProjectFaf(join(root, "project.faf"));
}

/** Connect a server instance to a transport (stdio or http). */
export async function serve(transport: Transport, root: string = ROOT): Promise<Server> {
  const server = createServer(root);
  await server.connect(transport);
  return server;
}

// Direct `tsx src/server.ts` (and the tsx-spawned demo child) → stdio.
if (import.meta.url === `file://${process.argv[1]}`) {
  await serve(new StdioServerTransport());
}
