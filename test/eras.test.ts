/**
 * Both protocol eras, from one server. A 2026-07-28 client opens with
 * `server/discover` and carries its capabilities on every request; a 2025
 * client opens with `initialize`. Claude Code and goose already try 07-28
 * first and fall back, so both paths must give the same answers.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Client, StreamableHTTPClientTransport, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/client";
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
    // Read the port once the socket is listening, not after a fixed wait.
    await new Promise<void>((r) => {
      httpServer = serve({ fetch: httpApp(fx.root).fetch, port: 0 }, () => r());
    });
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
      const full = say(await apps.callTool({ name: "render_context_card", arguments: { format: "markdown", detail: "FULL" } }));
      const tldr = say(await apps.callTool({ name: "render_context_card", arguments: { format: "markdown" } }));
      assert.ok(full.length > tldr.length, "detail is read case-insensitively: FULL is the full card");
      for (const format of ["markdown", " Markdown "]) {
        const md = say(await apps.callTool({ name: "render_context_card", arguments: { format } }));
        assert.match(md, /^### .+ — business card/m, `format ${JSON.stringify(format)}: the text card, never the line`);
        assert.doesNotMatch(md, /<html/i);
      }
    } finally {
      await apps.close();
    }
    const plain = client(MODERN);
    await plain.connect(new StreamableHTTPClientTransport(url));
    try {
      assert.match(say(await plain.callTool({ name: "render_context_card", arguments: {} })), /^### .+ — business card/m, "no MCP Apps: the text card");
    } finally {
      await plain.close();
    }
  });

  test("the Server Card lists exactly what the server answers: server/discover's versions, then the 2025 ones", async () => {
    const card = await (await fetch(new URL("/mcp/server-card", url))).json();
    const versions: string[] = card.remotes[0].supportedProtocolVersions;
    const c = client(MODERN);
    await c.connect(new StreamableHTTPClientTransport(url));
    try {
      // An SDK update that adds a revision changes discover's list; this fails until the card follows.
      const modern = c.getDiscoverResult()?.supportedVersions ?? [];
      assert.ok(modern.length > 0, "server/discover must name its versions");
      assert.deepEqual(versions, [...modern, ...SUPPORTED_PROTOCOL_VERSIONS]);
    } finally {
      await c.close();
    }
  });

  test("a 2026-07-28 answer is one JSON body too", async () => {
    // The handler's default ("auto") streams only when a tool emits a notification first; ours never do.
    const c = client(MODERN);
    let contentType = "";
    const transport = new StreamableHTTPClientTransport(url, {
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        if (init?.method === "POST") contentType = res.headers.get("content-type") ?? "";
        return res;
      },
    });
    await c.connect(transport);
    try {
      await c.callTool({ name: "list_agents_md_sections", arguments: {} });
      assert.match(contentType, /application\/json/);
    } finally {
      await c.close();
    }
  });

  test("a 2025 MCP Apps client over stateless HTTP gets the text card (its initialize capabilities don't reach tools/call)", async () => {
    const c = client("legacy", { extensions: { [UI_EXTENSION]: { mimeTypes: [MCP_APP_MIME] } } });
    await c.connect(new StreamableHTTPClientTransport(url));
    try {
      const reply = say(await c.callTool({ name: "render_context_card", arguments: {} }));
      assert.match(reply, /^### .+ — business card/m, "each POST is a fresh server: no capabilities, so the text card, never HTML");
      assert.doesNotMatch(reply, /<html/i);
    } finally {
      await c.close();
    }
  });

  test("2025 requests ignore 2026 envelope keys in _meta (capabilities come from initialize)", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "render_context_card",
          arguments: {},
          _meta: {
            "io.modelcontextprotocol/clientCapabilities": { extensions: { [UI_EXTENSION]: { mimeTypes: [MCP_APP_MIME] } } },
          },
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.result.content[0].text, /^### .+ — business card/m, "a 2025 request must not switch to the MCP Apps reply: it gets the text card");
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

describe("stdio, 2026-07-28: a later roots answer replaces the first", () => {
  // Real clients send roots only in answer to input_required, so the server asks
  // once per connection; a client that sends roots with a later call (here, raw
  // JSON-RPC) must get that root, not the cached one. 2025 follows
  // notifications/roots/list_changed instead (roots.test.ts).
  test("roots a, then a call carrying roots b, answers b; a decline falls back", async () => {
    const mk = (n: string) => {
      const d = mkdtempSync(join(tmpdir(), `mcp-cc-eras-${n}-`));
      writeFileSync(join(d, "AGENTS.md"), `# AGENTS.md\n\n## ${n}\n`);
      return d;
    };
    const a = mk("a"), b = mk("b");
    const env = { ...process.env, PORT: "" } as Record<string, string>;
    delete env.MCP_CONTEXT_CARD_ROOT;
    // cwd = the repo (tsx resolves from it); its own AGENTS.md is the decline fallback
    const child = spawn(runner.command, runner.args, { env, cwd: REPO_ROOT, stdio: ["pipe", "pipe", "ignore"] });
    const meta = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "eras", version: "0" },
      "io.modelcontextprotocol/clientCapabilities": { roots: { listChanged: true } },
    };
    const pending = new Map<number, (m: any) => void>();
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      for (let n = buf.indexOf("\n"); n >= 0; n = buf.indexOf("\n")) {
        const m = JSON.parse(buf.slice(0, n));
        buf = buf.slice(n + 1);
        pending.get(m.id)?.(m);
      }
    });
    let id = 0;
    const rpc = (method: string, params: object) =>
      new Promise<any>((resolve) => {
        pending.set(++id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: { _meta: meta, ...params } }) + "\n");
      });
    const sources = async (inputResponses?: object) => {
      const r = (await rpc("tools/call", { name: "list_context_sources", arguments: {}, ...(inputResponses ? { inputResponses } : {}) })).result;
      return r.content ? JSON.parse(r.content[0].text).project : "input_required";
    };
    const roots = (d: string) => ({ roots: { roots: [{ uri: pathToFileURL(d).href }] } });
    try {
      await rpc("server/discover", {});
      assert.equal(await sources(), "input_required");
      assert.deepEqual(await sources(roots(a)), { path: a, from: "client roots" });
      assert.deepEqual(await sources(), { path: a, from: "client roots" }, "no answer: the cached root, no new question");
      assert.deepEqual(await sources(roots(b)), { path: b, from: "client roots" });
      // inputResponses are not validated by the SDK: malformed entries must not fail the call,
      // and a bare absolute path (the Cursor editor's form) is read on this era too
      const messy = { roots: { roots: [42, null, { name: "x" }, "x", { uri: 7 }, { uri: a }] } };
      assert.deepEqual(await sources(messy), { path: a, from: "client roots" });
      const declined = await sources({ roots: { action: "decline" } });
      assert.deepEqual(declined, { path: REPO_ROOT, from: "start directory" });
    } finally {
      child.stdin.end();
      await new Promise((r) => child.once("exit", r));
      for (const d of [a, b]) rmSync(d, { recursive: true, force: true });
    }
  });
});
