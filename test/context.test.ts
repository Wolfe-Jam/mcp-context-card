import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { callToolWithContext } from "../src/context.js";

/** A tiny server whose one tool echoes back the arguments it received. */
async function echoClient(): Promise<Client> {
  const server = new Server({ name: "echo", version: "0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "act",
        description: "echo",
        inputSchema: {
          type: "object",
          properties: {
            project_name: { type: "string" },
            other: { type: "string" },
          },
        },
      },
      // a tool that declares NO matching field
      { name: "noparams", description: "", inputSchema: { type: "object", properties: {} } },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => ({
    content: [{ type: "text", text: JSON.stringify(req.params.arguments ?? {}) }],
  }));

  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}

const echoed = (r: unknown) =>
  JSON.parse((r as any).content[0].text) as Record<string, string>;

test("fills a missing param the context knows", async () => {
  const client = await echoClient();
  const { result, filled } = await callToolWithContext(client, "act", {}, {
    project_name: "acme",
  });
  assert.deepEqual(filled, ["project_name"]);
  assert.equal(echoed(result).project_name, "acme");
});

test("never overrides an explicitly-supplied arg", async () => {
  const client = await echoClient();
  const { result, filled } = await callToolWithContext(
    client,
    "act",
    { project_name: "explicit" },
    { project_name: "context" },
  );
  assert.deepEqual(filled, []);
  assert.equal(echoed(result).project_name, "explicit");
});

test("no-op when the tool schema declares no matching field", async () => {
  const client = await echoClient();
  const { result, filled } = await callToolWithContext(client, "noparams", {}, {
    project_name: "acme",
  });
  assert.deepEqual(filled, []);
  assert.deepEqual(echoed(result), {});
});

test("only fills fields the schema actually declares", async () => {
  const client = await echoClient();
  const { result, filled } = await callToolWithContext(client, "act", {}, {
    project_name: "acme",
    not_in_schema: "ignored",
  });
  assert.deepEqual(filled, ["project_name"]);
  assert.equal(echoed(result).not_in_schema, undefined);
});
