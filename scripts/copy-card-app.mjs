#!/usr/bin/env node
// The published server reads the bundle from next to dist/render-card.js.
// tsc does not copy .js assets. The bundle itself is committed; this only copies.
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
copyFileSync(join(root, "src/card-app.bundle.js"), join(root, "dist/card-app.bundle.js"));
