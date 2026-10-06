import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCatalog } from "../src/catalog-gen.js";
import { remember } from "../src/faf/parse-fafm.js";
import { fixture } from "./helpers.js";

const NS = "io.github.Wolfe-Jam.mcp-context-card";

test("buildCatalog: the Server Card + AGENTS.md + .fafa; memory only when the project opts in", () => {
  const { root, cleanup } = fixture();
  try {
    assert.deepEqual(
      buildCatalog(root).entries.map((e) => e.type),
      ["application/mcp-server-card+json", "text/markdown", "application/vnd.fafa+yaml"],
    );
    const cat = buildCatalog(root, { publishMemory: true });
    assert.deepEqual(
      cat.entries.map((e) => e.type),
      ["application/mcp-server-card+json", "text/markdown", "application/vnd.fafm+yaml", "application/vnd.fafa+yaml"],
    );
    for (const e of cat.entries as Record<string, any>[]) {
      assert.ok(e.identifier.startsWith("urn:air:faf.one:"));
      if (e.url) assert.ok(e.url.startsWith("./"));
      assert.equal(e.mediaType, undefined);
    }
    // only the two IANA-registered artifacts carry an iana anchor, under extensions
    const files = cat.entries.slice(1) as Record<string, any>[];
    assert.equal(files[0].extensions, undefined);
    for (const e of files.slice(1)) {
      assert.ok(e.extensions[NS].iana.startsWith("https://www.iana.org/"));
    }
  } finally {
    cleanup();
  }
});

test("buildCatalog: descriptions derive from real file content", () => {
  const { root, cleanup } = fixture();
  try {
    const cat = buildCatalog(root, { publishMemory: true });
    assert.equal(cat.host.displayName, "mcp-context-card");

    // context entry names real AGENTS.md sections
    const ctx = cat.entries.find((e) => e.type === "text/markdown")!;
    assert.match(ctx.description!, /\bsection\(s\)/);
    assert.match(ctx.description!, /Setup/);

    // memory entry names the real fact count
    const mem = cat.entries.find((e) => e.type === "application/vnd.fafm+yaml")!;
    assert.match(mem.description!, /\b4 fact\(s\)/);
  } finally {
    cleanup();
  }
});

test("buildCatalog: reflects a change to a source file", () => {
  const { root, cleanup } = fixture();
  try {
    remember(join(root, "project.fafm"), "extra", "one more");
    const mem = buildCatalog(root, { publishMemory: true }).entries.find(
      (e) => e.type === "application/vnd.fafm+yaml",
    )!;
    assert.match(mem.description!, /\b5 fact\(s\)/); // 4 authored + 1 added
  } finally {
    cleanup();
  }
});

test("buildCatalog: synthesises descriptions when sources are absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-context-card-bare-"));
  try {
    // no AGENTS.md, no fafa; minimal fafm
    writeFileSync(join(dir, "project.fafm"), `version: "1.1"\n`);
    const cat = buildCatalog(dir, { publishMemory: true });

    const ctx = cat.entries.find((e) => e.type === "text/markdown")!;
    assert.match(ctx.description!, /not present/);

    const mem = cat.entries.find((e) => e.type === "application/vnd.fafm+yaml")!;
    assert.match(mem.description!, /\b0 fact\(s\)/);

    const id = cat.entries.find((e) => e.type === "application/vnd.fafa+yaml")!;
    assert.match(id.description!, /status: unknown/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
