import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCatalog } from "../src/catalog-gen.js";
import { remember } from "../src/faf/parse-fafm.js";
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

test("buildCatalog: synthesises descriptions when the source fields are absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-trinity-bare-"));
  try {
    writeFileSync(join(dir, "project.faf"), `project:\n  name: bare\n`);
    writeFileSync(join(dir, "project.fafm"), `version: "1.1"\n`);
    // no .well-known/fafa at all
    const cat = buildCatalog(dir);
    assert.equal(cat.host.displayName, "bare");

    const ctx = cat.entries.find((e) => e.type === "application/vnd.faf+yaml")!;
    assert.match(ctx.description, /0\/6 human-context fields authored/);

    const mem = cat.entries.find((e) => e.type === "application/vnd.fafm+yaml")!;
    assert.match(mem.description, /\b0 fact\(s\)/);

    const agent = cat.entries.find((e) => e.type === "application/vnd.fafa+yaml")!;
    assert.match(agent.description, /status: unknown/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildCatalog: each entry carries type === mediaType (the ai-catalog `type` field + a mirror)", () => {
  const { root, cleanup } = fixture();
  try {
    for (const e of buildCatalog(root).entries) {
      assert.equal(e.type, e.mediaType);
      assert.match(e.type, /^application\/vnd\.faf[ma]?\+yaml$/);
      assert.ok(e.url.startsWith("./"));
    }
  } finally {
    cleanup();
  }
});
