/**
 * Both protocol eras, from one server. A 2026-07-28 client opens with
 * `server/discover` and carries its capabilities on every request; a 2025
 * client opens with `initialize`. Claude Code and goose already try 07-28
 * first and fall back, so both paths must give the same answers.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { MCP_APP_MIME, UI_EXTENSION } from "../src/constants.js";
import { httpApp } from "../src/transport/http.js";
import { REPO_ROOT, TOOLS, fixture } from "./helpers.js";

const MODERN = { pin: "2026-07-28" } as const;
const say = (r: unknown) => (r as any).content[0].text as string;
const runner = { command: process.execPath, args: ["--import", "tsx", join(REPO_ROOT, "src/bin.ts")] };

type Mode = "legacy" | "auto" | { pin: "2026-07-28" };
const client = (mode: Mode, capabilities: Record<string, unknown> = {}) =>
  new Client({ name: "eras", version: "0" }, { capabilities, versionNegotiation: { mode } });

describe("http: both eras on one /mcp", () => {
  let fx: ReturnType<typeof fixture>;
  let httpServer: ReturnType<typeof serve>;
  let url: URL;

  before(async () => {
    fx = fixture();
    httpServer = serve({ fetch: httpApp(fx.root).fetch, port: 0 });
    await new Promise((r) => setTimeout(r, 50));
    url = new URL(`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`);
  });
  after(() => {
    httpServer.close();
    fx.cleanup();
  });

  test("a 2026-07-28 client connects modern and sees every tool", async () => {
    const c = client(MODERN);
    await c.connect(new StreamableHTTPClientTransport(url));
    try {
      assert.equal(c.getProtocolEra(), "modern");
      const { tools } = await c.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
      assert.match(say(await c.callTool({ name: "list_agents_md_sections", arguments: {} })), /\S/);
    } finally {
      await c.close();
    }
  });

  test("a negotiating client (auto) lands on 2026-07-28", async () => {
    const c = client("auto");
    await c.connect(new StreamableHTTPClientTransport(url));
    try {
      assert.equal(c.getProtocolEra(), "modern");
    } finally {
      await c.close();
    }
  });

  test("a 2025 client still connects with initialize and gets the same tools", async () => {
    const c = client("legacy");
    await c.connect(new StreamableHTTPClientTransport(url));
    try {
      assert.equal(c.getProtocolEra(), "legacy");
      const { tools } = await c.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
    } finally {
      await c.close();
    }
  });

  test("a 2025 request is still answered as one JSON body, not a stream", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "raw", version: "0" } },
      }),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.equal((await res.json()).result?.protocolVersion, "2025-11-25");
  });

  test("MCP Apps: a 2026-07-28 host's per-request capabilities are honoured", async () => {
    const apps = client(MODERN, { extensions: { [UI_EXTENSION]: { mimeTypes: [MCP_APP_MIME] } } });
    await apps.connect(new StreamableHTTPClientTransport(url));
    try {
      const short = say(await apps.callTool({ name: "render_context_card", arguments: {} }));
      assert.match(short, /^Showing the context card/);
    } finally {
      await apps.close();
    }
    const plain = client(MODERN);
    await plain.connect(new StreamableHTTPClientTransport(url));
    try {
      assert.match(say(await plain.callTool({ name: "render_context_card", arguments: {} })), /<html/i);
    } finally {
      await plain.close();
    }
  });

  test("the Server Card advertises 2026-07-28 beside the 2025 revisions", async () => {
    const card = await (await fetch(new URL("/mcp/server-card", url))).json();
    const versions: string[] = card.remotes[0].supportedProtocolVersions;
    assert.equal(versions[0], "2026-07-28");
    assert.ok(versions.includes("2025-11-25"));
  });
});

describe("stdio: both eras from one child", () => {
  let fx: ReturnType<typeof fixture>;
  before(() => {
    fx = fixture();
  });
  after(() => fx.cleanup());

  const child = (env: Record<string, string>, cwd?: string) =>
    new StdioClientTransport({ command: runner.command, args: runner.args, env, cwd });
  const pinnedEnv = () => ({ ...process.env, MCP_CONTEXT_CARD_ROOT: fx.root, PORT: "" }) as Record<string, string>;

  for (const [label, mode, era] of [
    ["2026-07-28", MODERN, "modern"],
    ["negotiating (auto)", "auto", "modern"],
    ["2025", "legacy", "legacy"],
  ] as const) {
    test(`a ${label} client connects ${era} and calls a tool`, async () => {
      const c = client(mode);
      await c.connect(child(pinnedEnv()));
      try {
        assert.equal(c.getProtocolEra(), era);
        assert.match(say(await c.callTool({ name: "list_agents_md_sections", arguments: {} })), /\S/);
      } finally {
        await c.close();
      }
    });
  }

  for (const [label, mode] of [
    ["2026-07-28 (roots asked in-band)", MODERN],
    ["2025 (roots/list request)", "legacy"],
  ] as const) {
    test(`roots, ${label}: the host's root is the project`, async () => {
      const proj = mkdtempSync(join(tmpdir(), "mcp-cc-eras-roots-"));
      writeFileSync(join(proj, "AGENTS.md"), "# AGENTS.md\n\n## Eras Roots Marker\n\nfrom the host's root\n");
      const env = { ...process.env, PORT: "" } as Record<string, string>;
      delete env.MCP_CONTEXT_CARD_ROOT;
      const c = client(mode, { roots: { listChanged: true } });
      c.setRequestHandler("roots/list", async () => ({
        roots: [{ uri: pathToFileURL(proj).href, name: "working_directory" }],
      }));
      try {
        // started in the repo, which has its own AGENTS.md: the host's root must still win
        await c.connect(child(env, REPO_ROOT));
        try {
          const src = JSON.parse(say(await c.callTool({ name: "list_context_sources", arguments: {} })));
          assert.deepEqual(src.project, { path: proj, from: "client roots" });
          assert.match(say(await c.callTool({ name: "list_agents_md_sections", arguments: {} })), /Eras Roots Marker/);
        } finally {
          await c.close();
        }
      } finally {
        rmSync(proj, { recursive: true, force: true });
      }
    });
  }
});
