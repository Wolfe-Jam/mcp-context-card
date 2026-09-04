import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BLOCK_END, BLOCK_START, authorAgentsMd } from "../src/author.js";
import { REPO_ROOT } from "./helpers.js";

function scratch(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "mcp-cc-author-"));
  for (const [p, body] of Object.entries(files)) {
    const full = join(root, p);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("authorAgentsMd: wraps the agents-md-facts block in the managed markers", () => {
  const { root, cleanup } = scratch({
    "package.json": JSON.stringify({
      name: "widget",
      description: "a small thing",
      scripts: { build: "tsc", test: "vitest" },
      devDependencies: { typescript: "^5" },
    }),
    "package-lock.json": "{}",
  });
  try {
    const a = authorAgentsMd(root);
    assert.ok(a.markdown.startsWith(BLOCK_START));
    assert.ok(a.markdown.trimEnd().endsWith(BLOCK_END));
    assert.match(a.markdown, /authored by agents-md-facts/);
    assert.match(a.markdown, /# AGENTS\.md — widget/);
    assert.match(a.markdown, /npm install/); // a detected command
    assert.equal(a.exists, false);
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: reports when an AGENTS.md is already there", () => {
  const { root, cleanup } = scratch({
    "package.json": JSON.stringify({ name: "x" }),
    "AGENTS.md": "# hand-written\n",
  });
  try {
    assert.equal(authorAgentsMd(root).exists, true);
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: a bare dir still returns a valid block, no throw", () => {
  const { root, cleanup } = scratch({ "README.md": "# hi" });
  try {
    const a = authorAgentsMd(root);
    assert.ok(a.markdown.includes(BLOCK_START) && a.markdown.includes(BLOCK_END));
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: this repo reads as a real project (commands + guardrails)", () => {
  const a = authorAgentsMd(REPO_ROOT);
  assert.match(a.markdown, /## Guardrails/);
  assert.match(a.markdown, /## Definition of Done/i);
  assert.equal(a.exists, true);
});
