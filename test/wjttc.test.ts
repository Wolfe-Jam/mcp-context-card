/**
 * WJTTC 7-Tier Certification Suite — mcp-context-card
 *
 * Tier 1: Protocol — handshake on both transports; serverInfo agrees with the card
 * Tier 2: Server Card — the portable checker's card tier, with the official v1 schema
 * Tier 3: Hosting — the portable checker's hosting tier (CORS, caching, ETag/304)
 * Tier 4: AI Catalog — the portable checker's catalog tier
 * Tier 5: Security — discovery routes serve fixed files only, GET only; the card page escapes
 * Tier 6: Parity — stdio and Streamable HTTP expose the same tools, resources and answers
 * Tier 7: Ship — one version everywhere; the bin answers; the package carries what it serves
 *
 * Tiers 2–4 run src/conformance/discovery.ts against this server over real
 * HTTP: the same checks work against any server URL.
 */
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { checkDiscovery, type DiscoveryReport, type Tier } from "../src/conformance/discovery.js";
import { VERSION } from "../src/constants.js";
import { httpApp } from "../src/transport/http.js";
import { REPO_ROOT, cardValidator, fixture } from "./helpers.js";

const BIN = join(REPO_ROOT, "src/bin.ts");
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
const serverJson = JSON.parse(readFileSync(join(REPO_ROOT, "server.json"), "utf8"));

let fx: ReturnType<typeof fixture>;
let httpServer: ReturnType<typeof serve>;
let base: string;
let report: DiscoveryReport;
let http: Client;
let stdio: Client;

before(async () => {
  fx = fixture();
  httpServer = serve({ fetch: httpApp(fx.root).fetch, port: 0 });
  await new Promise((r) => setTimeout(r, 50));
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  report = await checkDiscovery({ mcpUrl: `${base}/mcp` }, { validateCard: cardValidator() });
  http = new Client({ name: "wjttc", version: "0" }, { capabilities: {} });
  await http.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  stdio = new Client({ name: "wjttc", version: "0" }, { capabilities: {} });
  await stdio.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", BIN],
      env: { ...process.env, MCP_CONTEXT_CARD_ROOT: fx.root, PORT: "" },
    }),
  );
});
after(async () => {
  await http?.close();
  await stdio?.close();
  httpServer?.close();
  fx?.cleanup();
});

const card = async () => (await fetch(`${base}/mcp/server-card`)).json() as Promise<Record<string, any>>;

/** Every check in a tier passed; the only skips allowed are the ones named. */
function tierPasses(tier: Tier, allowedSkips: string[] = []) {
  const rows = report.results.filter((r) => r.tier === tier);
  assert.ok(rows.length > 0, `no ${tier} checks ran`);
  const bad = rows.filter((r) => r.status === "fail" || (r.status === "skip" && !allowedSkips.includes(r.id)));
  assert.deepEqual(bad, [], JSON.stringify(bad, null, 2));
}

describe("Tier 1: Protocol", () => {
  test("both transports complete the handshake", () => {
    assert.ok(http.getServerVersion());
    assert.ok(stdio.getServerVersion());
  });

  test("serverInfo name, title and version agree with the card on both transports", async () => {
    const c = await card();
    for (const client of [http, stdio]) {
      const info = client.getServerVersion()!;
      assert.deepEqual([info.name, info.title, info.version], [c.name, c.title, c.version]);
    }
  });

  test("the card advertises exactly the protocol versions the server negotiates", async () => {
    const c = await card();
    const negotiated = (http.transport as StreamableHTTPClientTransport).protocolVersion;
    assert.ok(negotiated && c.remotes[0].supportedProtocolVersions.includes(negotiated), String(negotiated));
  });
});

describe("Tier 2: Server Card", () => {
  test("every card check passes, the v1 JSON Schema included", () => tierPasses("card"));
});

describe("Tier 3: Hosting", () => {
  test("every hosting check passes (HTTPS skips: local development)", () => tierPasses("hosting", ["hosting.https"]));
});

describe("Tier 4: AI Catalog", () => {
  test("every catalog check passes", () => tierPasses("catalog"));
});

