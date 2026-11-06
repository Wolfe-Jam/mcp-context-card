/**
 * card-gen - write docs/card.html from the three sources, so the card is
 * browsable on GitHub and screenshot-able for the README. Same renderer as
 * GET /card, the CLI, and render_context_card for a client without MCP Apps:
 * the plain card, without the MCP Apps helper. The ui:// resource is
 * rendered at read time and is not one of these files. A plain card over
 * 64 KB fails here, which fails card:check.
 *
 * Also writes two theme-pinned siblings (docs/card-light.html,
 * docs/card-dark.html) — docs/card.html stays "auto" (follows the viewer's
 * OS preference); the two siblings are for linking a forced theme from the
 * README, since a static host can't answer a `?theme=` query param.
 *
 * GitHub Pages serves this repo from main /docs (wolfe-jam.github.io/
 * mcp-context-card/) — docs/index.html (a copy of the auto card) is what
 * answers the bare root, so it isn't a 404.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PLAIN_CARD_LIMIT_BYTES, plainCardExceedsLimit, renderCard } from "./render-card.js";

function writePlain(path: string, html: string): void {
  if (plainCardExceedsLimit(html)) {
    throw new Error(
      `card:check: ${path} is ${Buffer.byteLength(html)} bytes; a plain card must not exceed ${PLAIN_CARD_LIMIT_BYTES} bytes (64 KB)`,
    );
  }
  writeFileSync(path, html);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const auto = renderCard(root);
  writePlain(join(root, "docs/card.html"), auto);
  writePlain(join(root, "docs/index.html"), auto);
  writePlain(join(root, "docs/card-light.html"), renderCard(root, { theme: "light" }));
  writePlain(join(root, "docs/card-dark.html"), renderCard(root, { theme: "dark" }));
  console.log(
    "wrote docs/card.html + docs/index.html (auto) + card-light.html + card-dark.html — the context card, rendered from AGENTS.md / project.fafm / .well-known/fafa",
  );
}
