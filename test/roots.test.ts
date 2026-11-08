/**
 * Which project is "this project"? With no MCP_CONTEXT_CARD_ROOT, a local
 * server asks the host: the client's MCP roots first (goose sends its session
 * working directory), then the directory it was started in if that holds an
 * AGENTS.md, then its own package folder. So "Show me my context card" in a
 * host shows the user's project, with nothing to configure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { CARD_UI_URI } from "../src/constants.js";
import { createServer, MAX_ROOTS, ROOT, rootPath, type ServerOptions } from "../src/server.js";

const say = (r: unknown) => (r as any).content[0].text as string;

/** A bare project whose AGENTS.md has one heading nobody else has. */
function project(marker: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mcp-cc-roots-"));
  writeFileSync(join(dir, "AGENTS.md"), `# AGENTS.md\n\n## ${marker}\n\nonly in this project\n`);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Connect a client that may advertise roots; `roots()` answers roots/list live. */
async function connect(
  root: string | undefined,
  opts: ServerOptions,
  roots?: () => string[],
  answer?: () => Promise<{ roots: { uri: string; name?: string }[] }>,
): Promise<Client> {
  const server = createServer(root, opts);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "t", version: "0" },
    { capabilities: roots ? { roots: { listChanged: true } } : {} },
  );
  if (answer) {
    client.setRequestHandler('roots/list', answer);
  } else if (roots) {
    client.setRequestHandler('roots/list', async () => ({
      roots: roots().map((d) => ({ uri: pathToFileURL(d).href, name: "working_directory" })),
    }));
  }
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}

const headings = async (c: Client) =>
  say(await c.callTool({ name: "list_agents_md_sections", arguments: {} }));