describe("Tier 5: Security", () => {
  test("crafted paths never reach files outside the fixed set", async () => {
    for (const p of [
      "/package.json",
      "/.well-known/..%2Fpackage.json",
      "/.well-known/%2e%2e/package.json",
      "/AGENTS.md%2F..%2Fpackage.json",
      "/project.fafm%00.json",
      "/.well-known/fafa/..%2F..%2Fpackage.json",
    ]) {
      const r = await fetch(`${base}${p}`);
      const body = await r.text();
      assert.ok(r.status !== 200 || !body.includes('"devDependencies"'), `${p} → ${r.status}`);
    }
  });

  test("discovery documents answer GET only", async () => {
    for (const p of ["/mcp/server-card", "/.well-known/ai-catalog.json", "/AGENTS.md", "/project.fafm"]) {
      for (const method of ["POST", "PUT", "DELETE"]) {
        const r = await fetch(`${base}${p}`, { method });
        assert.ok(r.status >= 400, `${method} ${p} → ${r.status}`);
      }
    }
  });

  test("the card page escapes markup from the project's own files", async () => {
    const f = join(fx.root, "AGENTS.md");
    const original = readFileSync(f, "utf8");
    try {
      writeFileSync(f, `${original}\n## <script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n`);
      const html = await (await fetch(`${base}/card`)).text();
      assert.ok(!html.includes("<script>alert(1)"), "raw script reached the page");
      assert.ok(!/<img[^>]+onerror=/i.test(html), "raw event handler reached the page");
      assert.ok(html.includes("&lt;script&gt;alert(1)"), "the injected text is not on the page at all");
    } finally {
      writeFileSync(f, original);
    }
  });
});

describe("Tier 6: Parity", () => {
  test("the same tools, with the same descriptions and schemas", async () => {
    const [a, b] = await Promise.all([http.listTools(), stdio.listTools()]);
    assert.ok(a.tools.length > 0);
    assert.deepEqual(a.tools, b.tools);
  });

  test("the same resources, and the same contents when read", async () => {
    const [a, b] = await Promise.all([http.listResources(), stdio.listResources()]);
    assert.ok(a.resources.length > 0);
    assert.deepEqual(a.resources, b.resources);
    for (const { uri } of a.resources) {
      const [ra, rb] = await Promise.all([http.readResource({ uri }), stdio.readResource({ uri })]);
      assert.deepEqual(ra, rb, uri);
    }
  });

  test("the same answers from read-only tools", async () => {
    for (const name of ["whoami", "list_agents_md_sections", "read_agents_md"]) {
      const [ra, rb] = await Promise.all([
        http.callTool({ name, arguments: {} }),
        stdio.callTool({ name, arguments: {} }),
      ]);
      assert.ok(!ra.isError, `${name}: ${JSON.stringify(ra.content)}`);
      assert.deepEqual(ra, rb, name);
    }
  });
});

describe("Tier 7: Ship", () => {
  test("one version everywhere: package.json, server.json, the server and the card", async () => {
    const versions = {
      "package.json": pkg.version,
      "server.json": serverJson.version,
      "server.json packages[0]": serverJson.packages?.[0]?.version,
      "src/constants.ts": VERSION,
      card: (await card()).version,
    };
    assert.deepEqual(new Set(Object.values(versions)).size, 1, JSON.stringify(versions));
  });

  test("the bin answers --version", () => {
    const out = execFileSync(process.execPath, ["--import", "tsx", BIN, "--version"], { encoding: "utf8" });
    assert.equal(out.trim(), pkg.version);
  });

  test("the package carries every file the server serves", () => {
    // Under `npm run`, npm_execpath is npm's own JS entry: run it with this
    // Node so Windows (where `npm` is npm.cmd) needs no shell.
    const args = ["pack", "--dry-run", "--json", "--ignore-scripts"];
    const npmCli = process.env.npm_execpath;
    const out = npmCli && /\.c?js$/.test(npmCli)
      ? execFileSync(process.execPath, [npmCli, ...args], { cwd: REPO_ROOT, encoding: "utf8" })
      : execFileSync("npm", args, { cwd: REPO_ROOT, encoding: "utf8", shell: process.platform === "win32" });
    const listed = JSON.parse(out)[0].files.map((f: { path: string }) => f.path);
    for (const f of ["AGENTS.md", "project.fafm", ".well-known/fafa", ".well-known/ai-catalog.json", "server.json"]) {
      assert.ok(listed.includes(f), `${f} is not in the package`);
    }
  });
});
