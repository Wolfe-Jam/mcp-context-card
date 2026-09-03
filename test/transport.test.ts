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

test("http: MCP works over stateless Streamable HTTP", async () => {
  const client = await httpClient();
  assert.equal(client.getServerVersion()?.name, "mcp-trinity");

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["describe_project", "recall", "remember", "whoami"],
  );

  const r = (await client.callTool({
    name: "describe_project",
    arguments: { project_name: "x" },
  })) as any;
  assert.match(r.content[0].text, /Scoped to project: x/);

  await client.close();
});

test("http: the Server Card resource carries _meta over HTTP too", async () => {
  const client = await httpClient();
  const res = await client.readResource({ uri: SERVER_CARD_URI });
  const card = JSON.parse((res.contents[0] as any).text);
  assert.deepEqual(Object.keys(card._meta), [
    "one.faf/context",
    "one.faf/memory",
    "one.faf/agent",
  ]);
  await client.close();
});

test("http: /.well-known/mcp/server-card serves the card out-of-band", async () => {
  const r = await fetch(`${base}/.well-known/mcp/server-card`);
  assert.equal(r.status, 200);
  const card = await r.json();
  assert.equal(card.name, "mcp-trinity");
  assert.ok(card._meta["one.faf/context"].mediaType === "application/vnd.faf+yaml");
});

test("http: /.well-known/ai-catalog.json serves 3 sibling entries", async () => {
  const r = await fetch(`${base}/.well-known/ai-catalog.json`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /ai-catalog\+json/);
  const cat = await r.json();
  assert.equal(cat.entries.length, 3);
});

test("http: /.well-known/fafa serves the raw agent card", async () => {
  const r = await fetch(`${base}/.well-known/fafa`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /vnd\.fafa\+yaml/);
  assert.match(await r.text(), /name: "mcp-trinity"/);
});

test("stdio and http expose the identical tool surface", async () => {
  // stdio
  const [a, b] = InMemoryTransport.createLinkedPair();
  const s = createServer(fx.root);
  const stdioClient = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await Promise.all([s.connect(b), stdioClient.connect(a)]);
  const stdioTools = (await stdioClient.listTools()).tools.map((t) => t.name).sort();
  await stdioClient.close();

  // http
  const httpC = await httpClient();
  const httpTools = (await httpC.listTools()).tools.map((t) => t.name).sort();
  await httpC.close();

  assert.deepEqual(stdioTools, httpTools);
});
