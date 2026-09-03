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
 *   mcp-context-card init         → author an AGENTS.md for THIS directory
 *                                   (BEST from a project.faf, else BETTER; never clobbers)
 *
 * MCP_CONTEXT_CARD_ROOT=/path/to/project → read AGENTS.md / project.fafm /
 *   .well-known/ from there instead of the package's own bundled copies.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ROOT, serve } from "./server.js";

export type Mode = "stdio" | "http" | "card" | "init";

export interface Launch {
  mode: Mode;
  /** port for http mode (ignored otherwise). */
  port: number;
  /** directory to read from — cwd for `card`, else MCP_CONTEXT_CARD_ROOT ?? package root. */
  root: string;
}

/**
 * Decide how to launch, from argv + env. Pure — so the mode matrix is unit
 * tested without spawning a process.
 *
 *   card               → render the cwd's card to stdout
 *   (nothing)          → stdio
 *   --http | PORT=<n>  → http
 *   --stdio            → stdio, even when PORT is set
 */
export function resolveLaunch(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Launch {
  if (argv[0] === "card" || argv[0] === "init") {
    return {
      mode: argv[0],
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

  if (mode === "card") {
    const { renderCard, safeAccent } = await import("./render-card.js");
    const theme = flagValue(argv, "--theme");
    process.stdout.write(
      renderCard(root, {
        theme: theme === "light" || theme === "dark" ? theme : "auto",
        accent: safeAccent(flagValue(argv, "--accent")),
      }),
    );
  } else if (mode === "init") {
    const { writeFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { authorAgentsMd } = await import("./author.js");
    const target = join(root, "AGENTS.md");
    const a = authorAgentsMd(root);
    if (existsSync(target)) {
      process.stdout.write(a.markdown);
      console.error(
        `\nmcp-context-card · AGENTS.md already exists — printed a ${a.tier} draft (from ${a.from.join(", ")}) above; diff it in, nothing written.`,
      );
    } else {
      writeFileSync(target, a.markdown);
      console.error(`mcp-context-card · wrote AGENTS.md · ${a.tier} · from ${a.from.join(", ")}`);
    }
  } else if (mode === "http") {
    const { httpApp } = await import("./transport/http.js");
    const { serve: serveHttp } = await import("@hono/node-server");
    serveHttp({ fetch: httpApp(root).fetch, port });
    // stderr, not stdout — stdout is the MCP wire in stdio mode.
    console.error(`mcp-context-card · http · :${port}  (POST /mcp · GET /card · GET /.well-known/*)`);
  } else {
    await serve(new StdioServerTransport(), root);
  }
}
