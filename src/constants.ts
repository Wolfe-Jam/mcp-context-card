/** Server identity constants, in their own module so any file can import
 *  them without pulling in the whole server. */
export const NAME = "mcp-context-card";
export const VERSION = "1.4.0";
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
export const publishMemoryFromEnv = (env: NodeJS.ProcessEnv = process.env) => env[PUBLISH_MEMORY_ENV] === "1";

/** MCP Apps (io.modelcontextprotocol/ui): the card as an inline UI resource.
 *  A host that supports MCP Apps fetches this resource and renders it in a
 *  sandboxed iframe next to the conversation. */
export const CARD_UI_URI = "ui://mcp-context-card/card.html";
export const MCP_APP_MIME = "text/html;profile=mcp-app";
export const UI_EXTENSION = "io.modelcontextprotocol/ui";