test("roots: a host's first root is the project, with nothing configured", async () => {
  const p = project("Rooted Marker");
  try {
    const c = await connect(undefined, { detectRoot: true }, () => [p.dir]);
    assert.match(await headings(c), /Rooted Marker/);
    // and the card, memory and sources all follow the same project
    await c.callTool({ name: "remember", arguments: { id: "r1", text: "remembered in the rooted project" } });
    assert.equal(say(await c.callTool({ name: "recall", arguments: { id: "r1" } })), "remembered in the rooted project");
    const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
    assert.equal(src.project.path, p.dir);
    assert.equal(src.project.from, "client roots");
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("roots: when the host's roots change, the next call follows them", async () => {
  const one = project("First Project");
  const two = project("Second Project");
  try {
    let current = [one.dir];
    const c = await connect(undefined, { detectRoot: true }, () => current);
    assert.match(await headings(c), /First Project/);
    current = [two.dir];
    await c.sendRootsListChanged();
    await new Promise((r) => setTimeout(r, 50));
    assert.match(await headings(c), /Second Project/);
    await c.close();
  } finally {
    one.cleanup();
    two.cleanup();
  }
});

test("roots: a bare absolute path (as the Cursor editor sends) is read as that folder", async () => {
  const p = project("Plain Path Marker");
  try {
    // Cursor editor 3.29.9 answers roots/list with a path, not a file:// URI.
    const c = await connect(undefined, { detectRoot: true }, () => [], async () => ({ roots: [{ uri: p.dir, name: "cli" }] }));
    const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
    assert.equal(src.project.path, p.dir);
    assert.equal(src.project.from, "client roots");
    assert.match(await headings(c), /Plain Path Marker/);
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("roots: a `..` path to a real folder, or a relative path that exists, is not used", async () => {
  const good = project("Good Root Marker");
  const decoy = project("Decoy Marker");
  try {
    // both resolve to an existing folder with an AGENTS.md; neither may be chosen
    const viaDots = `${good.dir}/../${decoy.dir.split(/[\\/]/).pop()}`;
    const relative = "test"; // exists relative to the test process's cwd (the repo)
    for (const uri of [viaDots, `file://${viaDots}`, relative]) {
      const c = await connect(undefined, { detectRoot: true }, () => [], async () => ({ roots: [{ uri }, { uri: pathToFileURL(good.dir).href }] }));
      const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
      assert.equal(src.project.path, good.dir, `${uri} must be skipped`);
      await c.close();
    }
  } finally {
    good.cleanup();
    decoy.cleanup();
  }
});

test("roots: only the first MAX_ROOTS entries are looked at", async () => {
  const p = project("Past The Cap");
  try {
    const filler = Array.from({ length: MAX_ROOTS }, () => ({ uri: "/no/such/dir" }));
    const c = await connect(undefined, { detectRoot: true }, () => [], async () => ({ roots: [...filler, { uri: pathToFileURL(p.dir).href }] }));
    const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
    assert.notEqual(src.project.path, p.dir, "a root past the cap is ignored");
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("roots: relative paths, `..` segments, other schemes and a file:// URI with a host are skipped, not fatal", async () => {
  const p = project("Last Good Root");
  try {
    const bad = ["relative/dir", `${p.dir}/../${p.dir.split("/").pop()}`, "https://example.com/x", "file://host/share", "/no/such/dir"];
    const c = await connect(undefined, { detectRoot: true }, () => [], async () => ({
      roots: [...bad.map((uri) => ({ uri })), { uri: pathToFileURL(p.dir).href }],
    }));
    const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
    assert.equal(src.project.path, p.dir, "every bad root is skipped; the good one after them is used");
    assert.equal(src.project.from, "client roots");
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("roots: no roots from the host → the start directory, if it has an AGENTS.md", async () => {
  const p = project("Cwd Marker");
  try {
    const c = await connect(undefined, { detectRoot: true, cwd: p.dir });
    assert.match(await headings(c), /Cwd Marker/);
    const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
    assert.equal(src.project.from, "start directory");
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("roots: nothing to go on → the package's own folder, as before", async () => {
  const empty = mkdtempSync(join(tmpdir(), "mcp-cc-empty-"));
  try {
    const c = await connect(undefined, { detectRoot: true, cwd: empty });
    const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
    assert.equal(src.project.path, ROOT);
    assert.equal(src.project.from, "package");
    await c.close();
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("roots: an explicit root (MCP_CONTEXT_CARD_ROOT) always wins over the host's roots", async () => {
  const pinned = project("Pinned Marker");
  const other = project("Host Root Marker");
  try {
    const c = await connect(pinned.dir, {}, () => [other.dir]);
    assert.match(await headings(c), /Pinned Marker/);
    const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
    assert.equal(src.project.from, "configured");
    await c.close();
  } finally {
    pinned.cleanup();
    other.cleanup();
  }
});

test("roots: a host that declares roots but fails to answer → falls back, doesn't break", async () => {
  const p = project("Fallback Marker");
  try {
    const c = await connect(undefined, { detectRoot: true, cwd: p.dir }, () => [], async () => {
      throw new Error("roots unavailable");
    });
    assert.match(await headings(c), /Fallback Marker/);
    const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
    assert.equal(src.project.from, "start directory");
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("roots: a host that never answers roots/list → gives up after 5s and falls back", { timeout: 15000 }, async () => {
  const p = project("Silent Host Marker");
  try {
    const c = await connect(undefined, { detectRoot: true, cwd: p.dir }, () => [], () => new Promise(() => {}));
    const t0 = Date.now();
    assert.match(await headings(c), /Silent Host Marker/);
    assert.ok(Date.now() - t0 < 8000, "the fallback must not hang");
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("roots: a file:// root that isn't a folder is skipped for the next one", async () => {
  const p = project("File Root Marker");
  try {
    const c = await connect(undefined, { detectRoot: true }, () => [], async () => ({
      roots: [
        { uri: pathToFileURL(join(p.dir, "no-such-dir")).href },
        { uri: pathToFileURL(join(p.dir, "AGENTS.md")).href },
        { uri: pathToFileURL(p.dir).href },
      ],
    }));
    assert.match(await headings(c), /File Root Marker/);
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("roots: a host that sends a non-file:// root (against the spec) → graceful fallback", async () => {
  // The MCP spec says roots are file:// URIs, and the SDK rejects the whole
  // roots/list response if one isn't. Detection must fall back, not break.
  const p = project("Spec Fallback Marker");
  try {
    const c = await connect(undefined, { detectRoot: true, cwd: p.dir }, () => [], async () => ({
      roots: [{ uri: "https://example.com/repo" }],
    }));
    assert.match(await headings(c), /Spec Fallback Marker/);
    const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
    assert.equal(src.project.from, "start directory");
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("roots: the MCP App card (ui:// resource) shows the detected project too", async () => {
  const p = project("App Card Marker");
  try {
    const c = await connect(undefined, { detectRoot: true }, () => [p.dir]);
    const res = await c.readResource({ uri: CARD_UI_URI });
    assert.match((res.contents[0] as { text: string }).text, /App Card Marker/);
    await c.close();
  } finally {
    p.cleanup();
  }
});

test("rootPath: what a root may name (pure, no filesystem, never throws)", () => {
  const win = process.platform === "win32";
  const posix: Array<[unknown, string | undefined]> = [
    ["/Users/x/p", "/Users/x/p"],
    ["/Users/x/p/", "/Users/x/p"], // trailing slash dropped, as file:// gives
    ["file:///Users/x/p", "/Users/x/p"],
    ["FILE:///Users/x/p", "/Users/x/p"], // schemes are case-insensitive
    ["file://localhost/Users/x/p", "/Users/x/p"],
  ];
  const never: unknown[] = [
    "file://evil.example/x", // a host: on Windows this is a UNC share
    "/a/../p", "file:///a/../p", "file:///a/%2e%2e/p", "file:///a/%2E%2E/p", "/a/..\\p", // `..`, raw or encoded
    "relative", "./x", "~/x", "https://x/y", "", "/a\u0000b",
    "\\\\srv\\share", "//srv/share", "\\\\?\\C:\\x", "\\\\.\\pipe\\x", // UNC and device paths reach the network on Windows
    42, null, undefined, {}, ["/x"],
  ];
  if (!win) for (const [uri, want] of posix) assert.equal(rootPath(uri), want, String(uri));
  for (const uri of never) assert.equal(rootPath(uri), undefined, JSON.stringify(uri));
  // a drive path is a folder on Windows and nothing on POSIX
  assert.equal(rootPath("C:\\Users\\x") === undefined, !win);
  assert.equal(rootPath("c:/Users/x") === undefined, !win);
});
