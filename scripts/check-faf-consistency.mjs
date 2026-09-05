#!/usr/bin/env node
// check-faf-consistency.mjs — the mechanically verifiable slices of
// "does project.faf / project.fafm / .well-known/fafa still describe reality".
//
// It can't judge whether the prose is *accurate* — that stays a human call
// (see the drift nudge + the release checklist). It CAN check that:
//   · every project.faf key_files path exists
//   · every project.fafm fact source: path exists
//   · every package.json dependency is named in project.faf tech_stack
//   · .well-known/fafa's name / vendor / license agree with package.json + server.json
//
// This repo has no `faf sync` (deliberate). These are the checks that don't
// need it. Version stamps are check-versions.mjs's job, not repeated here.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const has = (p) => existsSync(join(root, p));

const pkg = JSON.parse(read("package.json"));
const server = JSON.parse(read("server.json"));
const faf = read("project.faf");
const fafm = read("project.fafm");
const fafa = read(".well-known/fafa");

let fail = 0;
const bad = (m) => {
  console.error(`✗ ${m}`);
  fail = 1;
};

// ── project.faf key_files exist ──────────────────────────────────────
const keyFiles = (faf.match(/key_files:\s*\[([^\]]+)\]/)?.[1] ?? "")
  .split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
if (!keyFiles.length) bad("project.faf — key_files not found or empty");
for (const f of keyFiles) if (!has(f)) bad(`project.faf key_files → ${f} does not exist`);

// ── project.fafm fact sources exist ─────────────────────────────────
const sources = [...fafm.matchAll(/^\s*source:\s*"([^"]+)"/gm)].map((m) => m[1]);
if (!sources.length) bad("project.fafm — no fact source: fields found");
for (const s of [...new Set(sources)]) if (!has(s)) bad(`project.fafm fact source → ${s} does not exist`);

// ── every runtime dependency is named in tech_stack ─────────────────
const techStack = (faf.match(/tech_stack:\s*\[([^\]]+)\]/)?.[1] ?? "")
  .split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
if (!techStack.length) bad("project.faf — tech_stack not found or empty (expected inline [ ... ])");
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  const named = techStack.some((t) => t.toLowerCase() === dep.toLowerCase());
  if (!named) bad(`project.faf tech_stack does not name the dependency "${dep}"`);
}

// ── .well-known/fafa agrees with the package + server identity ──────
const fafaField = (k) => fafa.match(new RegExp(`^\\s+${k}:\\s*"([^"]+)"`, "m"))?.[1];
const vendorExpected = server.name.split("/")[0]; // io.github.Wolfe-Jam
const checks = [
  ["name", fafaField("name"), pkg.name],
  ["vendor", fafaField("vendor"), vendorExpected],
  ["license", fafaField("license"), pkg.license],
];
for (const [field, got, want] of checks) {
  if (got !== want) bad(`.well-known/fafa agent.${field} = ${got ?? "(missing)"}  (expected ${want})`);
}

if (fail) {
  console.error("\n🚫 FAF files drifted from the project. Reconcile the lines above.");
  process.exit(1);
}
console.log("✓ project.faf / project.fafm / .well-known/fafa consistent with the project");
