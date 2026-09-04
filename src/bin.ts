#!/usr/bin/env node
/**
 * bin — the entry point.
 *
 *   mcp-context-card              → stdio  (the default; what an MCP host spawns)
 *   mcp-context-card --http       → stateless Streamable HTTP on PORT (default 3000)
 *   PORT=8080 mcp-context-card    → HTTP too (a hosted deploy sets PORT)
 *   mcp-context-card --stdio      → force stdio even when PORT is set
 *   mcp-context-card card         → render THIS directory's context card to stdout
 *                                   ( > card.html · --theme light|dark · --accent #hex )
 *   mcp-context-card --help       → usage
 *   mcp-context-card --version    → version
 *
 * MCP_CONTEXT_CARD_ROOT=/path/to/project → read AGENTS.md / project.fafm /
 *   .well-known/ from there instead of the package's own bundled copies.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NAME, VERSION } from "./constants.js";
import { ROOT, serve } from "./server.js";

export type Mode = "stdio" | "http" | "card" | "help" | "version";

export interface Launch {
  mode: Mode;
  /** port for http mode (ignored otherwise). */
  port: number;
  /** directory to read from — cwd for `card`, else MCP_CONTEXT_CARD_ROOT ?? package root. */
  root: string;
}

/** what a bare `--help` / `help` prints. */
export const HELP = `${NAME} ${VERSION}
Serve a project's context (AGENTS.md), memory, and identity over MCP.

USAGE
  mcp-context-card                  stdio MCP server — what an MCP host spawns (default)
  mcp-context-card --http           stateless Streamable HTTP on PORT (default 3000)
  mcp-context-card --stdio          force stdio even when PORT is set
  mcp-context-card card [> f.html]  render this directory's context card to stdout
                                      --theme light|dark    --accent #hex
  mcp-context-card --help           this text
  mcp-context-card --version        print version

ENV
  MCP_CONTEXT_CARD_ROOT   read AGENTS.md / project.fafm / .well-known/ from here
  PORT                    if set, run HTTP instead of stdio

A bare run is an stdio server: it waits for a host to speak JSON-RPC on stdin,
so it looks idle at a terminal. Try \`card\` or \`--http\` to see output directly.
https://github.com/Wolfe-Jam/mcp-context-card
`;

/**
 * Decide how to launch, from argv + env. Pure — so the mode matrix is unit
 * tested without spawning a process.
 *
 *   --help  | -h  | help     → print usage
 *   --version | -V | version → print version
 *   card                     → render the cwd's card to stdout
 *   (nothing)                → stdio
 *   --http | PORT=<n>        → http
 *   --stdio                  → stdio, even when PORT is set
 */
export function resolveLaunch(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Launch {
  const has = (...flags: string[]) => flags.some((f) => argv.includes(f));

  if (argv[0] === "help" || has("--help", "-h")) return { mode: "help", port: 0, root: ROOT };
  if (argv[0] === "version" || has("--version", "-V")) return { mode: "version", port: 0, root: ROOT };

  if (argv[0] === "card") {
    return {
      mode: "card",
      port: 0,
      root: env.MCP_CONTEXT_CARD_ROOT ? resolve(env.MCP_CONTEXT_CARD_ROOT) : process.cwd(),
    };
  }
  const n = Number(env.PORT);
  const portEnv = env.PORT && Number.isFinite(n) && n > 0 ? n : undefined;
  const forceStdio = argv.includes("--stdio");
  const http = !forceStdio && (argv.includes("--http") || portEnv !== undefined);
  const root = env.MCP_CONTEXT_CARD_ROOT ? resolve(env.MCP_CONTEXT_CARD_ROOT) : ROOT;
  return { mode: http ? "http" : "stdio", port: portEnv ?? 3000, root };
}

/** value of `--flag <value>` in argv, or undefined. */
export function flagValue(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

/** Direct run only — importing this module (e.g. from a test) must not launch. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const { mode, port, root } = resolveLaunch(argv);

  if (mode === "help") {
    process.stdout.write(HELP);
  } else if (mode === "version") {
    process.stdout.write(`${VERSION}\n`);
  } else if (mode === "card") {
    const { renderCard, safeAccent } = await import("./render-card.js");
    const theme = flagValue(argv, "--theme");
    process.stdout.write(
      renderCard(root, {
        theme: theme === "light" || theme === "dark" ? theme : "auto",
        accent: safeAccent(flagValue(argv, "--accent")),
      }),
    );
  } else if (mode === "http") {
    const { httpApp } = await import("./transport/http.js");
    const { serve: serveHttp } = await import("@hono/node-server");
    serveHttp({ fetch: httpApp(root).fetch, port });
    // stderr, not stdout — stdout is the MCP wire in stdio mode.
    console.error(`${NAME} · http · :${port}  (POST /mcp · GET /card · GET /.well-known/*)`);
  } else {
    // stderr so it never touches the JSON-RPC wire on stdout; a bare run at a
    // terminal otherwise looks hung.
    console.error(`${NAME} · stdio · waiting for an MCP host on stdin  (--help for usage · Ctrl-C to exit)`);
    await serve(new StdioServerTransport(), root);
  }
}
