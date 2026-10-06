/**
 * http — the stateless Streamable HTTP transport (MCP 2026-03-26+).
 *
 * A Hono app. `POST /mcp` is the MCP endpoint, run **stateless**: a fresh
 * server + transport per request, `sessionIdGenerator: undefined`, and
 * `enableJsonResponse` so every response is a complete JSON body (no SSE
 * stream, nothing to keep open). That's the right default here — it scales
 * horizontally, needs no sticky sessions, and there's no per-connection
 * state to leak. A server that needs server-streamed
 * notifications or resumability would set a `sessionIdGenerator` and hold
 * transports in a map; this one deliberately does not.
 *
 * Alongside the MCP endpoint it serves the discovery documents (MCP Server
 * Cards, SEP-2127 Final; AI Catalog 1.0):
 *   GET /mcp/server-card               — the Server Card (the spec's reserved
 *                                         `<streamable-http-url>/server-card`)
 *   GET /.well-known/mcp/server-card   — the same card, the 1.x location (alias)
 *   GET /.well-known/ai-catalog.json   — the card + the three sibling entries
 *   GET /AGENTS.md · /project.fafm · /.well-known/fafa — the files the catalog links
 *
 * Discovery documents carry the spec's CORS (GET only, `Content-Type` and
 * `If-None-Match` allowed, `ETag` exposed), `Cache-Control: public,
 * max-age=3600`, and an `ETag` honoured with `304 Not Modified`. Serve them over
 * HTTPS in production (TLS is the host's job; HTTP is for local development).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildCatalog } from "../catalog-gen.js";
import { fafaFile } from "../identity.js";
import { createServer, NAME, ROOT, VERSION, serverCard } from "../server.js";
import { renderCard, safeAccent, type Theme } from "../render-card.js";
import {
  AI_CATALOG_MEDIA_TYPE,
  LEGACY_SERVER_CARD_PATH,
  MCP_PATH,
  SERVER_CARD_MEDIA_TYPE,
  SERVER_CARD_PATH,
} from "../constants.js";

/** The paths that are discovery documents (spec CORS + caching). */
const DISCOVERY_PATHS = [
  SERVER_CARD_PATH,
  LEGACY_SERVER_CARD_PATH,
  "/.well-known/ai-catalog.json",
  "/.well-known/fafa",
  "/AGENTS.md",
  "/project.fafm",
];

/** CORS exactly as the Server Card spec lists it. */
const discoveryCors = cors({
  origin: "*",
  allowMethods: ["GET"],
  allowHeaders: ["Content-Type", "If-None-Match"],
  exposeHeaders: ["ETag"],
});

/** The public origin of this request, honouring a reverse proxy's forwarded headers. */
export function originOf(c: Context): string {
  const url = new URL(c.req.url);
  const proto = (c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "")).split(",")[0].trim();
  const host = (c.req.header("x-forwarded-host") ?? c.req.header("host") ?? url.host).split(",")[0].trim();
  return `${proto}://${host}`;
}

/** A cacheable discovery response: Content-Type, Cache-Control, ETag, and 304 on a match. */
function discovery(c: Context, body: string, contentType: string): Response {
  const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
  c.header("Cache-Control", "public, max-age=3600");
  c.header("ETag", etag);
  const match = c.req.header("if-none-match");
  if (match && match.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) {
    return c.body(null, 304);
  }
  c.header("Content-Type", contentType);
  return c.body(body);
}

export function httpApp(root: string = ROOT): Hono {
  const app = new Hono();
  for (const p of DISCOVERY_PATHS) app.use(p, discoveryCors);
  app.use(MCP_PATH, cors());
  app.use("/card", cors());
  app.use("/", cors());

  // ── MCP endpoint — stateless ────────────────────────────────────────
  app.all(MCP_PATH, async (c) => {
    const server = createServer(root);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true, // complete JSON body, no SSE stream
    });
    await server.connect(transport);
    const res = await transport.handleRequest(c.req.raw);
    // JSON/stateless mode: the response body is fully built before we get
    // here, so closing the per-request instances now can't truncate it.
    void transport.close();
    void server.close();
    return res;
  });

  // ── Discovery documents ─────────────────────────────────────────────
  const card = (c: Context) =>
    discovery(c, JSON.stringify(serverCard({ origin: originOf(c) }), null, 2), SERVER_CARD_MEDIA_TYPE);
  app.get(SERVER_CARD_PATH, card);
  app.get(LEGACY_SERVER_CARD_PATH, card);

  app.get("/.well-known/ai-catalog.json", (c) =>
    discovery(c, JSON.stringify(buildCatalog(root, { origin: originOf(c) }), null, 2), AI_CATALOG_MEDIA_TYPE),
  );

  // The files the catalog links to, each with the type its entry declares.
  // Fixed names only: nothing from the request picks a path.
  const file = (path: string | null, type: string) => (c: Context) =>
    path && existsSync(path) ? discovery(c, readFileSync(path, "utf8"), type) : c.notFound();
  app.get("/.well-known/fafa", (c) => file(fafaFile(root), "application/vnd.fafa+yaml")(c));
  app.get("/AGENTS.md", file(join(root, "AGENTS.md"), "text/markdown; charset=utf-8"));
  app.get("/project.fafm", file(join(root, "project.fafm"), "application/vnd.fafm+yaml"));

  // ── The card — the view for people ──────────────────────────────────
  app.get("/card", (c) => {
    const q = c.req.query();
    const theme = (["light", "dark", "auto"].includes(q.theme ?? "") ? q.theme : "auto") as Theme;
    c.header("content-type", "text/html; charset=utf-8");
    return c.body(
      renderCard(root, { theme, accent: safeAccent(q.accent), expanded: q.expand === "all" }),
    );
  });

  // ── Index ───────────────────────────────────────────────────────────
  app.get("/", (c) =>
    c.json({
      name: NAME,
      version: VERSION,
      mcp: MCP_PATH,
      serverCard: SERVER_CARD_PATH,
      card: "/card",
      wellKnown: [
        LEGACY_SERVER_CARD_PATH,
        "/.well-known/ai-catalog.json",
        "/.well-known/fafa",
      ],
    }),
  );

  return app;
}
