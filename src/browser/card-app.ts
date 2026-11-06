/**
 * card-app — the card talking to an MCP Apps host.
 *
 * Bundled only into ui://mcp-context-card/card.html (scripts/bundle-card-app.mjs),
 * with the inline view. The sandbox is deny-by-default, so this never loads
 * a URL. The saved file, GET /card and the CLI do not include this script.
 * With no host, window.parent is the page itself and this does nothing.
 *
 * Inside a host, App.connect() runs ui/initialize and, with autoResize,
 * sends ui/notifications/size-changed when the document's size changes.
 * The host context (McpUiHostContext) says where the card is:
 * displayMode "inline" or "pip" shows the inline view; "fullscreen" shows
 * the full card. "Open full card" calls requestDisplayMode({ mode:
 * "fullscreen" }) only when availableDisplayModes includes "fullscreen".
 * A host that stays smaller offers the saved context-card.html.
 *
 * Read from @modelcontextprotocol/ext-apps App (connect, autoResize,
 * getHostContext, addEventListener "hostcontextchanged", requestDisplayMode)
 * and spec.types McpUiHostContext / McpUiDisplayMode — not guessed.
 */
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";

declare const __CARD_APP_VERSION__: string;

/** A chat panel, not a page. Fullscreen is the only host mode that fits the full card. */
function miniMode(mode: string | undefined): boolean {
  return mode === "inline" || mode === "pip";
}

function applyView(ctx: McpUiHostContext | undefined): void {
  const inline = document.getElementById("inline-view");
  if (!inline) return;
  const root = document.documentElement;
  const mini = miniMode(ctx?.displayMode);
  if (mini) {
    root.dataset.view = "inline";
    inline.hidden = false;
  } else {
    delete root.dataset.view;
    inline.hidden = true;
    const saved = document.getElementById("inline-saved");
    if (saved) saved.hidden = true;
  }
  const theme = ctx?.theme;
  const body = document.body;
  if (body?.dataset && (theme === "light" || theme === "dark")) {
    body.dataset.theme = theme;
  }
}

function offerSavedFile(): void {
  const saved = document.getElementById("inline-saved");
  if (saved) saved.hidden = false;
}

async function openFull(app: App): Promise<void> {
  const ctx = app.getHostContext();
  // The helper's own example: ask only for a mode the host listed.
  if (!ctx?.availableDisplayModes?.includes("fullscreen")) {
    offerSavedFile();
    return;
  }
  try {
    const result = await app.requestDisplayMode({ mode: "fullscreen" });
    if (result.mode !== "fullscreen") {
      offerSavedFile();
      applyView(app.getHostContext());
      return;
    }
    const saved = document.getElementById("inline-saved");
    if (saved) saved.hidden = true;
    applyView({ ...(app.getHostContext() ?? {}), displayMode: "fullscreen" });
  } catch {
    offerSavedFile();
  }
}

const parent = window.parent;
if (parent !== window) {
  const app = new App(
    { name: "mcp-context-card", version: __CARD_APP_VERSION__ },
    {},
    { autoResize: true },
  );
  // Register before connect(), or a host-context notification can be missed.
  app.addEventListener("hostcontextchanged", () => {
    applyView(app.getHostContext());
  });
  document.getElementById("open-full-card")?.addEventListener("click", () => {
    void openFull(app);
  });
  // A frame that never answers leaves the card as drawn.
  app
    .connect()
    .then(() => applyView(app.getHostContext()))
    .catch(() => {});
}
