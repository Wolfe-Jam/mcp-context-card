import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BLOCK_END, BLOCK_START, FAF_BLOCK_END, FAF_BLOCK_START, authorAgentsMd } from "../src/author.js";
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

test("authorAgentsMd: no project.faf → BETTER, the agents-md-facts block in the managed markers", () => {
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
    assert.equal(a.tier, "better");
    assert.ok(a.markdown.startsWith(BLOCK_START));
    assert.ok(a.markdown.trimEnd().endsWith(BLOCK_END));
    assert.ok(!a.markdown.includes(FAF_BLOCK_START)); // no intent block without a .faf
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

test("authorAgentsMd: a bare dir still returns a valid BETTER block, no throw", () => {
  const { root, cleanup } = scratch({ "README.md": "# hi" });
  try {
    const a = authorAgentsMd(root);
    assert.equal(a.tier, "better");
    assert.ok(a.markdown.includes(BLOCK_START) && a.markdown.includes(BLOCK_END));
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: a project.faf present → BEST — the intent block leads, the facts block follows", () => {
  const { root, cleanup } = scratch({
    "package.json": JSON.stringify({ name: "widget", scripts: { test: "vitest" } }),
    "project.faf": [
      "project:",
      "  name: widget",
      "  goal: A widget that does the one thing well.",
      "human_context:",
      "  who: people who need a widget.",
      "  why: nothing else did the one thing well.",
      "key_files: [src/widget.ts, README.md]",
    ].join("\n"),
  });
  try {
    const a = authorAgentsMd(root);
    assert.equal(a.tier, "best");
    // intent block first, facts block after
    assert.ok(a.markdown.indexOf(FAF_BLOCK_START) < a.markdown.indexOf(BLOCK_START));
    assert.match(a.markdown, /## Project/);
    assert.match(a.markdown, /A widget that does the one thing well\./);
    assert.match(a.markdown, /\*\*Who it's for:\*\* people who need a widget\./);
    assert.match(a.markdown, /\*\*Why:\*\* nothing else did the one thing well\./);
    assert.match(a.markdown, /\*\*Start here:\*\*/);
    assert.match(a.markdown, /- `src\/widget\.ts`/);
    assert.match(a.markdown, /- `README\.md`/);
    // the facts block is still there, unchanged in kind
    assert.match(a.markdown, /authored by agents-md-facts/);
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: an empty or unreadable project.faf doesn't force BEST", () => {
  const { root, cleanup } = scratch({
    "package.json": JSON.stringify({ name: "x" }),
    "project.faf": "project:\n  name: x\n", // no goal, no human_context — nothing to say
  });
  try {
    assert.equal(authorAgentsMd(root).tier, "better");
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: malformed project.faf → BETTER, no throw", () => {
  const { root, cleanup } = scratch({
    "package.json": JSON.stringify({ name: "x" }),
    "project.faf": "project: [broken\n",
  });
  try {
    const a = authorAgentsMd(root);
    assert.equal(a.tier, "better");
    assert.doesNotThrow(() => authorAgentsMd(root));
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: this repo — BEST, a real project.faf, real facts, real guardrails", () => {
  const a = authorAgentsMd(REPO_ROOT);
  assert.equal(a.tier, "best");
  assert.match(a.markdown, /## Project/);
  assert.match(a.markdown, /\*\*Who it's for:\*\*/);
  assert.match(a.markdown, /## Guardrails/);
  assert.match(a.markdown, /## Definition of Done/i);
  assert.equal(a.exists, true);
});
