/**
 * card-app — the card talking to an MCP Apps host.
 *
 * Bundled only into ui://mcp-context-card/card.html (scripts/bundle-card-app.mjs).
 * The sandbox is deny-by-default, so this never loads a URL. The saved file,
 * GET /card and the CLI do not include this script. With no host,
 * window.parent is the page itself and this does nothing.
 *
 * Inside a host, App.connect() runs ui/initialize and, with autoResize,
 * sends ui/notifications/size-changed when the document's size changes.
 * Read from @modelcontextprotocol/ext-apps App (connect, autoResize,
 * sendSizeChanged) — not guessed.
 */
import { App } from "@modelcontextprotocol/ext-apps";

declare const __CARD_APP_VERSION__: string;

const parent = window.parent;
if (parent !== window) {
  const app = new App(
    { name: "mcp-context-card", version: __CARD_APP_VERSION__ },
    {},
    { autoResize: true },
  );
  // A frame that never answers leaves the card as drawn.
  app.connect().catch(() => {});
}
