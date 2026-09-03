import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { forget, parseFafm, recall, remember } from "../src/faf/parse-fafm.js";
import { fixture } from "./helpers.js";

test("parseFafm: reads the authored facts + metadata", () => {
  const { root, cleanup } = fixture();
  try {
    const m = parseFafm(join(root, "project.fafm"));
    assert.equal(m.profile, "knowledge");
    assert.ok(m.facts.length >= 3);
    assert.ok(m.facts.find((f) => f.id === "mcp-context-card-scope"));
  } finally {
    cleanup();
  }
});

test("remember → recall: round-trips through the file", () => {
  const { root, cleanup } = fixture();
  try {
    const path = join(root, "project.fafm");
    remember(path, "t1", "hello world");
    // recall re-reads from disk — nothing cached
    assert.equal(recall(path, "t1")?.text, "hello world");
  } finally {
    cleanup();
  }
});

test("remember: updates an existing fact's text in place, no duplicate", () => {
  const { root, cleanup } = fixture();
  try {
    const path = join(root, "project.fafm");
    remember(path, "t1", "first");
    remember(path, "t1", "second");
    const m = parseFafm(path);
    assert.equal(m.facts.filter((f) => f.id === "t1").length, 1);
    assert.equal(recall(path, "t1")?.text, "second");
  } finally {
    cleanup();
  }
});

test("forget: removes a fact, returns false when absent", () => {
  const { root, cleanup } = fixture();
  try {
    const path = join(root, "project.fafm");
    remember(path, "t1", "x");
    assert.equal(forget(path, "t1"), true);
    assert.equal(recall(path, "t1"), null);
    assert.equal(forget(path, "t1"), false);
  } finally {
    cleanup();
  }
});

test("recall: unknown id → null", () => {
  const { root, cleanup } = fixture();
  try {
    assert.equal(recall(join(root, "project.fafm"), "nope"), null);
  } finally {
    cleanup();
  }
});

test("remember: preserves comments and doesn't reformat the whole file", () => {
  const { root, cleanup } = fixture();
  try {
    const path = join(root, "project.fafm");
    const lf = (s: string) => s.replace(/\r\n/g, "\n"); // Windows checkout tolerance
    const before = lf(readFileSync(path, "utf8"));
    remember(path, "new-fact", "a new fact");
    const after = lf(readFileSync(path, "utf8"));

    // header comments survive
    assert.ok(after.includes("# application/vnd.fafm+yaml"));
    // the authored facts are byte-identical (only last_etched + the new
    // fact should differ) — every authored line still present verbatim
    const authoredLines = before.split("\n").filter((l) => l.includes("mcp-context-card-scope"));
    for (const l of authoredLines) assert.ok(after.includes(l), `line churned: ${JSON.stringify(l)}`);
    // new scalars are double-quoted (house convention)
    assert.ok(after.includes('id: "new-fact"'));
    assert.ok(after.includes('source: "remember()"'));
  } finally {
    cleanup();
  }
});

test("parseFafm: missing / malformed file → empty facts, no throw", () => {
  const { root, cleanup } = fixture();
  try {
    const path = join(root, "project.fafm");
    writeFileSync(path, "memory:\n  facts: [broken\n");
    assert.doesNotThrow(() => {
      const m = parseFafm(path);
      assert.deepEqual(m.facts, []);
    });
  } finally {
    cleanup();
  }
});

test("parseFafm: a file with no `memory:` key → empty facts, no throw", () => {
  const { root, cleanup } = fixture();
  try {
    const p = join(root, "project.fafm");
    writeFileSync(p, `version: "1.1"\nprofile: "knowledge"\n`);
    const m = parseFafm(p);
    assert.equal(m.profile, "knowledge");
    assert.deepEqual(m.facts, []);
    // remember() into it still works — it creates the memory/facts structure
    remember(p, "first", "hello");
    assert.equal(recall(p, "first")?.text, "hello");
  } finally {
    cleanup();
  }
});

test("remember: updating a fact keeps its other fields (tags, type, priority)", () => {
  const { root, cleanup } = fixture();
  try {
    const p = join(root, "project.fafm");
    remember(p, "mcp-context-card-scope", "rewritten text"); // an authored fact with tags
    const f = recall(p, "mcp-context-card-scope");
    assert.equal(f?.text, "rewritten text");
    assert.deepEqual(f?.tags, ["scope", "agents-md"]); // preserved
    assert.equal(f?.priority, "high"); // preserved
  } finally {
    cleanup();
  }
});
