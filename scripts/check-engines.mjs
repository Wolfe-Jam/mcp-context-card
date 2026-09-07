#!/usr/bin/env node
// check-engines.mjs — the Node engine floor must match what CI actually runs.
//
// Why this exists: 1.0.0 shipped `engines.node: ">=22"` set casually in a
// pre-publish housekeeping commit — nothing in the code needed 22, and the
// package ran identically on Node 20. Every Node-20 user got `npm warn
// EBADENGINE` on first `npx`. Caught only by luck.
//
// The guard: the `engines.node` floor and the LOWEST version in the CI node
// matrix must be the same number. You can't raise the floor without dropping
// that Node from CI (a visible, deliberate act), and you can't claim support
// for a Node the gate never exercises.
//
// Run in CI and prepublishOnly.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// engines.node floor, e.g. ">=20" -> 20
const enginesRaw = JSON.parse(read("package.json")).engines?.node ?? "";
const floorMatch = enginesRaw.match(/(\d+)/);
if (!floorMatch) {
  console.error(`✗ package.json engines.node missing or unparseable: ${JSON.stringify(enginesRaw)}`);
  process.exit(1);
}
const floor = Number(floorMatch[1]);

// CI node matrix, e.g. node: ['20', '22', '24']
const ci = read(".github/workflows/ci.yml");
const matrixMatch = ci.match(/node:\s*\[([^\]]+)\]/);
if (!matrixMatch) {
  console.error("✗ .github/workflows/ci.yml — could not find `node: [ ... ]` matrix");
  process.exit(1);
}
const matrix = matrixMatch[1]
  .split(",")
  .map((s) => Number(s.replace(/['"\s]/g, "")))
  .filter((n) => Number.isFinite(n))
  .sort((a, b) => a - b);

if (matrix.length === 0) {
  console.error("✗ CI node matrix parsed empty");
  process.exit(1);
}

const ciMin = matrix[0];

if (floor !== ciMin) {
  console.error(
    `✗ engine floor drift — package.json engines.node = ">=${floor}", ` +
      `CI node matrix low = ${ciMin} (matrix: ${matrix.join(", ")}).\n` +
      `  Make them equal: either lower the floor to ${ciMin}, or drop Node ${ciMin} from ci.yml on purpose.`,
  );
  process.exit(1);
}

// even-numbered LTS only (odd majors are never LTS)
if (floor % 2 !== 0) {
  console.error(`✗ engine floor ${floor} is an odd major — Node LTS lines are even. Pick an LTS.`);
  process.exit(1);
}

console.log(`✓ engine floor >=${floor} matches CI matrix low (${matrix.join(", ")})`);
