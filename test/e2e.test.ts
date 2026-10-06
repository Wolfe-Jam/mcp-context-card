/**
 * e2e — the real thing. Spawns `src/bin.ts` as an actual child process
 * (no InMemoryTransport, no in-process server) and drives it exactly as a
 * host would. This is where "memory survives a process restart" and the
 * dual-transport entry point are proven end to end.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { REPO_ROOT, TOOLS, fixture } from "./helpers.js";

const BIN = join(REPO_ROOT, "src/bin.ts");
const runner = { command: process.execPath, base: ["--import", "tsx", BIN] };

/** Spawn bin.ts over stdio, pointed at `root`, and return a connected client. */
async function stdioChild(root: string): Promise<Client> {
  const client = new Client({ name: "e2e", version: "0" }, { capabilities: {} });
  await client.connect(
    new StdioClientTransport({
      command: runner.command,
      args: runner.base,
      env: { ...process.env, MCP_CONTEXT_CARD_ROOT: root, PORT: "" },
    }),
  );
  return client;
}

async function freePort(): Promise<number> {
  const s = createNetServer();
  s.listen(0);
  await once(s, "listening");
  const { port } = s.address() as AddressInfo;
  await new Promise((r) => s.close(r));
  return port;
}

describe("e2e — real child process", () => {
  test("memory survives a genuine process restart", async () => {
    const fx = fixture();
    try {
      const c1 = await stdioChild(fx.root);
      const fact = `e2e ${Date.now()}`;
      await c1.callTool({ name: "remember", arguments: { id: "e2e", text: fact } });
      await c1.close(); // the child process is now dead — nothing in memory

      const c2 = await stdioChild(fx.root); // a brand-new OS process
      const r = (await c2.callTool({ name: "recall", arguments: { id: "e2e" } })) as any;
      assert.equal(r.content[0].text, fact);
      await c2.close();
    } finally {
      fx.cleanup();
    }
  });

  // A real host check (Cursor, 2026-09-04) found remember() threw on a root
  // that had never had a project.fafm — the fixture() dir above always ships
  // one, so it never exercised that path. This starts from a genuinely bare
  // directory, over the real stdio wire, through a real process restart.
  test("memory: cold root (no project.fafm yet) → remember creates it, survives a restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-cc-cold-e2e-"));
    try {
      const c1 = await stdioChild(root);
      const fact = `cold e2e ${Date.now()}`;
      const remembered = (await c1.callTool({
        name: "remember",
        arguments: { id: "cold", text: fact },
      })) as any;
      assert.equal(remembered.content[0].text, "remembered: cold");
      await c1.close();

      const c2 = await stdioChild(root); // brand-new OS process, same bare root
      const r = (await c2.callTool({ name: "recall", arguments: { id: "cold" } })) as any;
      assert.equal(r.content[0].text, fact);
      await c2.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("stdio child: every tool + the Server Card resource + _meta", async () => {
    const fx = fixture();
    try {
      const c = await stdioChild(fx.root);
      assert.equal(c.getServerVersion()?.name, "io.github.Wolfe-Jam/mcp-context-card");
      const tools = (await c.listTools()).tools.map((t) => t.name).sort();
      assert.deepEqual(tools, TOOLS);

      const res = await c.readResource({ uri: "mcp-context-card://server-card" });
      const card = JSON.parse((res.contents[0] as { text: string }).text);
      assert.deepEqual(Object.keys(card._meta), [
        "io.github.Wolfe-Jam.mcp-context-card/context",
        "io.github.Wolfe-Jam.mcp-context-card/memory",
        "io.github.Wolfe-Jam.mcp-context-card/identity",
      ]);
      await c.close();
    } finally {
      fx.cleanup();
    }
  });

  test("--http child: full MCP session + memory round-trip over the wire", async () => {
    const fx = fixture();
    const port = await freePort();
    const child = spawn(runner.command, [...runner.base, "--http"], {
      env: { ...process.env, PORT: String(port), MCP_CONTEXT_CARD_ROOT: fx.root },
      stdio: ["ignore", "ignore", "pipe"],
    });
    try {
      // wait for "http · :<port>" on stderr (generous — tsx cold-starts slowly on Windows CI)
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("http child did not start")), 20_000);
        child.stderr!.on("data", (b) => {
          if (String(b).includes(`:${port}`)) {
            clearTimeout(t);
            resolve();
          }
        });
        child.on("exit", (code) => reject(new Error(`child exited early (${code})`)));
      });

      const c = new Client({ name: "e2e", version: "0" }, { capabilities: {} });
      await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));

      await c.callTool({ name: "remember", arguments: { id: "http-e2e", text: "over http" } });
      const r = (await c.callTool({ name: "recall", arguments: { id: "http-e2e" } })) as any;
      assert.equal(r.content[0].text, "over http");

      const wk = await (await fetch(`http://127.0.0.1:${port}/.well-known/ai-catalog.json`)).json();
      assert.equal(wk.entries.length, 4); // the Server Card + 3 sibling entries

      await c.close();
    } finally {
      child.kill("SIGKILL");
      await once(child, "exit").catch(() => {});
      fx.cleanup();
    }
  });

  test("`--help` / `--version`: print and exit 0, no server", () => {
    const help = execFileSync(runner.command, [...runner.base, "--help"], { encoding: "utf8" });
    assert.match(help, /^mcp-context-card \d+\.\d+\.\d+/);
    assert.match(help, /USAGE/);

    const version = execFileSync(runner.command, [...runner.base, "--version"], { encoding: "utf8" });
    assert.match(version.trim(), /^\d+\.\d+\.\d+$/);
  });

  test("`card` subcommand: renders the target dir's card to stdout, then exits", () => {
    const fx = fixture();
    try {
      const out = execFileSync(runner.command, [...runner.base, "card", "--theme", "dark"], {
        env: { ...process.env, MCP_CONTEXT_CARD_ROOT: fx.root },
        encoding: "utf8",
      });
      assert.match(out, /^<!doctype html>/);
      assert.match(out, /data-theme="dark"/);
      assert.match(out, /Context — AGENTS\.md/);
    } finally {
      fx.cleanup();
    }
  });


  test("stdio child, no MCP_CONTEXT_CARD_ROOT: reads the project the host's roots point at", async () => {
    const proj = mkdtempSync(join(tmpdir(), "mcp-cc-e2e-roots-"));
    writeFileSync(join(proj, "AGENTS.md"), "# AGENTS.md\n\n## E2E Roots Marker\n\nfrom a real child process\n");
    const env = { ...process.env, PORT: "" } as Record<string, string>;
    delete env.MCP_CONTEXT_CARD_ROOT;
    const c = new Client({ name: "e2e-roots", version: "0" }, { capabilities: { roots: { listChanged: true } } });
    c.setRequestHandler(ListRootsRequestSchema, async () => ({
      roots: [{ uri: pathToFileURL(proj).href, name: "working_directory" }],
    }));
    try {
      // started in the repo, which has its own AGENTS.md: the host's root must still win
      await c.connect(new StdioClientTransport({ command: runner.command, args: runner.base, env, cwd: REPO_ROOT }));
      try {
        const src = JSON.parse(
          ((await c.callTool({ name: "list_context_sources", arguments: {} })) as any).content[0].text,
        );
        assert.deepEqual(src.project, { path: proj, from: "client roots" });
        const heads = ((await c.callTool({ name: "list_agents_md_sections", arguments: {} })) as any).content[0].text;
        assert.match(heads, /E2E Roots Marker/);
      } finally {
        await c.close();
      }
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  test("bin mode selection: default → stdio, --http → http, --stdio wins over PORT", async () => {
    // default (no PORT, no flag) → speaks stdio (a client can connect)
    const fx = fixture();
    try {
      const c = await stdioChild(fx.root);
      try {
        assert.equal((await c.listTools()).tools.length, TOOLS.length);
      } finally {
        await c.close(); // a failed assertion must not leave the child holding the runner open
      }

      // --stdio with PORT set → still stdio, nothing listening on PORT
      const port = await freePort();
      const child = spawn(runner.command, [...runner.base, "--stdio"], {
        env: { ...process.env, PORT: String(port), MCP_CONTEXT_CARD_ROOT: fx.root },
        stdio: ["pipe", "pipe", "ignore"],
      });
      await new Promise((r) => setTimeout(r, 1200));
      let httpUp = false;
      try {
        await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
        httpUp = true;
      } catch {
        /* expected — --stdio means no HTTP listener */
      }
      child.kill("SIGKILL");
      await once(child, "exit").catch(() => {});
      assert.equal(httpUp, false, "--stdio should not start an HTTP server even when PORT is set");
    } finally {
      fx.cleanup();
    }
  });
});
