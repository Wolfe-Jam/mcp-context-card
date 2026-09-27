/**
 * mcp-context-card server — makes a project's context, memory, and identity
 * discoverable to any MCP client.
 *
 *   context   — read_agents_md · list_agents_md_sections · author_agents_md   (this project's AGENTS.md)
 *   memory    — remember · recall · forget                                    (a .fafm file)
 *   identity  — whoami                                                        (this server's .fafa)
 *   discovery — list_context_sources · render_context_card                    (what's published, and how)
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
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findSection, parseAgentsMd } from "./agents-md.js";
import { authorAgentsMd } from "./author.js";
import { forget, parseFafm, recall, remember } from "./memory.js";
import { identity, serverCardMeta, whoami } from "./identity.js";
import { renderCard, safeAccent, type Theme } from "./render-card.js";

export { NAME, VERSION, SERVER_CARD_URI } from "./constants.js";
import { NAME, VERSION, SERVER_CARD_URI, CARD_UI_URI, MCP_APP_MIME, UI_EXTENSION } from "./constants.js";

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
  return { name: NAME, version: VERSION, _meta: serverCardMeta() };
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

/**
 * @param root  directory holding `AGENTS.md`, `project.fafm`, `.well-known/`.
 *              Defaults to the package root; a deploy points `MCP_CONTEXT_CARD_ROOT`
 *              at a real project, a test points it at a fixture.
 */
/** True when the connected client declared MCP Apps support
 *  (capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes). */
