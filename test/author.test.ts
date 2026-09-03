import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authorAgentsMd } from "../src/author.js";

function scratch(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "mcp-cc-author-"));
  for (const [p, body] of Object.entries(files)) {
    const full = join(root, p);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("authorAgentsMd: project.faf present → BEST (intent from the .faf, mechanics from detection)", () => {
  const { root, cleanup } = scratch({
    "project.faf": `project:\n  name: acme-api\n  goal: the billing service\nhuman_context:\n  why: keeps invoices correct\nkey_files: [src/server.ts, src/db.ts]\n`,
    "package.json": JSON.stringify({ name: "acme-api", scripts: { build: "tsc", test: "vitest" }, engines: { node: ">=20" } }),
    "package-lock.json": "{}",
    ".github/workflows/test.yml": "name: test",
  });
  try {
    const a = authorAgentsMd(root);
    assert.equal(a.tier, "BEST");
    assert.deepEqual(a.from, ["project.faf"]);
    assert.match(a.markdown, /\*\*acme-api\*\* — the billing service\./); // from the .faf
    assert.match(a.markdown, /keeps invoices correct\./); // .faf why
    assert.match(a.markdown, /```bash\nnpm ci\n```/); // detected mechanics
    assert.match(a.markdown, /Requires Node >=20\./);
    assert.match(a.markdown, /- `src\/server\.ts`/); // .faf key_files as the layout
    assert.match(a.markdown, /test\.yml` runs on every push/);
    assert.match(a.markdown, /BEST — from project\.faf/);
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: no project.faf → BETTER from detection, real commands, TODO markers", () => {
  const { root, cleanup } = scratch({
    "package.json": JSON.stringify({
      name: "widget",
      description: "a small thing",
      scripts: { build: "tsc", test: "vitest" },
      devDependencies: { typescript: "^5" },
    }),
    "package-lock.json": "{}",
    ".github/workflows/ci.yml": "name: CI",
    "src/x.ts": "",
  });
  try {
    const a = authorAgentsMd(root);
    assert.equal(a.tier, "BETTER");
    assert.deepEqual(a.from, ["package.json"]);
    assert.match(a.markdown, /\*\*widget\*\* — a small thing\./);
    assert.match(a.markdown, /```bash\nnpm ci\n```/);
    assert.match(a.markdown, /```bash\nnpm run build\n```/);
    assert.match(a.markdown, /`npm test && npm run build` green/);
    assert.match(a.markdown, /\.github\/workflows\/ci\.yml` runs on every push/);
    assert.match(a.markdown, /<!-- TODO -->/); // judgement sections flagged
    assert.match(a.markdown, /A project\.faf authors a BEST AGENTS\.md/);
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: a bare dir → BETTER, no crash, mostly TODO", () => {
  const { root, cleanup } = scratch({ "README.md": "# hi" });
  try {
    const a = authorAgentsMd(root);
    assert.equal(a.tier, "BETTER");
    assert.deepEqual(a.from, ["(no manifests found)"]);
    assert.match(a.markdown, /^# AGENTS\.md/);
    assert.match(a.markdown, /## Safety/);
  } finally {
    cleanup();
  }
});

test("authorAgentsMd: never emits a code fence with a prose 'build' value", () => {
  // a .faf whose stack.build is a description, not a command
  const { root, cleanup } = scratch({
    "project.faf": `project:\n  name: proj\n  goal: does things\nstack:\n  build: TypeScript (tsc)\n  runtime: Node.js\n`,
    "package.json": JSON.stringify({ name: "proj", scripts: { build: "tsc" } }),
    "package-lock.json": "{}",
  });
  try {
    const a = authorAgentsMd(root);
    assert.equal(a.tier, "BEST");
    // Build command is the detected one, not the .faf prose
    assert.match(a.markdown, /```bash\nnpm run build\n```/);
    assert.doesNotMatch(a.markdown, /```bash\nTypeScript \(tsc\)/);
  } finally {
    cleanup();
  }
});
