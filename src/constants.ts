/** Server identity constants, in their own module so any file can import
 *  them without pulling in the whole server. */
export const NAME = "mcp-context-card";
export const VERSION = "1.9.5";
export const SERVER_CARD_URI = "mcp-context-card://server-card";

/** The server's registry identity: reverse-DNS, the same as server.json `name`.
 *  It is also `serverInfo.name`, so a Server Card never contradicts the live
 *  connection (MCP Server Cards, SEP-2127: "Consistency with Runtime Behavior"). */
export const REGISTRY_NAME = "io.github.Wolfe-Jam/mcp-context-card";
/** Human-readable name: `serverInfo.title` and the Server Card `title`. */
export const TITLE = "MCP Context Card";
/** Same text as server.json `description` (1–100 chars, required on a Server Card). */
export const DESCRIPTION =
  "MCP server for a project's context (AGENTS.md), memory, and identity — base or drop-in extension.";
export const REPOSITORY_URL = "https://github.com/Wolfe-Jam/mcp-context-card";

/** MCP Server Cards (SEP-2127, Final): schema v1 and media types. */
export const SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";
export const SERVER_CARD_MEDIA_TYPE = "application/mcp-server-card+json";
export const AI_CATALOG_MEDIA_TYPE = "application/ai-catalog+json";
/** Where a card is hosted: the spec's reserved `<streamable-http-url>/server-card`. */
export const MCP_PATH = "/mcp";
export const SERVER_CARD_PATH = `${MCP_PATH}/server-card`;
/** The 1.x location, kept as an alias so existing links keep working. */
export const LEGACY_SERVER_CARD_PATH = "/.well-known/mcp/server-card";
/**
 * Set to `1` to publish the memory file (`project.fafm`) over HTTP and list it
 * in the AI Catalog. Off by default: memory is written during sessions, and
 * discovery documents must not carry user- or session-specific data (SEP-2127).
 */
export const PUBLISH_MEMORY_ENV = "MCP_CONTEXT_CARD_PUBLISH_MEMORY";
/** Extra Host names the HTTP server accepts (comma-separated), e.g. a reverse proxy's public name. */
export const ALLOWED_HOSTS_ENV = "MCP_CONTEXT_CARD_ALLOWED_HOSTS";
/** Browser origins allowed to call the HTTP server (comma-separated). */
export const ALLOWED_ORIGINS_ENV = "MCP_CONTEXT_CARD_ALLOWED_ORIGINS";
export const publishMemoryFromEnv = (env: NodeJS.ProcessEnv = process.env) => env[PUBLISH_MEMORY_ENV] === "1";

/** What the ui:// card carries for an MCP Apps host. `helper` (the default):
 *  the official MCP Apps helper, so the card reports its size (~700 KB).
 *  `plain`: the plain card (~30 KB), no MCP Apps messages; the host's default
 *  frame. Only the ui:// resource changes: tool text, save_context_card,
 *  GET /card and the CLI are always the plain card. */
export const CARD_APP_ENV = "MCP_CONTEXT_CARD_APP";
export type CardApp = "helper" | "plain";
const CARD_APP_VALUES: readonly CardApp[] = ["helper", "plain"];
const warnedCardApp = new Set<string>();
/** A setting value as a CardApp: trimmed, any case. Anything else: undefined. */
export function toCardApp(value: unknown): CardApp | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  return (CARD_APP_VALUES as readonly string[]).includes(v) ? (v as CardApp) : undefined;
}
/** Unset or empty = `helper`. `plain`/`helper` in any case. Any other value:
 *  one stderr line per distinct value (a server builds an instance per HTTP
 *  request; warn once), then `helper`. */
export function cardAppFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  warn: (line: string) => void = (line) => console.error(line),
): CardApp {
  const raw = env[CARD_APP_ENV]?.trim();
  if (!raw) return "helper";
  const known = toCardApp(raw);
  if (known) return known;
  if (!warnedCardApp.has(raw)) {
    warnedCardApp.add(raw);
    warn(`${NAME} · ${CARD_APP_ENV}="${raw}" is not one of ${CARD_APP_VALUES.join(", ")}; using helper`);
  }
  return "helper";
}

/** MCP Apps (io.modelcontextprotocol/ui): the card as an inline UI resource.
 *  A host that supports MCP Apps fetches this resource and renders it in a
 *  sandboxed iframe next to the conversation. */
export const CARD_UI_URI = "ui://mcp-context-card/card.html";
export const MCP_APP_MIME = "text/html;profile=mcp-app";
export const UI_EXTENSION = "io.modelcontextprotocol/ui";

/** Protocol revisions served beside the SDK's 2025-era list (SUPPORTED_PROTOCOL_VERSIONS):
 *  createMcpHandler / serveStdio answer 2026-07-28 too. The SDK exports no constant for it. */
export const MODERN_PROTOCOL_VERSIONS = ["2026-07-28"] as const;
