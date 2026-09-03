import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalog } from "../src/catalog-gen.js";
import { remember } from "../src/faf/parse-fafm.js";
import { join } from "node:path";
import { fixture } from "./helpers.js";

test("buildCatalog: three sibling entries, one per format", () => {
  const { root, cleanup } = fixture();
  try {
    const cat = buildCatalog(root);
    assert.equal(cat.entries.length, 3);
    assert.deepEqual(
      cat.entries.map((e) => e.type),
      [
        "application/vnd.faf+yaml",
        "application/vnd.fafm+yaml",
        "application/vnd.fafa+yaml",
      ],
    );
    for (const e of cat.entries) {
      assert.ok(e.identifier.startsWith("urn:air:mcp-trinity:"));
      assert.ok(e._meta["one.faf/iana"].startsWith("https://www.iana.org/"));
    }
  } finally {
    cleanup();
  }
});

test("buildCatalog: host + descriptions derive from real file content", () => {
  const { root, cleanup } = fixture();
  try {
    const cat = buildCatalog(root);
    assert.equal(cat.host.displayName, "mcp-trinity");
    // the .faf entry's description is the actual authored goal
    const ctx = cat.entries.find((e) => e.type === "application/vnd.faf+yaml")!;
    assert.ok(ctx.description.includes("reference MCP server"));
    // the .fafm entry names the real fact count
    const mem = cat.entries.find((e) => e.type === "application/vnd.fafm+yaml")!;
    assert.match(mem.description, /\b3 fact\(s\)/);
  } finally {
    cleanup();
  }
});

test("buildCatalog: reflects a change to the source files", () => {
  const { root, cleanup } = fixture();
  try {
    remember(join(root, "project.fafm"), "extra", "one more");
    const mem = buildCatalog(root).entries.find(
      (e) => e.type === "application/vnd.fafm+yaml",
    )!;
    assert.match(mem.description, /\b4 fact\(s\)/); // 3 authored + 1 added
  } finally {
    cleanup();
  }
});
