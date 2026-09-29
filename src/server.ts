/**
 * mcp-context-card server — makes a project's context, memory, and identity
 * discoverable to any MCP client.
 *
 *   context   — read_agents_md · list_agents_md_sections · author_agents_md   (this project's AGENTS.md)
 *   memory    — remember · recall · forget                                    (a .fafm file)
 *   identity  — whoami                                                        (this server's .fafa)
 *   discovery — list_context_sources · render_context_card · save_context_card (what's published, and how)
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
  RootsListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findSection, parseAgentsMd } from "./agents-md.js";
import { authorAgentsMd } from "./author.js";
import { forget, parseFafm, recall, remember } from "./memory.js";
import { identity, resolveIdentity, serverCardMeta, whoami } from "./identity.js";
import { renderCard, renderCardText, safeAccent, type Theme } from "./render-card.js";

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

/** Sent to every client at initialize. Hosts that support MCP Apps show the
 *  card inline; for the rest, this steers the model to save the card as a
 *  file instead of pasting a whole HTML page into the chat. */
export const INSTRUCTIONS =
  "This server publishes a project's context (AGENTS.md), memory (project.fafm) and identity (.well-known/fafa). " +
  "Read them with read_agents_md, recall and whoami; list_context_sources says what is published and where. " +
  "When the user wants to see the context card: hosts that support MCP Apps display it inline from render_context_card. " +
  "Otherwise, don't paste the card's HTML into the conversation. Call save_context_card: it writes context-card.html " +
  "into the project, opens it in the user's browser when this server runs locally, and returns the card as Markdown " +
  "with a link to the saved file. Show the user that Markdown as returned, including the link, so they see the card " +
  "in the chat and can open the full version in a browser.";

/** Theme / accent / expanded from tool arguments, shared by render and save. */
function cardOptions(args: Record<string, unknown>) {
  const theme = args.theme as string;
  return {
    theme: (["light", "dark", "auto"].includes(theme) ? theme : "auto") as Theme,
    accent: safeAccent(args.accent as string | undefined),
    expanded: args.expanded === true || args.expanded === "true",
  };
}

const CARD_ARGS = {
  theme: { type: "string", enum: ["light", "dark", "auto"], description: "default: auto" },
  accent: { type: "string", description: "CSS hex colour, e.g. #FF702D (default: the AAIF palette)" },
  expanded: { type: "boolean", description: "render every AGENTS.md section open (default: collapsed)" },
};

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

export interface ServerOptions {
  /** Open a saved file for the person. Set only for a local (stdio) server;
   *  over HTTP the browser would open on the server, so it stays unset. */
  openFile?: (path: string) => void;
  /** No root was configured: find the user's project instead — the client's
   *  MCP roots, then `cwd` if it holds an AGENTS.md, then `root`. Local only. */
  detectRoot?: boolean;
  /** The directory the server was started in (default: process.cwd()). */
  cwd?: string;
}

/** Where "this project" came from, reported by list_context_sources. */
type ProjectFrom = "configured" | "client roots" | "start directory" | "package";

