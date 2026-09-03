import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detect } from "../src/detect.js";
import { REPO_ROOT } from "./helpers.js";

function scratch(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "mcp-cc-detect-"));
  for (const [p, body] of Object.entries(files)) {
    const full = join(root, p);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("detect: Node — language, pkg manager, commands, CI, layout", () => {
  const { root, cleanup } = scratch({
    "package.json": JSON.stringify({
      name: "widget",
      description: "a thing",
      engines: { node: ">=22" },
      devDependencies: { typescript: "^5" },
      scripts: { build: "tsc", test: "vitest" },
      bin: { widget: "cli.js" },
    }),
    "package-lock.json": "{}",
    ".github/workflows/ci.yml": "name: CI",
    "src/index.ts": "",
    "docs/x.md": "",
  });
  try {
    const d = detect(root);
    assert.equal(d.name, "widget");
    assert.equal(d.language, "TypeScript");
    assert.equal(d.packageManager, "npm");
    assert.equal(d.install, "npm ci");
    assert.equal(d.build, "npm run build");
    assert.equal(d.test, "npm test");
    assert.equal(d.type, "cli");
    assert.equal(d.runtime, "Node >=22");
    assert.deepEqual(d.ci, ["ci.yml"]);
    assert.deepEqual(d.layout, ["docs", "src"]);
    assert.deepEqual(d.from, ["package.json"]);
  } finally {
    cleanup();
  }
});

test("detect: pnpm lockfile → pnpm install", () => {
  const { root, cleanup } = scratch({
    "package.json": JSON.stringify({ name: "p", scripts: {} }),
    "pnpm-lock.yaml": "",
  });
  try {
    assert.equal(detect(root).packageManager, "pnpm");
    assert.equal(detect(root).install, "pnpm install");
  } finally {
    cleanup();
  }
});

test("detect: Rust — Cargo.toml, workspace → monorepo", () => {
  const { root, cleanup } = scratch({
    "Cargo.toml": `[package]\nname = "crab"\ndescription = "claws"\n\n[workspace]\nmembers = ["a"]\n\n[[bin]]\nname = "crab"\n`,
  });
  try {
    const d = detect(root);
    assert.equal(d.language, "Rust");
    assert.equal(d.name, "crab");
    assert.equal(d.test, "cargo test");
    assert.equal(d.type, "cli");
    assert.equal(d.monorepo, true);
  } finally {
    cleanup();
  }
});

test("detect: Python — pyproject + uv.lock", () => {
  const { root, cleanup } = scratch({
    "pyproject.toml": `[project]\nname = "snek"\n`,
    "uv.lock": "",
  });
  try {
    const d = detect(root);
    assert.equal(d.language, "Python");
    assert.equal(d.packageManager, "uv");
    assert.equal(d.install, "uv sync");
    assert.equal(d.test, "pytest");
  } finally {
    cleanup();
  }
});

test("detect: an empty dir → no crash, empty-ish result", () => {
  const { root, cleanup } = scratch({});
  try {
    const d = detect(root);
    assert.deepEqual(d.from, []);
    assert.deepEqual(d.ci, []);
    assert.equal(d.language, undefined);
  } finally {
    cleanup();
  }
});

test("detect: this repo reads as a TypeScript MCP server", () => {
  const d = detect(REPO_ROOT);
  assert.equal(d.language, "TypeScript");
  assert.equal(d.type, "mcp");
  assert.equal(d.test, "npm test");
  assert.ok(d.ci.includes("ci.yml"));
});
