import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fafaFile, identity, serverCardMeta, whoami } from "../src/identity.js";
import { buildCatalog } from "../src/catalog-gen.js";
import { httpApp } from "../src/transport/http.js";
import { fixture } from "./helpers.js";

/** A temp root carrying only a bespoke `.well-known/fafa`. */
function fafaRoot(body: string): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "mcp-context-card-fafa-"));
  mkdirSync(join(root, ".well-known"));
  writeFileSync(join(root, ".well-known/fafa"), body);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("identity: parses this server's own .fafa", () => {
  const { root, cleanup } = fixture();
  try {
    const id = identity(root);
    assert.equal(id?.name, "mcp-context-card");
  } finally {
    cleanup();
  }
});

test("whoami: one-line summary from the .fafa when present", () => {
  const { root, cleanup } = fixture();
  try {
    const s = whoami(root);
    assert.ok(s.includes("mcp-context-card"));
    assert.ok(s.includes("MIT"));
  } finally {
    cleanup();
  }
});

test("whoami: no .fafa → falls back to package.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-cc-whoami-"));
  try {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "widget", version: "2.1.0", license: "Apache-2.0", description: "a thing" }),
    );
    const s = whoami(dir);
    assert.match(s, /widget · v2\.1\.0 · Apache-2\.0/);
    assert.match(s, /a thing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("whoami: neither .fafa nor package.json → a clear nothing", () => {
  assert.match(whoami("/no/such/root"), /no agent\.fafa, \.well-known\/fafa or package\.json/);
});

test("whoami: a bare card (name only) still renders, no stray separators", () => {
  const { root, cleanup } = fafaRoot(`agent:\n  name: solo\n`);
  try {
    assert.equal(whoami(root), "solo");
  } finally {
    cleanup();
  }
});

test("whoami: displayName wins over name; every optional field shows once present", () => {
  const { root, cleanup } = fafaRoot(
    `agent:\n  name: internal-name\n  displayName: Nice Name\n  version: "2.1"\n` +
      `  vendor: acme\n  status: reference\n  license: Apache-2.0\n  description: a folded line\n`,
  );
  try {
    const s = whoami(root);
    assert.equal(
      s.split("\n")[0],
      "Nice Name · v2.1 · vendor: acme · status: reference · Apache-2.0",
    );
    assert.equal(s.split("\n")[1], "a folded line");
  } finally {
    cleanup();
  }
});

test("whoami: no name and no displayName → (unnamed)", () => {
  const { root, cleanup } = fafaRoot(`agent:\n  vendor: acme\n`);
  try {
    assert.equal(whoami(root), "(unnamed) · vendor: acme");
  } finally {
    cleanup();
  }
});

test("identity: malformed .fafa → null (whoami falls back)", () => {
  const { root, cleanup } = fafaRoot("agent: [unterminated\n");
  try {
    assert.equal(identity(root), null);
    assert.ok(whoami(root).startsWith("(no agent.fafa"));
  } finally {
    cleanup();
  }
});

test("serverCardMeta: three publisher-namespaced keys — context is AGENTS.md/markdown", () => {
  const m = serverCardMeta();
  assert.deepEqual(Object.keys(m), [
    "io.github.Wolfe-Jam.mcp-context-card/context",
    "io.github.Wolfe-Jam.mcp-context-card/memory",
    "io.github.Wolfe-Jam.mcp-context-card/identity",
  ]);

  const ctx = m["io.github.Wolfe-Jam.mcp-context-card/context"];
  assert.equal(ctx.source, "AGENTS.md");
  assert.equal(ctx.mediaType, "text/markdown");
  assert.equal((ctx as Record<string, unknown>).iana, undefined); // markdown needs no vnd anchor

  const mem = m["io.github.Wolfe-Jam.mcp-context-card/memory"];
  assert.equal(mem.mediaType, "application/vnd.fafm+yaml");
  assert.ok(mem.iana.startsWith("https://www.iana.org/assignments/media-types/"));
  assert.match(mem.note, /no de-facto standard/);

  const id = m["io.github.Wolfe-Jam.mcp-context-card/identity"];
  assert.equal(id.mediaType, "application/vnd.fafa+yaml");
  assert.ok(id.iana.startsWith("https://www.iana.org/assignments/media-types/"));

  // no `one.faf/*` key anywhere — the wire is publisher-namespaced
  assert.ok(Object.keys(m).every((k) => k.startsWith("io.github.Wolfe-Jam.mcp-context-card/")));
});

/** A temp root with the given files (path → body). */
function rootWith(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "mcp-context-card-fafa-"));
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    writeFileSync(join(root, f), body);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const card = (name: string) => `version: "1.0"\nagent:\n  name: ${name}\n  displayName: ${name}\n  version: 1.0.0\n`;

test("identity: reads ./agent.fafa — where faf card init writes it", () => {
  const { root, cleanup } = rootWith({ "agent.fafa": card("from-agent-fafa") });
  try {
    assert.equal(identity(root)?.name, "from-agent-fafa");
    assert.equal(fafaFile(root), join(root, "agent.fafa"));
  } finally {
    cleanup();
  }
});

test("identity: agent.fafa first, .well-known/fafa second", () => {
  const { root, cleanup } = rootWith({ "agent.fafa": card("first"), ".well-known/fafa": card("second") });
  try {
    assert.equal(identity(root)?.name, "first");
  } finally {
    cleanup();
  }
});

test("catalog: the identity row's host comes from agent.fafa too", () => {
  const { root, cleanup } = rootWith({ "agent.fafa": card("cat-agent") });
  try {
    assert.equal(buildCatalog(root).host.displayName, "cat-agent");
  } finally {
    cleanup();
  }
});

test("http: /.well-known/fafa serves agent.fafa when that is the file; 404 when there is none", async () => {
  const one = rootWith({ "agent.fafa": card("served") });
  const none = rootWith({});
  try {
    const r = await httpApp(one.root).request("/.well-known/fafa");
    assert.equal(r.status, 200);
    assert.match(await r.text(), /name: served/);
    assert.equal((await httpApp(none.root).request("/.well-known/fafa")).status, 404);
  } finally {
    one.cleanup();
    none.cleanup();
  }
});
