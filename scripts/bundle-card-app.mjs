#!/usr/bin/env node
/**
 * bundle-card-app.mjs — inline the MCP Apps helper into one script.
 *
 * The card is one self-contained HTML file. The host sandbox loads no CDN
 * and makes no external request, so @modelcontextprotocol/ext-apps is
 * bundled here, at build time, into src/card-app.bundle.js. render-card.ts
 * drops that file inside the card's single <script>. Regenerate with
 * `node scripts/bundle-card-app.mjs`. card:check does that and fails if the
 * committed bundle drifted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/browser/card-app.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  write: false,
  define: { __CARD_APP_VERSION__: JSON.stringify(version) },
});

// A "</script>" inside the bundle would close the card's script early.
const js = result.outputFiles[0].text
  .replace(/<\/script/gi, "<\\/script")
  .replace(/<!--/g, "<\\!--");

writeFileSync(join(root, "src/card-app.bundle.js"), js);
console.log(`bundled card app ${version} → src/card-app.bundle.js (${js.length} bytes)`);
