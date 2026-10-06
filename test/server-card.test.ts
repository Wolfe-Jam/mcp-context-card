/**
 * MCP Server Cards (SEP-2127, Final) + AI Catalog 1.0 — one test per
 * requirement in PLANET-FAF's compliance list (rows A1–A13, B1–B5, C1–C10).
 * The card is validated against the official v1 JSON Schema from
 * modelcontextprotocol/experimental-ext-server-card@526201bb (the SEP's snapshot).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { httpApp } from "../src/transport/http.js";
import { buildCatalog } from "../src/catalog-gen.js";
import { serverCard } from "../src/server-card.js";
import { REPO_ROOT, fixture } from "./helpers.js";

const SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";
const CARD_TYPE = "application/mcp-server-card+json";
const schema = JSON.parse(readFileSync(join(REPO_ROOT, "test/fixtures/server-card.schema.v1.json"), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
// ajv-formats is CommonJS: under ESM the callable may sit on `.default`.
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (a: Ajv2020) => Ajv2020;
addFormats(ajv);
ajv.addSchema(schema, "server-card");
const validateCard = ajv.getSchema("server-card#/$defs/ServerCard")!;
const serverJson = JSON.parse(readFileSync(join(REPO_ROOT, "server.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));

let fx: ReturnType<typeof fixture>;
let httpServer: ReturnType<typeof serve>;
let base: string;

before(async () => {
  fx = fixture();
  httpServer = serve({ fetch: httpApp(fx.root).fetch, port: 0 });
  await new Promise((r) => setTimeout(r, 50));
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});
after(() => {
  httpServer.close();
  fx.cleanup();
});

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { headers });
const card = async () => (await get("/mcp/server-card")).json() as Promise<Record<string, any>>;

// ── A. The card ─────────────────────────────────────────────────────────────

test("A0: the served card validates against the official v1 schema", async () => {
  const c = await card();
  assert.ok(validateCard(c), JSON.stringify(validateCard.errors));
  assert.ok(validateCard(serverCard()), JSON.stringify(validateCard.errors)); // in-band form too
});

test("A1: $schema is the v1 Server Card schema URL", async () => {
  assert.equal((await card()).$schema, SCHEMA_URL);
});

test("A2: name is reverse-DNS with one slash, same as server.json", async () => {
  const { name } = await card();
  assert.match(name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  assert.equal(name, serverJson.name);
});

test("A3: version is semver and matches package.json", async () => {
  const { version } = await card();
  assert.match(version, /^\d+\.\d+\.\d+/);
  assert.equal(version, pkg.version);
});

test("A4: description is 1–100 chars and matches server.json", async () => {
  const { description } = await card();
  assert.ok(description.length >= 1 && description.length <= 100);
  assert.equal(description, serverJson.description);
});

test("A5–A7: title, websiteUrl and repository are present", async () => {
  const c = await card();
  assert.equal(c.title, "MCP Context Card");
  assert.equal(c.websiteUrl, "https://github.com/Wolfe-Jam/mcp-context-card");
  assert.deepEqual(c.repository, { url: "https://github.com/Wolfe-Jam/mcp-context-card", source: "github" });
});

test("A9: over HTTP the card advertises the streamable-http remote at <origin>/mcp", async () => {
  const { remotes } = await card();
  assert.equal(remotes.length, 1);
  assert.equal(remotes[0].type, "streamable-http");
  assert.equal(remotes[0].url, `${base}/mcp`);
  assert.ok(remotes[0].supportedProtocolVersions.includes("2025-06-18"));
  assert.equal(serverCard().remotes, undefined); // no origin known → no remote claimed
});

test("A9: a reverse proxy's forwarded host and proto become the advertised origin", async () => {
  const c = (await (await get("/mcp/server-card", {
    "x-forwarded-proto": "https",
    "x-forwarded-host": "ctx.example.com",
  })).json()) as Record<string, any>;
  assert.equal(c.remotes[0].url, "https://ctx.example.com/mcp");
});

test("A10: _meta keys are namespaced (labels, dots, one slash)", async () => {
  for (const k of Object.keys((await card())._meta)) {
    assert.match(k, /^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9](\.[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9])*\/[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/);
  }
});

test("A11: the card lists no primitives", async () => {
  const c = await card();
  for (const k of ["tools", "resources", "prompts", "capabilities"]) assert.equal(c[k], undefined);
});

test("A12: the live serverInfo (name, title, version) matches the card", async () => {
  const c = await card();
  const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const info = client.getServerVersion()!;
  assert.equal(info.name, c.name);
  assert.equal(info.title, c.title);
  assert.equal(info.version, c.version);
  await client.close();
});

test("A13: no credentials, tokens or private endpoints in the card", async () => {
  const text = JSON.stringify(await card());
  assert.doesNotMatch(text, /token|secret|password|api[_-]?key|localhost|192\.168\.|10\.\d+\.\d+\.\d+/i);
});

// ── B. Hosting ──────────────────────────────────────────────────────────────

test("B1: the card is at /mcp/server-card; the 1.x path is a same-content alias", async () => {
  const a = await get("/mcp/server-card");
  const b = await get("/.well-known/mcp/server-card");
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(await a.text(), await b.text());
});

test("B2: the card is served as application/mcp-server-card+json", async () => {
  assert.equal((await get("/mcp/server-card")).headers.get("content-type"), CARD_TYPE);
});

test("B3: discovery documents carry the spec's CORS headers", async () => {
  for (const p of ["/mcp/server-card", "/.well-known/ai-catalog.json"]) {
    const r = await get(p, { Origin: "https://example.com" });
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    assert.match(r.headers.get("access-control-expose-headers") ?? "", /ETag/i);
    const pre = await fetch(`${base}${p}`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "if-none-match",
      },
    });
    assert.equal(pre.headers.get("access-control-allow-methods"), "GET");
    const allowed = (pre.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    assert.ok(allowed.includes("content-type") && allowed.includes("if-none-match"), allowed);
  }
});

test("B4: discovery documents are cacheable (public, max-age=3600)", async () => {
  for (const p of ["/mcp/server-card", "/.well-known/ai-catalog.json"]) {
    assert.equal((await get(p)).headers.get("cache-control"), "public, max-age=3600");
  }
});

test("B5: an ETag is returned and If-None-Match gets 304 Not Modified", async () => {
  for (const p of ["/mcp/server-card", "/.well-known/ai-catalog.json"]) {
    const etag = (await get(p)).headers.get("etag");
    assert.ok(etag && /^"[^"]+"$/.test(etag), String(etag));
    const again = await get(p, { "If-None-Match": etag! });
    assert.equal(again.status, 304);
    assert.equal(again.headers.get("etag"), etag);
  }
});

// ── C. AI Catalog ───────────────────────────────────────────────────────────

const catalog = async () => (await get("/.well-known/ai-catalog.json")).json() as Promise<Record<string, any>>;

test("C1–C3: specVersion, entries and host.displayName are present", async () => {
  const c = await catalog();
  assert.equal(c.specVersion, "1.0");
  assert.ok(Array.isArray(c.entries));
  assert.ok(c.host.displayName);
});

test("C4: the served catalog links the Server Card at <origin>/mcp/server-card", async () => {
  const e = (await catalog()).entries.find((x: any) => x.type === CARD_TYPE);
  assert.ok(e, "no Server Card entry");
  assert.equal(e.url, `${base}/mcp/server-card`);
  assert.equal(e.data, undefined);
});

test("C4: the static catalog carries the Server Card inline as data, schema-valid", () => {
  const e = buildCatalog(fx.root).entries.find((x) => x.type === CARD_TYPE) as Record<string, any>;
  assert.ok(e && e.data && !e.url);
  assert.ok(validateCard(e.data), JSON.stringify(validateCard.errors));
  const committed = JSON.parse(readFileSync(join(REPO_ROOT, ".well-known/ai-catalog.json"), "utf8"));
  assert.ok(committed.entries.some((x: any) => x.type === CARD_TYPE && x.data));
});

test("C5: identifiers use the publisher domain from the project's .fafa (faf.one here)", async () => {
  const ids = (await catalog()).entries.map((x: any) => x.identifier);
  assert.deepEqual(ids, [
    "urn:air:faf.one:mcp:mcp-context-card",
    "urn:air:faf.one:context:mcp-context-card",
    "urn:air:faf.one:memory:mcp-context-card",
    "urn:air:faf.one:identity:mcp-context-card",
  ]);
});

test("C5: with no .fafa domain, served = request host, static = plain ids (never invented)", () => {
  const { root, cleanup } = fixture();
  try {
    const f = join(root, ".well-known/fafa");
    writeFileSync(f, readFileSync(f, "utf8").replace(/^\s*id: .*$/m, ""));
    const served = buildCatalog(root, { origin: "https://ctx.acme.dev" }).entries.map((x) => x.identifier);
    assert.equal(served[0], "urn:air:ctx.acme.dev:mcp:mcp-context-card");
    const stat = buildCatalog(root).entries.map((x) => x.identifier);
    assert.equal(stat[0], "mcp-context-card:mcp");
    assert.ok(stat.every((i) => !i.includes("faf.one")));
  } finally {
    cleanup();
  }
});

test("C6–C7: entries use type only, and custom data sits in extensions", async () => {
  for (const e of (await catalog()).entries) {
    assert.equal(e.mediaType, undefined);
    assert.equal(e._meta, undefined);
    for (const k of Object.keys(e.extensions ?? {})) assert.match(k, /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/);
  }
});

test("C8: the card entry repeats no name, description or version", async () => {
  const e = (await catalog()).entries.find((x: any) => x.type === CARD_TYPE);
  for (const k of ["displayName", "description", "version"]) assert.equal(e[k], undefined);
});

test("C9: every entry URL resolves, served with the type its entry declares", async () => {
  for (const e of (await catalog()).entries) {
    const r = await fetch(e.url);
    assert.equal(r.status, 200, e.url);
    assert.ok((r.headers.get("content-type") ?? "").startsWith(e.type), `${e.url}: ${r.headers.get("content-type")}`);
  }
});

test("C10: the catalog is served as application/ai-catalog+json", async () => {
  assert.equal((await get("/.well-known/ai-catalog.json")).headers.get("content-type"), "application/ai-catalog+json");
});
