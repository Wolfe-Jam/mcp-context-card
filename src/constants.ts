/** Server identity constants, in their own module so any file can import
 *  them without pulling in the whole server. */
export const NAME = "mcp-context-card";
export const VERSION = "1.2.0";
export const SERVER_CARD_URI = "mcp-context-card://server-card";

/** MCP Apps (io.modelcontextprotocol/ui): the card as an inline UI resource.
 *  A host that supports MCP Apps fetches this resource and renders it in a
 *  sandboxed iframe next to the conversation. */
export const CARD_UI_URI = "ui://mcp-context-card/card.html";
export const MCP_APP_MIME = "text/html;profile=mcp-app";
export const UI_EXTENSION = "io.modelcontextprotocol/ui";
