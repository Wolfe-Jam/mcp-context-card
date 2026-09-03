#!/usr/bin/env node
/**
 * bin — the dual-transport entry point.
 *
 *   mcp-trinity              → stdio  (the default; what an MCP host spawns)
 *   mcp-trinity --http       → stateless Streamable HTTP on PORT (default 3000)
 *   PORT=8080 mcp-trinity    → HTTP too (a hosted deploy sets PORT)
 *   mcp-trinity --stdio      → force stdio even when PORT is set
 *
 * MCP_TRINITY_ROOT=/path/to/project → read project.faf / project.fafm /
 *   .well-known/ from there instead of the package's own bundled copies.
 *   (A fork points this at its repo; the default is the package itself.)
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ROOT, serve } from "./server.js";

export interface Launch {
  /** true → stateless Streamable HTTP; false → stdio. */
  http: boolean;
  /** port for http mode (ignored for stdio). */
  port: number;
  /** directory holding project.faf / project.fafm / .well-known/. */
  root: string;
}

/**
 * Decide how to launch, from argv + env. Pure — so the mode matrix is unit
 * tested without spawning a process.
 *
 *   (nothing)          → stdio
 *   --http             → http on PORT ?? 3000
 *   PORT=<n>           → http on <n>          (a hosted deploy sets PORT)
 *   --stdio            → stdio, even when PORT is set
 *   MCP_TRINITY_ROOT=… → project files from there, else the package root
 */
export function resolveLaunch(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Launch {
  const n = Number(env.PORT);
  const portEnv = env.PORT && Number.isFinite(n) && n > 0 ? n : undefined;
  const forceStdio = argv.includes("--stdio");
  const http = !forceStdio && (argv.includes("--http") || portEnv !== undefined);
  const root = env.MCP_TRINITY_ROOT ? resolve(env.MCP_TRINITY_ROOT) : ROOT;
  return { http, port: portEnv ?? 3000, root };
}

/** Direct run only — importing this module (e.g. from a test) must not launch. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { http, port, root } = resolveLaunch(process.argv.slice(2));
  if (http) {
    const { httpApp } = await import("./transport/http.js");
    const { serve: serveHttp } = await import("@hono/node-server");
    serveHttp({ fetch: httpApp(root).fetch, port });
    // stderr, not stdout — stdout is the MCP wire in stdio mode, and a hosted
    // process's logs go to stderr by convention.
    console.error(`mcp-trinity · http · :${port}  (POST /mcp · GET /.well-known/*)`);
  } else {
    await serve(new StdioServerTransport(), root);
  }
}
