import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFafa } from "../src/faf/parse-fafa.js";
import { fixture } from "./helpers.js";

test("parseFafa: reads the agent card", () => {
  const { root, cleanup } = fixture();
  try {
    const id = parseFafa(join(root, ".well-known/fafa"));
    assert.ok(id);
    assert.equal(id.name, "mcp-trinity");
    assert.equal(id.license, "MIT");
    assert.equal(id.status, "reference");
    assert.ok(id.description && !id.description.includes("\n")); // folded → single line
  } finally {
    cleanup();
  }
});

test("parseFafa: missing file → null", () => {
  assert.equal(parseFafa("/no/such/fafa"), null);
});

test("parseFafa: malformed → null", () => {
  const { root, cleanup } = fixture();
  try {
    const p = join(root, ".well-known/fafa");
    writeFileSync(p, "agent: [broken\n");
    assert.equal(parseFafa(p), null);
  } finally {
    cleanup();
  }
});
