import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCatalog } from "../src/catalog-gen.js";
import { httpApp } from "../src/transport/http.js";
import { FORMER_IDS_ENV } from "../src/constants.js";
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

test("buildCatalog: ids are urn:air:{domain}:{name}-{kind} (one segment: the same under AI Catalog v0.9 and before)", () => {
  const { root, cleanup } = fixture();
  try {
    const ids = buildCatalog(root, { publishMemory: true }).entries.map((e) => e.identifier);
    assert.deepEqual(ids, [
      "urn:air:faf.one:mcp-context-card-mcp",
      "urn:air:faf.one:mcp-context-card-context",
      "urn:air:faf.one:mcp-context-card-memory",
      "urn:air:faf.one:mcp-context-card-identity",
    ]);
    for (const id of ids) assert.match(id, /^urn:air:[^:]+\.[^:]+:[^:]+$/);
  } finally {
    cleanup();
  }
});

test("buildCatalog: formerIds records each entry's pre-v0.9 id; off by default", () => {
  const { root, cleanup } = fixture();
  try {
    const KEY = "one.faf.former-identifiers";
    for (const e of buildCatalog(root, { publishMemory: true }).entries) assert.equal(e.extensions?.[KEY], undefined);
    const cat = buildCatalog(root, { publishMemory: true, formerIds: true });
    assert.deepEqual(cat.entries.map((e) => e.extensions?.[KEY]), [
      ["urn:air:faf.one:mcp:mcp-context-card"],
      ["urn:air:faf.one:context:mcp-context-card"],
      ["urn:air:faf.one:memory:mcp-context-card"],
      ["urn:air:faf.one:identity:mcp-context-card"],
    ]);
    // the IANA anchors stay next to the record
    assert.ok((cat.entries[3].extensions?.[NS] as Record<string, string>).iana.startsWith("https://www.iana.org/"));
    // no domain, no urn:air id: nothing to record
    const f = join(root, ".well-known/fafa");
    writeFileSync(f, readFileSync(f, "utf8").replace(/^\s*id: .*$/m, ""));
    for (const e of buildCatalog(root, { formerIds: true }).entries) assert.equal(e.extensions?.[KEY], undefined);
  } finally {
    cleanup();
  }
});

test("buildCatalog: formerIds writes no record for localhost or an IP host (the key must be reverse-DNS)", () => {
  const { root, cleanup } = fixture();
  try {
    const f = join(root, ".well-known/fafa");
    writeFileSync(f, readFileSync(f, "utf8").replace(/^\s*id: .*$/m, ""));
    for (const origin of ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"]) {
      for (const e of buildCatalog(root, { origin, formerIds: true }).entries) {
        assert.equal(e.extensions && Object.keys(e.extensions).some((k) => k.endsWith(".former-identifiers")), e.extensions ? false : undefined, origin);
      }
    }
    const named = buildCatalog(root, { origin: "https://ctx.acme.dev", formerIds: true }).entries[0];
    assert.deepEqual(named.extensions?.["dev.acme.ctx.former-identifiers"], ["urn:air:ctx.acme.dev:mcp:mcp-context-card"]);
  } finally {
    cleanup();
  }
});

test(`http: ${FORMER_IDS_ENV}=1 turns the former-id record on for the served catalog`, async () => {
  const { root, cleanup } = fixture();
  const before = process.env[FORMER_IDS_ENV];
  try {
    const get = async () => (await (await httpApp(root).request("http://127.0.0.1/.well-known/ai-catalog.json")).json()) as { entries: Record<string, any>[] };
    delete process.env[FORMER_IDS_ENV];
    assert.equal((await get()).entries[0].extensions?.["one.faf.former-identifiers"], undefined);
    process.env[FORMER_IDS_ENV] = "1";
    assert.deepEqual((await get()).entries[0].extensions?.["one.faf.former-identifiers"], ["urn:air:faf.one:mcp:mcp-context-card"]);
  } finally {
    if (before === undefined) delete process.env[FORMER_IDS_ENV];
    else process.env[FORMER_IDS_ENV] = before;
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
