import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { httpApp } from "../src/transport/http.js";
import { createServer, SERVER_CARD_URI } from "../src/server.js";
import { fixture } from "./helpers.js";

const META_KEYS = [
  "io.github.wolfe-jam.mcp-context-card/context",
  "io.github.wolfe-jam.mcp-context-card/memory",
  "io.github.wolfe-jam.mcp-context-card/identity",
];

let fx: ReturnType<typeof fixture>;
let httpServer: ReturnType<typeof serve>;
let base: string;

before(async () => {
  fx = fixture();
  httpServer = serve({ fetch: httpApp(fx.root).fetch, port: 0 });
  await new Promise((r) => setTimeout(r, 50));
  const { port } = httpServer.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  httpServer.close();
  fx.cleanup();
});

async function httpClient(): Promise<Client> {
  const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  return client;
}
const say = (r: unknown) => (r as any).content[0].text as string;

test("http: MCP works over stateless Streamable HTTP", async () => {
  const client = await httpClient();
  assert.equal(client.getServerVersion()?.name, "mcp-context-card");

  const { tools } = await client.listTools();
  assert.equal(tools.length, 8);

  const r = say(await client.callTool({ name: "read_agents_md", arguments: { section: "Setup" } }));
  assert.match(r, /^## Setup/);

  await client.close();
});

test("http: the Server Card resource carries _meta over HTTP too", async () => {
  const client = await httpClient();
  const res = await client.readResource({ uri: SERVER_CARD_URI });
  const card = JSON.parse((res.contents[0] as { text: string }).text);
  assert.deepEqual(Object.keys(card._meta), META_KEYS);
  await client.close();
});

test("http: /.well-known/mcp/server-card serves the card out-of-band", async () => {
  const r = await fetch(`${base}/.well-known/mcp/server-card`);
  assert.equal(r.status, 200);
  const card = await r.json();
  assert.equal(card.name, "mcp-context-card");
  assert.equal(card._meta[META_KEYS[0]].source, "AGENTS.md");
  assert.equal(card._meta[META_KEYS[0]].mediaType, "text/markdown");
});

test("http: /.well-known/ai-catalog.json serves 3 sibling entries", async () => {
  const r = await fetch(`${base}/.well-known/ai-catalog.json`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /ai-catalog\+json/);
  const cat = await r.json();
  assert.equal(cat.entries.length, 3);
  assert.equal(cat.entries[0].type, "text/markdown");
});

test("http: /.well-known/fafa serves the raw agent card", async () => {
  const r = await fetch(`${base}/.well-known/fafa`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /vnd\.fafa\+yaml/);
  assert.match(await r.text(), /name: "mcp-context-card"/);
});

test("http: GET /card renders the card; ?theme + ?accent are honoured / sanitised", async () => {
  const r = await fetch(`${base}/card?theme=light&accent=%230A7`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /text\/html/);
  const html = await r.text();
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /data-theme="light"/);
  assert.match(html, /--accent:#0A7/);

  // a hostile accent is dropped
  const bad = await (await fetch(`${base}/card?accent=x%3B%7D%3C%2Fstyle%3E`)).text();
  assert.ok(!bad.includes("</style><"));
  assert.match(bad, /--accent:#FF702D/);
});

test("http: memory tools round-trip over the wire", async () => {
  const client = await httpClient();
  await client.callTool({ name: "remember", arguments: { id: "w", text: "wire" } });
  assert.equal(say(await client.callTool({ name: "recall", arguments: { id: "w" } })), "wire");
  await client.callTool({ name: "forget", arguments: { id: "w" } });
  await client.close();
});

test("http: list_context_sources works end to end over HTTP", async () => {
  const client = await httpClient();
  const s = JSON.parse(say(await client.callTool({ name: "list_context_sources", arguments: {} })));
  assert.equal(s.context.source, "AGENTS.md");
  assert.ok(s.context.sections > 0);
  await client.close();
});

test("http: /mcp is genuinely stateless — no session header, independent inits", async () => {
  const init = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "raw", version: "0" },
    },
  };
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const r1 = await fetch(`${base}/mcp`, { method: "POST", headers, body: JSON.stringify(init) });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get("mcp-session-id"), null, "stateless mode must not issue a session id");

  const r2 = await fetch(`${base}/mcp`, { method: "POST", headers, body: JSON.stringify(init) });
  assert.equal(r2.status, 200);
  const b2 = await r2.json();
  assert.equal(b2.result?.serverInfo?.name, "mcp-context-card");
});

test("http: CORS is open (preflight answered)", async () => {
  const r = await fetch(`${base}/mcp`, {
    method: "OPTIONS",
    headers: {
      origin: "https://example.com",
      "access-control-request-method": "POST",
    },
  });
  assert.ok(r.status === 204 || r.status === 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
});

test("http: unknown well-known path → 404, not a crash", async () => {
  const r = await fetch(`${base}/.well-known/nope`);
  assert.equal(r.status, 404);
});

test("stdio and http expose the identical tool surface", async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const s = createServer(fx.root);
  const stdioClient = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await Promise.all([s.connect(b), stdioClient.connect(a)]);
  const stdioTools = (await stdioClient.listTools()).tools.map((t) => t.name).sort();
  await stdioClient.close();

  const httpC = await httpClient();
  const httpTools = (await httpC.listTools()).tools.map((t) => t.name).sort();
  await httpC.close();

  assert.deepEqual(stdioTools, httpTools);
  assert.equal(stdioTools.length, 8);
});
