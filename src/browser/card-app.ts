/**
 * card-app — the card talking to an MCP Apps host.
 *
 * Bundled into the one HTML file (scripts/bundle-card-app.mjs). The sandbox
 * is deny-by-default, so this never loads a URL. With no host (a browser,
 * the saved file, GET /card, the CLI) window.parent is the page itself and
 * this does nothing: the card stays as drawn.
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
