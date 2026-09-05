#!/usr/bin/env node
// check-versions.mjs — every version-bearing spot must equal package.json's.
//
// This repo has no `faf sync` (deliberate, vendor-neutral). That trades
// automated consistency for manual vigilance, and manual vigilance kept
// missing spots during 0.5.x/0.6.x releases. This script is the mechanical
// floor: run in CI and in prepublishOnly, it refuses on any drift.
//
// NOT checked here: prose counts ("104 tests", "Nine tools") — those change
// legitimately and need a human. This is version strings only.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const expected = JSON.parse(read("package.json")).version;
if (!/^\d+\.\d+\.\d+/.test(expected)) {
  console.error(`✗ package.json version unreadable: ${expected}`);
  process.exit(1);
}

/** @type {{file: string, label: string, re: RegExp}[]} */
const checks = [
  { file: "package-lock.json", label: 'top-level "version"', re: /^  "version": "([^"]+)"/m },
  { file: "package-lock.json", label: 'packages[""].version', re: /"":\s*\{\s*\n\s*"name": "[^"]+",\s*\n\s*"version": "([^"]+)"/m },
  { file: "server.json", label: 'top-level "version"', re: /^\s{2}"version": "([^"]+)"/m },
  { file: "server.json", label: "packages[0].version", re: /"identifier": "mcp-context-card",\s*\n\s*"version": "([^"]+)"/m },
  { file: "src/constants.ts", label: "VERSION", re: /export const VERSION = "([^"]+)"/ },
  { file: ".well-known/fafa", label: "agent.version", re: /^[ \t]+version: "([^"]+)"/m }, // indented — NOT the col-0 format version
  { file: "demo.ts", label: 'Client version (×2, first)', re: /new Client\(\{ name: "demo-host", version: "([^"]+)" \}/ },
  { file: "docs/MECHANISMS.md", label: 'hand-shown "version"', re: /"version": "([^"]+)"/ },
  { file: "examples/README.md", label: 'hand-shown "version"', re: /"version": "([^"]+)"/ },
];

let drift = 0;
for (const { file, label, re } of checks) {
  let src;
  try {
    src = read(file);
  } catch {
    console.error(`✗ ${file} — not found`);
    drift = 1;
    continue;
  }
  const m = src.match(re);
  if (!m) {
    console.error(`✗ ${file} (${label}) — pattern didn't match; the file's shape changed, update this script`);
    drift = 1;
    continue;
  }
  if (m[1] !== expected) {
    console.error(`✗ ${file} (${label}) = ${m[1]}  (expected ${expected})`);
    drift = 1;
  }
}

// demo.ts carries the Client version twice — both must match.
const demo = read("demo.ts");
const demoHits = [...demo.matchAll(/version: "(\d+\.\d+\.\d+[^"]*)" \}, \{ capabilities/g)].map((m) => m[1]);
if (demoHits.length !== 2) {
  console.error(`✗ demo.ts — expected 2 Client version literals, found ${demoHits.length}`);
  drift = 1;
} else if (demoHits.some((v) => v !== expected)) {
  console.error(`✗ demo.ts — Client versions ${demoHits.join(", ")} (expected ${expected} ×2)`);
  drift = 1;
}

if (drift) {
  console.error("\n🚫 version drift — align every spot above with package.json, then re-run.");
  process.exit(1);
}
console.log(`✓ every version stamp agrees on ${expected}`);