export function createServer(root: string = ROOT, opts: ServerOptions = {}): Server {
  const server = new Server(
    { name: NAME, version: VERSION },
    { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS },
  );

  // ── Which project? ────────────────────────────────────────────────────
  // Resolved per call, not at startup: a client's roots are only known once
  // it has connected, and they can change (goose sends its session's working
  // directory, and notifies when it moves).
  let found: { root: string; from: ProjectFrom } | undefined;
  server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    found = undefined;
  });
  const isDir = (p: string) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  async function fromClientRoots(): Promise<string | undefined> {
    if (!server.getClientCapabilities()?.roots) return undefined;
    try {
      const { roots } = await server.listRoots(undefined, { timeout: 5000 });
      for (const r of roots) {
        if (!r.uri.startsWith("file:")) continue;
        const dir = fileURLToPath(r.uri);
        if (isDir(dir)) return dir;
      }
    } catch {
      // a client that declares roots but doesn't answer: fall through
    }
    return undefined;
  }
  async function project(): Promise<{ root: string; from: ProjectFrom }> {
    if (!opts.detectRoot) return { root, from: root === ROOT ? "package" : "configured" };
    if (found) return found;
    const fromRoots = await fromClientRoots();
    const cwd = opts.cwd ?? process.cwd();
    found = fromRoots
      ? { root: fromRoots, from: "client roots" }
      : existsSync(join(cwd, "AGENTS.md"))
        ? { root: cwd, from: "start directory" }
        : { root, from: "package" };
    return found;
  }
  const files = (dir: string) => ({
    AGENTS: join(dir, "AGENTS.md"),
    FAFM: join(dir, "project.fafm"),
  });

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
        contents: [{ uri: CARD_UI_URI, mimeType: MCP_APP_MIME, text: renderCard((await project()).root, { theme: "auto" }) }],
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
        inputSchema: { type: "object", properties: CARD_ARGS },
      },
      {
        name: "save_context_card",
        title: "Save Context Card",
        annotations: { title: "Save Context Card", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        description:
          "Write the context card to context-card.html in the project and, when this server runs locally, open it in the person's browser. Returns the card as Markdown (identity, AGENTS.md sections, memory, discovery) plus a clickable link to the saved file. Use this instead of pasting render_context_card's HTML into a chat that can't display it. Replaces any earlier context-card.html.",
        inputSchema: {
          type: "object",
          properties: {
            ...CARD_ARGS,
            open: {
              type: "boolean",
              description: "open the saved card in the person's browser when the server runs locally (default: true)",
            },
            detail: {
              type: "string",
              enum: ["tldr", "full"],
              description: "the Markdown reply: tldr (default) shows five facts, each cut short; full shows every fact whole. The saved file always has everything.",
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, string>;
    const { root, from } = await project();
    const { AGENTS, FAFM } = files(root);
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
        if (hostRendersApps(server)) {
          // The host renders the card itself from CARD_UI_URI, so the model
          // gets a short summary instead of a whole HTML page.
          const doc = parseAgentsMd(AGENTS);
          const mem = parseFafm(FAFM);
          const sections = doc?.sections.length ?? 0;
          const facts = mem.facts.length;
          return text(
            `Showing the context card for ${resolveIdentity(root)?.name ?? basename(root)}: AGENTS.md with ${sections} section${sections === 1 ? "" : "s"}, ` +
              `${facts} remembered fact${facts === 1 ? "" : "s"}, and this server's identity. ` +
              "The card is displayed to the user; call read_agents_md or recall for the text itself.",
          );
        }
        return text(renderCard(root, cardOptions(args)));
      }
      case "save_context_card": {
        const out = join(root, "context-card.html");
        writeFileSync(out, renderCard(root, cardOptions(args)));
        // Many hosts won't follow a file:// link, so a local server opens it.
        const raw = (args as Record<string, unknown>).open;
        const opened = !!opts.openFile && raw !== false && raw !== "false";
        if (opened) opts.openFile!(out);
        return text(
          `${renderCardText(root, { detail: args.detail === "full" ? "full" : "tldr" })}\n\n` +
            "_In a host that supports MCP Apps, this card shows inline._\n\n---\n\n" +
            (opened ? "Opened the full card in your browser.\n\n" : "") +
            `**[Open the full card in your browser](${pathToFileURL(out).href})**\n\n` +
            // Some hosts won't follow a file:// link; a code block gets a copy button.
            `Or copy this into your browser's address bar:\n\n\`\`\`\n${pathToFileURL(out).href}\n\`\`\`\n\nSaved to ${out}`,
        );
      }
      case "list_context_sources": {
        const doc = parseAgentsMd(AGENTS);
        const mem = parseFafm(FAFM);
        return text(
          JSON.stringify(
            {
              project: { path: root, from },
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
                mcp: {
                  serverCard: `resource ${SERVER_CARD_URI}`,
                  card: `resource ${CARD_UI_URI} (MCP App, ${MCP_APP_MIME})`,
                },
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
export async function serve(transport: Transport, root: string = ROOT, opts: ServerOptions = {}): Promise<Server> {
  const server = createServer(root, opts);
  await server.connect(transport);
  return server;
}

// Direct run (incl. the demo's spawned child) → stdio. pathToFileURL keeps
// this correct on Windows, where argv[1] is a `C:\...` path.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { openInBrowser } = await import("./open.js");
  const pinned = process.env.MCP_CONTEXT_CARD_ROOT;
  await serve(new StdioServerTransport(), pinned ?? ROOT, { openFile: openInBrowser, detectRoot: !pinned });
}
