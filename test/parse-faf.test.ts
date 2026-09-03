import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFaf } from "../src/faf/parse-faf.js";
import { fixture } from "./helpers.js";

test("parseFaf: reads the project block into typed fields", () => {
  const { root, cleanup } = fixture();
  try {
    const ctx = parseFaf(join(root, "project.faf"));
    assert.equal(ctx.name, "mcp-context-card");
    assert.equal(ctx.language, "TypeScript");
    assert.equal(ctx.type, "mcp");
    assert.ok(ctx.goal && ctx.goal.length > 0);
  } finally {
    cleanup();
  }
});

test("parseFaf: exposes tool-schema-keyed field aliases", () => {
  const { root, cleanup } = fixture();
  try {
    const { fields } = parseFaf(join(root, "project.faf"));
    // `project.name` is fillable as the param a tool would declare
    assert.equal(fields.project_name, "mcp-context-card");
    assert.equal(fields.main_language, "TypeScript");
  } finally {
    cleanup();
  }
});

test("parseFaf: authored human_context Ws become fillable fields", () => {
  const { root, cleanup } = fixture();
  try {
    writeFileSync(
      join(root, "project.faf"),
      `project:\n  name: x\nhuman_context:\n  who: library authors\n  why: to test\n`,
    );
    const { fields, who, why } = parseFaf(join(root, "project.faf"));
    assert.equal(who, "library authors");
    assert.equal(fields.who, "library authors");
    assert.equal(fields.why, "to test");
    assert.equal(fields.where, undefined); // not authored → not present
  } finally {
    cleanup();
  }
});

test("parseFaf: missing file → empty context, no throw", () => {
  const ctx = parseFaf("/no/such/project.faf");
  assert.deepEqual(ctx.fields, {});
  assert.equal(ctx.name, undefined);
});

test("parseFaf: malformed YAML → empty context, no throw", () => {
  const { root, cleanup } = fixture();
  try {
    writeFileSync(join(root, "project.faf"), "project:\n  name: [unterminated\n");
    const ctx = parseFaf(join(root, "project.faf"));
    assert.deepEqual(ctx.fields, {});
  } finally {
    cleanup();
  }
});

test("parseFaf: `slotignored` stack values don't break the parse", () => {
  const { root, cleanup } = fixture();
  try {
    // the fixture's project.faf already has several `stack.* : slotignored`
    const ctx = parseFaf(join(root, "project.faf"));
    assert.equal(ctx.name, "mcp-context-card");
    assert.equal(ctx.type, "mcp");
  } finally {
    cleanup();
  }
});

test("parseFaf: a .faf with no human_context → the six Ws are all undefined", () => {
  const { root, cleanup } = fixture();
  try {
    writeFileSync(join(root, "project.faf"), `project:\n  name: bare\n  main_language: Go\n`);
    const ctx = parseFaf(join(root, "project.faf"));
    assert.equal(ctx.name, "bare");
    assert.equal(ctx.language, "Go");
    for (const w of ["who", "what", "why", "where", "when", "how"] as const) {
      assert.equal(ctx[w], undefined);
    }
  } finally {
    cleanup();
  }
});
