import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, SERVER_CARD_URI } from "../src/server.js";
import { fixture } from "./helpers.js";

async function connected(root: string): Promise<Client> {
  const server = createServer(root);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}

test("server: advertises its name + the four tools", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    assert.equal(client.getServerVersion()?.name, "mcp-trinity");
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["describe_project", "recall", "remember", "whoami"],
    );
    await client.close();
  } finally {
    cleanup();
  }
});

test("server: the Server Card resource carries the _meta trinity block", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    const { resources } = await client.listResources();
    assert.ok(resources.find((r) => r.uri === SERVER_CARD_URI));

    const res = await client.readResource({ uri: SERVER_CARD_URI });
    const card = JSON.parse((res.contents[0] as any).text);
    assert.equal(card.name, "mcp-trinity");
    assert.deepEqual(Object.keys(card._meta), [
      "one.faf/context",
      "one.faf/memory",
      "one.faf/agent",
    ]);
    await client.close();
  } finally {
    cleanup();
  }
});

test("server: describe_project walls off without project_name", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    const r = (await client.callTool({ name: "describe_project", arguments: {} })) as any;
    assert.match(r.content[0].text, /required/);
    const ok = (await client.callTool({
      name: "describe_project",
      arguments: { project_name: "x" },
    })) as any;
    assert.match(ok.content[0].text, /Scoped to project: x/);
    await client.close();
  } finally {
    cleanup();
  }
});

test("server: remember → (new client) recall survives", async () => {
  const { root, cleanup } = fixture();
  try {
    const c1 = await connected(root);
    await c1.callTool({ name: "remember", arguments: { id: "k", text: "v" } });
    await c1.close();

    const c2 = await connected(root); // fresh server instance, same files
    const r = (await c2.callTool({ name: "recall", arguments: { id: "k" } })) as any;
    assert.equal(r.content[0].text, "v");
    await c2.close();
  } finally {
    cleanup();
  }
});

test("server: whoami reads the .fafa", async () => {
  const { root, cleanup } = fixture();
  try {
    const client = await connected(root);
    const r = (await client.callTool({ name: "whoami", arguments: {} })) as any;
    assert.match(r.content[0].text, /mcp-trinity/);
    await client.close();
  } finally {
    cleanup();
  }
});
