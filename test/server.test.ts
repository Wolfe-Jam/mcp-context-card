import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, SERVER_CARD_URI } from "../src/server.js";
import { fixture } from "./helpers.js";

const TOOLS = [
  "author_agents_md",
  "forget",
  "list_agents_md_sections",
  "list_context_sources",
  "read_agents_md",
  "recall",
  "remember",
  "render_context_card",
  "whoami",
];

async function connected(root: string): Promise<Client> {
  const server = createServer(root);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}
const say = (r: unknown) => (r as any).content[0].text as string;

test("server: advertises its name + the nine tools", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    assert.equal(client.getServerVersion()?.name, "mcp-context-card");
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
    await client.close();
  } finally {
    cleanup();
  }
});

test("server: the Server Card resource carries the _meta context block", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    const { resources } = await client.listResources();
    assert.ok(resources.find((r) => r.uri === SERVER_CARD_URI));

    const res = await client.readResource({ uri: SERVER_CARD_URI });
    const card = JSON.parse((res.contents[0] as { text: string }).text);
    assert.equal(card.name, "mcp-context-card");
    assert.deepEqual(Object.keys(card._meta), [
      "io.github.wolfe-jam.mcp-context-card/context",
      "io.github.wolfe-jam.mcp-context-card/memory",
      "io.github.wolfe-jam.mcp-context-card/identity",
    ]);
    assert.equal(card._meta["io.github.wolfe-jam.mcp-context-card/context"].source, "AGENTS.md");
    assert.equal(card._meta["io.github.wolfe-jam.mcp-context-card/context"].mediaType, "text/markdown");
  } finally {
    cleanup();
  }
});

test("server: read_agents_md returns the whole file, or one section", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);

    const whole = say(await client.callTool({ name: "read_agents_md", arguments: {} }));
    assert.match(whole, /^# AGENTS\.md/);

    const section = say(await client.callTool({ name: "read_agents_md", arguments: { section: "Test" } }));
    assert.match(section, /^## Test/);
    assert.ok(section.length < whole.length);

    const miss = say(await client.callTool({ name: "read_agents_md", arguments: { section: "nope" } }));
    assert.match(miss, /no section matching "nope"/);

    await client.close();
  } finally {
    cleanup();
  }
});

test("server: list_agents_md_sections returns the headings as JSON", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    const sections = JSON.parse(
      say(await client.callTool({ name: "list_agents_md_sections", arguments: {} })),
    );
    const headings = sections.map((s: { heading: string }) => s.heading);
    assert.ok(headings.includes("Setup"));
    assert.ok(headings.includes("Safety"));
    await client.close();
  } finally {
    cleanup();
  }
});

test("server: remember → (new client) recall survives; forget removes", async () => {
  const { root, cleanup } = fixture();
  try {
    const c1 = await connected(root);
    await c1.callTool({ name: "remember", arguments: { id: "k", text: "v" } });
    await c1.close();

    const c2 = await connected(root); // fresh server instance, same files
    assert.equal(say(await c2.callTool({ name: "recall", arguments: { id: "k" } })), "v");
    assert.match(say(await c2.callTool({ name: "forget", arguments: { id: "k" } })), /forgot: k/);
    assert.match(say(await c2.callTool({ name: "recall", arguments: { id: "k" } })), /no memory for "k"/);
    assert.match(say(await c2.callTool({ name: "forget", arguments: { id: "k" } })), /no memory for "k"/);
    await c2.close();
  } finally {
    cleanup();
  }
});

test("server: whoami reads the .fafa", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    assert.match(say(await client.callTool({ name: "whoami", arguments: {} })), /mcp-context-card/);
    await client.close();
  } finally {
    cleanup();
  }
});

test("server: render_context_card returns a self-contained HTML card", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    const html = say(await client.callTool({ name: "render_context_card", arguments: { theme: "dark" } }));
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /data-theme="dark"/);
    assert.match(html, /Context — AGENTS\.md/);
    assert.ok(!html.includes("<script"));
    await client.close();
  } finally {
    cleanup();
  }
});

test("server: author_agents_md returns an agents-md-facts managed block, notes the file exists", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    const draft = say(await client.callTool({ name: "author_agents_md", arguments: {} }));
    assert.match(draft, /AGENTS\.md already exists/); // the fixture ships one
    assert.match(draft, /<!-- agents:from-facts:start -->/);
    assert.match(draft, /<!-- agents:from-facts:end -->/);
    assert.match(draft, /authored by agents-md-facts/);
    await client.close();
  } finally {
    cleanup();
  }
});

test("server: list_context_sources — three concerns, surfaces split by transport", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    const s = JSON.parse(say(await client.callTool({ name: "list_context_sources", arguments: {} })));
    assert.equal(s.context.source, "AGENTS.md");
    assert.equal(s.context.present, true);
    assert.ok(s.context.sections > 0);
    assert.equal(s.memory.mediaType, "application/vnd.fafm+yaml");
    assert.equal(s.identity.present, true); // the fixture ships a .fafa
    assert.match(s.surfaces.mcp.serverCard, /mcp-context-card:\/\/server-card/);
    assert.match(s.surfaces.http.serverCard, /GET \/\.well-known\/mcp\/server-card/);
    assert.match(s.surfaces.http.card, /GET \/card/);
    await client.close();
  } finally {
    cleanup();
  }
});

test("server: an unknown tool or resource rejects, it doesn't hang", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    await assert.rejects(client.callTool({ name: "no_such_tool", arguments: {} }));
    await assert.rejects(client.readResource({ uri: "mcp-context-card://nope" }));
    const { tools } = await client.listTools();
    assert.equal(tools.length, 9);
    await client.close();
  } finally {
    cleanup();
  }
});
