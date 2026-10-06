/**
 * The portable discovery checker (src/conformance/discovery.ts), tested on
 * servers that get it wrong. Each fake server is a Hono app answered through
 * an injected `fetch`, so any host name works and nothing touches the network.
 * The passing case (this server, for real over HTTP) lives in wjttc.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import {
  AI_CATALOG_TYPE,
  SERVER_CARD_SCHEMA_URL,
  SERVER_CARD_TYPE,
  checkDiscovery,
  type DiscoveryReport,
} from "../src/conformance/discovery.js";
import { cardValidator } from "./helpers.js";

const via = (app: Hono): typeof fetch => (input, init) => Promise.resolve(app.fetch(new Request(input, init)));
const offline: typeof fetch = () => Promise.reject(new Error("offline"));
const status = (r: DiscoveryReport, id: string) => r.results.find((x) => x.id === id)?.status;
const failed = (r: DiscoveryReport) => r.results.filter((x) => x.status === "fail").map((x) => x.id).sort();

const goodCard = (url: string) => ({
  $schema: SERVER_CARD_SCHEMA_URL,
  name: "com.example/weather",
  version: "2.0.0",
  description: "Weather for agents.",
  remotes: [{ type: "streamable-http", url }],
});

test("a server that only serves bare JSON fails the MUSTs and SHOULDs it misses", async () => {
  const app = new Hono();
  app.get("/mcp/server-card", (c) =>
    c.json({ $schema: "https://example.com/old.json", name: "weather", version: "", description: "x".repeat(101) }),
  );
  const r = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: via(app), validateCard: cardValidator() });
  assert.deepEqual(failed(r), [
    "card.description",
    "card.name",
    "card.schema-url",
    "card.schema-valid",
    "card.version",
    "hosting.cache-control",
    "hosting.content-type",
    "hosting.cors-expose",
    "hosting.cors-origin",
    "hosting.cors-preflight",
    "hosting.etag",
  ]);
  assert.equal(r.mustFailures, 8);
  assert.equal(status(r, "hosting.https"), "pass");
  assert.ok(r.results.filter((x) => x.tier === "catalog").every((x) => x.status === "skip"), "no catalog → skipped");
});

test("a correct hosted card over HTTPS passes, and plain HTTP off localhost fails", async () => {
  const app = new Hono();
  app.get("/mcp/server-card", (c) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Expose-Headers", "ETag");
    c.header("Cache-Control", "public, max-age=3600");
    c.header("ETag", '"v1"');
    if (c.req.header("if-none-match") === '"v1"') return c.body(null, 304);
    c.header("Content-Type", SERVER_CARD_TYPE);
    return c.body(JSON.stringify(goodCard(new URL(c.req.url).origin + "/mcp")));
  });
  app.options("/mcp/server-card", (c) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET");
    c.header("Access-Control-Allow-Headers", "Content-Type, If-None-Match");
    return c.body(null, 204);
  });
  const ok = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: via(app), validateCard: cardValidator() });
  assert.deepEqual(failed(ok), []);
  assert.equal(ok.cardUrl, "https://wx.example.com/mcp/server-card");

  const plain = await checkDiscovery({ mcpUrl: "http://wx.example.com/mcp" }, { fetch: via(app) });
  assert.deepEqual(failed(plain), ["hosting.https"]);
  assert.equal(status(plain, "card.schema-valid"), "skip"); // no validator supplied
});

test("a card that leaks a credential or a private endpoint fails", async () => {
  const app = new Hono();
  app.get("/mcp/server-card", (c) =>
    c.json({ ...goodCard("https://wx.example.com/mcp"), _meta: { "com.example/auth": { apiKey: "sk-123" } } }),
  );
  const leak = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: via(app) });
  assert.equal(status(leak, "card.no-secrets"), "fail");

  const priv = new Hono();
  priv.get("/mcp/server-card", (c) => c.json(goodCard("http://192.168.1.20/mcp")));
  const r = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: via(priv) });
  assert.equal(status(r, "card.no-secrets"), "fail");
  assert.equal(status(r, "card.remote-matches"), "fail");
});

test("a card found only inline in the catalog is checked; hosting is skipped", async () => {
  const app = new Hono();
  app.get("/.well-known/ai-catalog.json", (c) => {
    c.header("Content-Type", AI_CATALOG_TYPE);
    return c.body(
      JSON.stringify({
        specVersion: "1.0",
        entries: [{ identifier: "urn:air:example.com:mcp:weather", type: SERVER_CARD_TYPE, data: goodCard("https://elsewhere.example.com/mcp") }],
      }),
    );
  });
  const r = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: via(app), validateCard: cardValidator() });
  assert.equal(r.cardUrl, null);
  assert.equal(status(r, "card.found"), "pass");
  assert.equal(status(r, "card.schema-valid"), "pass");
  assert.equal(status(r, "card.remote-matches"), "fail"); // declares a different endpoint
  assert.ok(r.results.filter((x) => x.tier === "hosting").every((x) => x.status === "skip"));
  assert.equal(status(r, "catalog.links"), "skip"); // inline only, nothing to resolve
});

test("the card is followed from the catalog when it is not at <mcp>/server-card", async () => {
  const app = new Hono();
  app.get("/cards/weather.json", (c) => c.json(goodCard("https://wx.example.com/mcp")));
  app.get("/.well-known/ai-catalog.json", (c) =>
    c.json({ specVersion: "1.0", entries: [{ identifier: "weather", type: SERVER_CARD_TYPE, url: "/cards/weather.json" }] }),
  );
  const r = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: via(app) });
  assert.equal(r.cardUrl, "https://wx.example.com/cards/weather.json");
  assert.equal(status(r, "card.remote-matches"), "pass");
  assert.equal(status(r, "catalog.identifiers"), "fail"); // "weather" is not urn:air:{domain}:…
  assert.equal(status(r, "catalog.content-type"), "fail"); // application/json
  assert.equal(status(r, "catalog.links"), "fail"); // served as application/json, entry declares the card type
});

test("a broken catalog fails each catalog requirement it misses", async () => {
  const app = new Hono();
  app.get("/.well-known/ai-catalog.json", (c) =>
    c.json({
      host: { identifier: "x" },
      entries: [
        { identifier: "urn:air:example.com:docs:a", type: "text/markdown", url: "/a.md", data: "both" },
        { type: "text/plain", url: "/b.txt", extensions: { "not a key": 1 } },
        { identifier: "urn:air:example.com:mcp:c", type: SERVER_CARD_TYPE, displayName: "C", url: "/nope" },
        "not an object",
      ],
    }),
  );
  const r = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: via(app) });
  for (const id of [
    "catalog.spec-version",
    "catalog.host",
    "catalog.entry-fields",
    "catalog.entry-one-of",
    "catalog.identifiers",
    "catalog.extensions",
    "catalog.card-entry-lean",
    "catalog.links",
    "card.found",
  ]) {
    assert.equal(status(r, id), "fail", id);
  }
  assert.equal(status(r, "catalog.card-entry"), "pass");
});

test("nothing published: the card is reported missing and every other check skips", async () => {
  const r = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: via(new Hono()) });
  assert.deepEqual(failed(r), ["card.found"]);
  assert.equal(r.mustFailures, 0); // where (and whether) a card is hosted is the spec's MAY
  assert.equal(r.passed, 0);

  const down = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: offline });
  assert.deepEqual(failed(down), ["card.found"]);
  assert.match(down.results.find((x) => x.id === "catalog.links")!.detail!, /unreachable/);
});

test("a body that is not JSON fails card.json and the catalog is skipped", async () => {
  const app = new Hono();
  app.get("/mcp/server-card", (c) => c.text("<html>"));
  app.get("/.well-known/ai-catalog.json", (c) => c.text("nope"));
  const r = await checkDiscovery({ mcpUrl: "https://wx.example.com/mcp" }, { fetch: via(app) });
  assert.equal(status(r, "card.found"), "pass");
  assert.equal(status(r, "card.json"), "fail");
  assert.match(r.results.find((x) => x.id === "catalog.spec-version")!.detail!, /not a JSON object/);
});