function hostRendersApps(server: Server): boolean {
  const ext = server.getClientCapabilities()?.extensions?.[UI_EXTENSION] as { mimeTypes?: unknown } | undefined;
  return Array.isArray(ext?.mimeTypes) && ext.mimeTypes.includes(MCP_APP_MIME);
}

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
      {
        uri: CARD_UI_URI,
        name: "Context Card",
        description: "The context card as an MCP App: identity, AGENTS.md, memory and discovery, rendered inline by hosts that support MCP Apps.",
        mimeType: MCP_APP_MIME,
      },
    ],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    if (req.params.uri === CARD_UI_URI) {
      // Rendered at read time from the project's own files. The card is
      // self-contained (inline CSS, no external requests), and its one script
      // is progressive enhancement, so it still works in a strict sandbox.
      return {
        contents: [{ uri: CARD_UI_URI, mimeType: MCP_APP_MIME, text: renderCard(root, { theme: "auto" }) }],
      };
    }
    if (req.params.uri !== SERVER_CARD_URI) {
      throw new Error(`unknown resource: ${req.params.uri}`);
    }
    return {
      contents: [
        { uri: SERVER_CARD_URI, mimeType: "application/json", text: JSON.stringify(serverCard(), null, 2) },
      ],
    };
  });
  // The `resources` capability implies resources/templates/list. There are no
  // templated resources here (the Server Card URI is fixed), but answer with an
  // empty list rather than -32601 — a client shouldn't get method-not-found for
  // something the declared capability covers.
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [],
  }));

  // ── Tools ───────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "read_agents_md",
        title: "Read AGENTS.md",
        annotations: { title: "Read AGENTS.md", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
        name: "author_agents_md",
        title: "Draft an AGENTS.md",
        annotations: { title: "Draft an AGENTS.md", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        description:
          "Author an AGENTS.md for this project and return the draft — BETTER from repo facts alone (via agents-md-facts: real build/test commands, entry points, toolchain conventions, nothing invented), or BEST when a project.faf exists (facts plus its structured goal/who/why as a second managed block ahead of them). Does not write a file.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_agents_md_sections",
        title: "List AGENTS.md Sections",
        annotations: { title: "List AGENTS.md Sections", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        description:
          "List the headings in this project's AGENTS.md, so a client can pull one section instead of spending context on the whole file.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "remember",
        title: "Remember a Fact",
        annotations: { title: "Remember a Fact", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        description:
          "Persist a fact past the session boundary — written to a .fafm file, not held in memory. Reusing an existing id replaces that fact's text in place (no duplicate); a new id appends. Facts are written verification_status: unverified.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "A stable key you choose for this fact — pass the same id later to recall or forget it. Exact match, case-sensitive, any string; keep it short and meaningful (e.g. \"deploy-target\", \"db-url\"). Reusing an id updates that fact rather than adding a second one.",
            },
            text: {
              type: "string",
              description: "The fact itself, as plain prose. Stored verbatim and returned as-is by recall.",
            },
          },
          required: ["id", "text"],
        },
      },
      {
        name: "recall",
        title: "Recall a Fact",
        annotations: { title: "Recall a Fact", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        description: "Retrieve a fact stored in a previous session by id. Exact lookup — not fuzzy or substring.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The exact id a previous remember call used. Returns the stored text, or a \"no memory for <id>\" message if nothing matches.",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "forget",
        title: "Forget a Fact",
        annotations: { title: "Forget a Fact", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        description: "Remove a fact by id — to correct or drop something stale. A missing id is reported, not an error.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The exact id of the fact to remove. Reports whether a fact was actually removed.",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "whoami",
        title: "Who Am I",
        annotations: { title: "Who Am I", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        description: "This server's own identity — name, vendor, version, status, license — from its .fafa card.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_context_sources",
        title: "List Context Sources",
        annotations: { title: "List Context Sources", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        description:
          "What context does this project publish (AGENTS.md, memory, identity), in what media types, and through which discovery surface. For a client connecting cold.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "render_context_card",
        title: "Render Context Card",
        // MCP Apps: hosts that support it render the card inline from this
        // resource. Both key forms, as the official ext-apps helper writes them.
        _meta: { ui: { resourceUri: CARD_UI_URI }, "ui/resourceUri": CARD_UI_URI },
        annotations: { title: "Render Context Card", readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        description:
          "Render the whole card — identity, AGENTS.md, memory, discovery — as one self-contained HTML page a person can read or screenshot. AGENTS.md sections collapse by default; pass expanded:true for the full render. Also served at GET /card (?expand=all) over the HTTP transport.",
        inputSchema: {
          type: "object",
          properties: {
            theme: { type: "string", enum: ["light", "dark", "auto"], description: "default: auto" },
            accent: { type: "string", description: "CSS hex colour, e.g. #FF702D (default: the AAIF palette)" },
            expanded: { type: "boolean", description: "render every AGENTS.md section open (default: collapsed)" },
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
      case "author_agents_md": {
        const a = authorAgentsMd(root);
        const tier = a.tier === "best" ? "BEST (project.faf + facts)" : "BETTER (facts only)";
        const note = a.exists
          ? `${tier} — AGENTS.md already exists, diff this in, don't overwrite`
          : `${tier} — no AGENTS.md yet, write this, then \`npx agents-md-facts --check\` keeps the facts block true`;
        return text(`<!-- ${note} -->\n\n${a.markdown}`);
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
      case "render_context_card": {
        const rawExpanded = (args as Record<string, unknown>).expanded;
        if (hostRendersApps(server)) {
          // The host renders the card itself from CARD_UI_URI, so the model
          // gets a short summary instead of a whole HTML page.
          const doc = parseAgentsMd(AGENTS);
          const mem = parseFafm(FAFM);
          const sections = doc?.sections.length ?? 0;
          const facts = mem.facts.length;
          return text(
            `Showing the context card for ${NAME}: AGENTS.md with ${sections} section${sections === 1 ? "" : "s"}, ` +
              `${facts} remembered fact${facts === 1 ? "" : "s"}, and this server's identity. ` +
              "The card is displayed to the user; call read_agents_md or recall for the text itself.",
          );
        }
        return {
          content: [
            {
              type: "text" as const,
              text: renderCard(root, {
                theme: (["light", "dark", "auto"].includes(args.theme) ? args.theme : "auto") as Theme,
                accent: safeAccent(args.accent),
                expanded: rawExpanded === true || rawExpanded === "true",
              }),
            },
          ],
        };
      }
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
                present: identity(root) !== null,
              },
              surfaces: {
                mcp: { serverCard: `resource ${SERVER_CARD_URI}` },
                http: {
                  serverCard: "GET /.well-known/mcp/server-card",
                  aiCatalog: "GET /.well-known/ai-catalog.json",
                  card: "GET /card",
                },
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
