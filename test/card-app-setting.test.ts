/**
 * MCP_CONTEXT_CARD_APP: the user chooses whether the ui:// card carries the
 * MCP Apps helper. `helper` (default): the card reports its size to the host
 * (~700 KB). `plain`: the plain card (~30 KB), no MCP Apps messages. Only the
 * ui:// resource changes; every other surface is the plain card either way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { CARD_APP_ENV, CARD_UI_URI, MCP_APP_MIME, UI_EXTENSION, cardAppFromEnv, type CardApp } from "../src/constants.js";
import { PLAIN_CARD_LIMIT_BYTES } from "../src/render-card.js";
import { createServer } from "../src/server.js";
import { httpApp } from "../src/transport/http.js";
import { fixture } from "./helpers.js";

/** The bundled helper's start-up message; the plain card never contains it. */
const HELPER_MARK = "ui/initialize";
const APPS = { extensions: { [UI_EXTENSION]: { mimeTypes: [MCP_APP_MIME] } } };

async function connect(root: string, cardApp: CardApp | undefined, capabilities: object = {}): Promise<Client> {
  const server = createServer(root, cardApp ? { cardApp } : {});
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" }, { capabilities });
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}
const uiCard = async (c: Client) => {
  const r = await c.readResource({ uri: CARD_UI_URI });
  return { text: (r.contents[0] as { text: string }).text, mimeType: r.contents[0].mimeType };
};
/** Run `fn` with MCP_CONTEXT_CARD_APP set (or unset), then restore it. */
async function withEnv<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const before = process.env[CARD_APP_ENV];
  if (value === undefined) delete process.env[CARD_APP_ENV];
  else process.env[CARD_APP_ENV] = value;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env[CARD_APP_ENV];
    else process.env[CARD_APP_ENV] = before;
  }
}

test("cardAppFromEnv: unset or empty is helper; helper and plain are read as given", () => {
  const none: string[] = [];
  const warn = (l: string) => none.push(l);
  assert.equal(cardAppFromEnv({}, warn), "helper");
  assert.equal(cardAppFromEnv({ [CARD_APP_ENV]: "" }, warn), "helper");
  assert.equal(cardAppFromEnv({ [CARD_APP_ENV]: "helper" }, warn), "helper");
  assert.equal(cardAppFromEnv({ [CARD_APP_ENV]: "plain" }, warn), "plain");
  assert.equal(cardAppFromEnv({ [CARD_APP_ENV]: " plain " }, warn), "plain");
  assert.deepEqual(none, [], "valid values never warn");
});

test("cardAppFromEnv: a bad value warns once, names the valid ones, and uses helper", () => {
  const lines: string[] = [];
  const warn = (l: string) => lines.push(l);
  assert.equal(cardAppFromEnv({ [CARD_APP_ENV]: "minimal-xyz" }, warn), "helper");
  assert.equal(cardAppFromEnv({ [CARD_APP_ENV]: "minimal-xyz" }, warn), "helper");
  assert.equal(lines.length, 1, "one line per distinct bad value, not per server instance");
  assert.match(lines[0], /MCP_CONTEXT_CARD_APP="minimal-xyz"/);
  assert.match(lines[0], /helper, plain/);
});

test("ui:// card, helper: carries the MCP Apps helper", async () => {
  const { root, cleanup } = fixture();
  try {
    const c = await connect(root, "helper", APPS);
    const card = await uiCard(c);
    assert.equal(card.mimeType, MCP_APP_MIME);
    assert.ok(card.text.includes(HELPER_MARK), "helper: the start-up exchange is in the card");
    await c.close();
  } finally {
    cleanup();
  }
});

test("ui:// card, plain: no helper, under the plain-card limit, same MIME type", async () => {
  const { root, cleanup } = fixture();
  try {
    const c = await connect(root, "plain", APPS);
    const card = await uiCard(c);
    assert.equal(card.mimeType, MCP_APP_MIME);
    assert.ok(!card.text.includes(HELPER_MARK), "plain: no MCP Apps helper");
    assert.ok(Buffer.byteLength(card.text) < PLAIN_CARD_LIMIT_BYTES, `plain ui:// card is ${Buffer.byteLength(card.text)} bytes`);
    assert.match(card.text, /<html/i);
    await c.close();
  } finally {
    cleanup();
  }
});

test("the environment decides when no option is given: unset is helper, plain is plain", async () => {
  const { root, cleanup } = fixture();
  try {
    const unset = await withEnv(undefined, async () => {
      const c = await connect(root, undefined, APPS);
      const t = (await uiCard(c)).text;
      await c.close();
      return t;
    });
    assert.ok(unset.includes(HELPER_MARK), "unset: helper");
    const plain = await withEnv("plain", async () => {
      const c = await connect(root, undefined, APPS);
      const t = (await uiCard(c)).text;
      await c.close();
      return t;
    });
    assert.ok(!plain.includes(HELPER_MARK), "MCP_CONTEXT_CARD_APP=plain: no helper");
  } finally {
    cleanup();
  }
});

test("ServerOptions.cardApp wins over the environment", async () => {
  const { root, cleanup } = fixture();
  try {
    const text = await withEnv("plain", async () => {
      const c = await connect(root, "helper", APPS);
      const t = (await uiCard(c)).text;
      await c.close();
      return t;
    });
    assert.ok(text.includes(HELPER_MARK), "option helper, env plain: helper");
  } finally {
    cleanup();
  }
});

test("every other surface is the plain card under both settings", async () => {
  const { root, cleanup } = fixture();
  try {
    const seen: Record<string, { tool: string; http: string }> = {};
    for (const setting of ["helper", "plain"] as const) {
      seen[setting] = await withEnv(setting, async () => {
        const c = await connect(root, undefined);
        const r = (await c.callTool({ name: "render_context_card", arguments: {} })) as { content: Array<{ text: string }> };
        await c.close();
        const res = await httpApp(root).fetch(new Request("http://127.0.0.1/card"));
        return { tool: r.content[0].text, http: await res.text() };
      });
    }
    for (const setting of ["helper", "plain"] as const) {
      assert.ok(!seen[setting].tool.includes(HELPER_MARK), `${setting}: tool reply has no helper`);
      assert.ok(!seen[setting].http.includes(HELPER_MARK), `${setting}: GET /card has no helper`);
    }
    assert.equal(seen.helper.tool, seen.plain.tool, "tool reply identical under both settings");
    assert.equal(seen.helper.http, seen.plain.http, "GET /card identical under both settings");
  } finally {
    cleanup();
  }
});

test("list_context_sources reports which card the ui:// resource carries", async () => {
  const { root, cleanup } = fixture();
  try {
    for (const setting of ["helper", "plain"] as const) {
      const c = await connect(root, setting);
      const r = (await c.callTool({ name: "list_context_sources", arguments: {} })) as { content: Array<{ text: string }> };
      assert.equal(JSON.parse(r.content[0].text).surfaces.mcp.cardApp, setting);
      await c.close();
    }
  } finally {
    cleanup();
  }
});
