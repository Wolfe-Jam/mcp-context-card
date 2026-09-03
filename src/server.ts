/**
 * mcp-context-card server — makes a project's context, memory, and identity
 * discoverable to any MCP client.
 *
 *   context   — read_agents_md · list_agents_md_sections   (this project's AGENTS.md)
 *   memory    — remember · recall · forget                 (a .fafm file)
 *   identity  — whoami                                     (this server's .fafa)
 *   discovery — list_context_sources                       (what's published, and how)
 *
 * ...exposed through the two mechanisms already in the ecosystem:
 *
 *   1. Server Card `_meta` — the `mcp-context-card://server-card` resource (in band)
 *      and `GET /.well-known/mcp/server-card` (out of band, http transport).
 *   2. ai-catalog — `GET /.well-known/ai-catalog.json`, three sibling entries
 *      keyed by media type (see catalog-gen.ts).
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
import { fileURLToPath, pathToFileURL } from "node:url";
import { findSection, parseAgentsMd } from "./agents-md.js";
import { forget, parseFafm, recall, remember } from "./memory.js";
import { trinityMeta, whoami } from "./identity.js";
import { renderCard, safeAccent, type Theme } from "./render-card.js";

export { NAME, VERSION, SERVER_CARD_URI } from "./constants.js";
import { NAME, VERSION, SERVER_CARD_URI } from "./constants.js";

const here = dirname(fileURLToPath(import.meta.url));
/** Default package root — `dist/` at runtime, `src/` under tsx. Both are one up. */
export const ROOT = join(here, "..");

/**
 * The Server Card — this server's identity plus the `_meta` context block,
 * one namespaced key per concern. Served in-band as the
 * `mcp-context-card://server-card` resource and out-of-band at
 * `/.well-known/mcp/server-card`.
 */
export function serverCard() {
  return { name: NAME, version: VERSION, _meta: trinityMeta() };
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

/**
 * @param root  directory holding `AGENTS.md`, `project.fafm`, `.well-known/`.
 *              Defaults to the package root; a deploy points `MCP_CONTEXT_CARD_ROOT`
 *              at a real project, a test points it at a fixture.
 */
export function createServer(root: string = ROOT): Server {
  const AGENTS = join(root, "AGENTS.md");
  const FAFM = join(root, "project.fafm");
  const FAFA = join(root, ".well-known/fafa");

  const server = new Server(
    { name: NAME, version: VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  // ── Mechanism 1: the Server Card resource + its _meta context block ───
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: SERVER_CARD_URI,
        name: "Server Card",
        description: "This server's identity + the _meta context block.",
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
        { uri: SERVER_CARD_URI, mimeType: "application/json", text: JSON.stringify(serverCard(), null, 2) },
      ],
    };
  });

  // ── Tools ───────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "read_agents_md",
        description:
          "Return this project's AGENTS.md — the whole file, or one section by heading. The instructions a client would otherwise have to know to look for and read wholesale.",
        inputSchema: {
          type: "object",
          properties: {
            section: {
              type: "string",
              description: "A heading to return just that section (case-insensitive, prefix match). Omit for the whole file.",
            },
          },
        },
      },
      {
        name: "list_agents_md_sections",
        description:
          "List the headings in this project's AGENTS.md, so a client can pull one section instead of spending context on the whole file.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "remember",
        description: "Persist a fact past the session boundary — written to a .fafm file, not held in memory.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, text: { type: "string" } },
          required: ["id", "text"],
        },
      },
      {
        name: "recall",
        description: "Retrieve a fact stored in a previous session by id.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
      {
        name: "forget",
        description: "Remove a fact by id — to correct or drop something stale.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
      {
        name: "whoami",
        description: "This server's own identity — name, vendor, version, status, license — from its .fafa card.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_context_sources",
        description:
          "What context does this project publish (AGENTS.md, memory, identity), in what media types, and through which discovery surface. For a client connecting cold.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "render_context_card",
        description:
          "Render the whole card — identity, AGENTS.md, memory, discovery — as one self-contained HTML page a person can read or screenshot. Also served at GET /card over the HTTP transport.",
        inputSchema: {
          type: "object",
          properties: {
            theme: { type: "string", enum: ["light", "dark", "auto"], description: "default: auto" },
            accent: { type: "string", description: "CSS hex colour, e.g. #FF702D (default: the AAIF palette)" },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, string>;
    switch (req.params.name) {
      case "read_agents_md": {
        const doc = parseAgentsMd(AGENTS);
        if (!doc) return text("(no AGENTS.md in this project)");
        if (!args.section) return text(doc.raw);
        const s = findSection(doc, args.section);
        return s
          ? text(`${"#".repeat(s.level)} ${s.heading}\n\n${s.body}`)
          : text(
              `(no section matching "${args.section}" — headings: ${doc.sections
                .map((x) => x.heading)
                .join(", ")})`,
            );
      }
      case "list_agents_md_sections": {
        const doc = parseAgentsMd(AGENTS);
        if (!doc) return text("(no AGENTS.md in this project)");
        return text(
          JSON.stringify(
            doc.sections.map((s) => ({ heading: s.heading, level: s.level })),
            null,
            2,
          ),
        );
      }
      case "remember": {
        remember(FAFM, args.id, args.text);
        return text(`remembered: ${args.id}`);
      }
      case "recall": {
        const fact = recall(FAFM, args.id);
        return text(fact ? fact.text : `(no memory for "${args.id}")`);
      }
      case "forget": {
        return text(forget(FAFM, args.id) ? `forgot: ${args.id}` : `(no memory for "${args.id}")`);
      }
      case "whoami":
        return text(whoami(root));
      case "render_context_card":
        return {
          content: [
            {
              type: "text" as const,
              text: renderCard(root, {
                theme: (["light", "dark", "auto"].includes(args.theme) ? args.theme : "auto") as Theme,
                accent: safeAccent(args.accent),
              }),
            },
          ],
        };
      case "list_context_sources": {
        const doc = parseAgentsMd(AGENTS);
        const mem = parseFafm(FAFM);
        return text(
          JSON.stringify(
            {
              context: {
                source: "AGENTS.md",
                mediaType: "text/markdown",
                present: !!doc,
                sections: doc?.sections.length ?? 0,
              },
              memory: {
                source: "project.fafm",
                mediaType: "application/vnd.fafm+yaml",
                present: mem.facts.length > 0 || mem.profile !== undefined,
                facts: mem.facts.length,
              },
              identity: {
                source: ".well-known/fafa",
                mediaType: "application/vnd.fafa+yaml",
                present: !whoami(root).startsWith("(no "),
              },
              surfaces: {
                serverCard: [`resource: ${SERVER_CARD_URI}`, "GET /.well-known/mcp/server-card"],
                aiCatalog: ["GET /.well-known/ai-catalog.json"],
              },
            },
            null,
            2,
          ),
        );
      }
      default:
        throw new Error(`unknown tool: ${req.params.name}`);
    }
  });

  return server;
}

/** Connect a server instance to a transport (stdio or http). */
export async function serve(transport: Transport, root: string = ROOT): Promise<Server> {
  const server = createServer(root);
  await server.connect(transport);
  return server;
}

// Direct run (incl. the demo's spawned child) → stdio. pathToFileURL keeps
// this correct on Windows, where argv[1] is a `C:\...` path.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await serve(new StdioServerTransport());
}
