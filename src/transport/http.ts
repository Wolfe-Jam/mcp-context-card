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
 * Alongside the MCP endpoint it serves the discovery documents:
 *   GET /.well-known/mcp/server-card   — the Server Card + _meta trinity
 *   GET /.well-known/ai-catalog.json   — the three sibling entries
 *   GET /.well-known/fafa              — the agent identity card
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildCatalog } from "../catalog-gen.js";
import { createServer, NAME, ROOT, VERSION, serverCard } from "../server.js";
import { renderCard, safeAccent, type Theme } from "../render-card.js";

export function httpApp(root: string = ROOT): Hono {
  const app = new Hono();
  app.use("*", cors());

  // ── MCP endpoint — stateless ────────────────────────────────────────
  app.all("/mcp", async (c) => {
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
  app.get("/.well-known/mcp/server-card", (c) => c.json(serverCard()));

  app.get("/.well-known/ai-catalog.json", (c) => {
    c.header("content-type", "application/ai-catalog+json");
    return c.body(JSON.stringify(buildCatalog(root), null, 2));
  });

  app.get("/.well-known/fafa", (c) => {
    c.header("content-type", "application/vnd.fafa+yaml");
    return c.body(readFileSync(join(root, ".well-known/fafa"), "utf8"));
  });

  // ── The card — the view for people ──────────────────────────────────
  app.get("/card", (c) => {
    const q = c.req.query();
    const theme = (["light", "dark", "auto"].includes(q.theme ?? "") ? q.theme : "auto") as Theme;
    c.header("content-type", "text/html; charset=utf-8");
    return c.body(renderCard(root, { theme, accent: safeAccent(q.accent) }));
  });

  // ── Index ───────────────────────────────────────────────────────────
  app.get("/", (c) =>
    c.json({
      name: NAME,
      version: VERSION,
      mcp: "/mcp",
      card: "/card",
      wellKnown: [
        "/.well-known/mcp/server-card",
        "/.well-known/ai-catalog.json",
        "/.well-known/fafa",
      ],
    }),
  );

  return app;
}
