#!/usr/bin/env node
/**
 * bin — the dual-transport entry point.
 *
 *   mcp-trinity            → stdio  (the default; what an MCP host spawns)
 *   mcp-trinity --http     → stateless Streamable HTTP on PORT (default 3000)
 *   PORT=8080 mcp-trinity  → HTTP too (a hosted deploy sets PORT)
 *   mcp-trinity --stdio    → force stdio even when PORT is set
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ROOT, serve } from "./server.js";

const argv = process.argv.slice(2);
const port = process.env.PORT ? Number(process.env.PORT) : undefined;
const wantHttp = argv.includes("--http") || (port !== undefined && !argv.includes("--stdio"));

if (wantHttp) {
  const { httpApp } = await import("./transport/http.js");
  const { serve: serveHttp } = await import("@hono/node-server");
  const p = port ?? 3000;
  serveHttp({ fetch: httpApp(ROOT).fetch, port: p });
  // stderr, not stdout — stdout is reserved for the MCP wire in stdio mode,
  // and a hosted process's logs go to stderr by convention.
  console.error(`mcp-trinity · http · :${p}  (POST /mcp · GET /.well-known/*)`);
} else {
  await serve(new StdioServerTransport());
}
