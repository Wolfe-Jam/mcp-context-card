/**
 * card-gen - write docs/card.html from the three sources, so the card is
 * browsable on GitHub and screenshot-able for the README. Same renderer as
 * GET /card and the render_context_card tool.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderCard } from "./render-card.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  writeFileSync(join(root, "docs/card.html"), renderCard(root));
  console.log("wrote docs/card.html — the context card, rendered from AGENTS.md / project.fafm / .well-known/fafa");
}
