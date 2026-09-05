#!/usr/bin/env node
// faf-drift-nudge.mjs — NON-BLOCKING. Prints a warning, always exits 0.
//
// check-faf-consistency.mjs verifies the mechanically checkable slices.
// This catches the rest at the moment it's introduced: if a change moves the
// code's *shape* (a src file added / removed / renamed, or a runtime
// dependency changed) but doesn't touch project.faf, the author is the right
// person to confirm key_files / tech_stack / the goal still hold — so nudge
// them, in the PR, while they still have the context.
//
// Usage: node scripts/faf-drift-nudge.mjs [base-ref]   (default: origin/main)

import { execSync } from "node:child_process";

const base = process.argv[2] || "origin/main";
const gh = process.env.GITHUB_ACTIONS === "true";

let nameStatus, pkgDiff;
try {
  nameStatus = execSync(`git diff --name-status ${base}...HEAD`, { encoding: "utf8" });
  pkgDiff = execSync(`git diff ${base}...HEAD -- package.json`, { encoding: "utf8" });
} catch (e) {
  console.log(`faf-drift-nudge: couldn't diff against ${base} (${e.message.split("\n")[0]}) — skipping`);
  process.exit(0);
}

const lines = nameStatus.trim().split("\n").filter(Boolean);
const fafTouched = lines.some((l) => /\bproject\.faf$/.test(l));
if (fafTouched) {
  console.log("faf-drift-nudge: project.faf is in this change — nothing to nudge");
  process.exit(0);
}

// src/ files added (A), deleted (D), or renamed (R…)
const shapeMoves = lines.filter((l) => /^(A|D|R\d*)\s+src\//.test(l));
// dependency lines added/removed in package.json (ignore the version bump line)
const depMoves = pkgDiff
  .split("\n")
  .filter((l) => /^[+-]\s+"[^"]+":\s*"/.test(l) && !/^[+-]\s+"version":/.test(l));

if (!shapeMoves.length && !depMoves.length) {
  console.log("faf-drift-nudge: no shape change — nothing to nudge");
  process.exit(0);
}

const detail = [
  shapeMoves.length && `src files: ${shapeMoves.map((l) => l.split(/\s+/).pop()).join(", ")}`,
  depMoves.length && `package.json dependencies changed`,
].filter(Boolean).join("; ");

const msg = `code shape moved (${detail}) but project.faf wasn't touched — confirm key_files / tech_stack / the goal still match, and re-check project.fafm facts if AGENTS.md moved`;

if (gh) console.log(`::warning::${msg}`);
else console.log(`\n⚠  ${msg}\n`);

process.exit(0);
