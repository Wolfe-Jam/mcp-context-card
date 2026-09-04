/**
 * demo — every tool, run live, over both transports.
 *
 *   1. CONTEXT    — list the AGENTS.md sections, then pull just one.
 *   2. MEMORY     — remember() a fact, stop the server process, start a new
 *      one, recall() the same fact. Only the file carries it across.
 *   3. IDENTITY   — whoami(), and the Server Card _meta block read back from
 *      the `mcp-context-card://server-card` resource.
 *   4. DISCOVERY  — list_context_sources(), then the same server over
 *      stateless Streamable HTTP with its .well-known routes and /card.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const line = "─".repeat(68);

// The memory step writes to the real project.fafm (that's the point — it
// proves persistence on the actual file). Snapshot it so the demo leaves
// no trace, not even a timestamp.
const fafmPath = join(here, "project.fafm");
const fafmSnapshot = readFileSync(fafmPath, "utf8");
process.on("exit", () => writeFileSync(fafmPath, fafmSnapshot));

async function connect(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", join(here, "src/server.ts")],
  });
  const client = new Client({ name: "demo-host", version: "0.5.1" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

const say = (r: any) => r.content.map((c: any) => c.text).join("\n");

console.log(`\n🔺 mcp-context-card — context, memory & identity, over both transports\n`);

// ── 1. CONTEXT ───────────────────────────────────────────────────────────
console.log(`${line}\n1. CONTEXT — the client pulls one AGENTS.md section, not the whole file\n${line}`);
{
  const client = await connect();
  const sections = JSON.parse(say(await client.callTool({ name: "list_agents_md_sections", arguments: {} })));
  console.log(`· list_agents_md_sections → ${sections.map((s: any) => s.heading).join(" · ")}`);
  const testing = say(await client.callTool({ name: "read_agents_md", arguments: { section: "Test" } }));
  console.log(`· read_agents_md({ section: "Test" }) →\n${testing.split("\n").map((l: string) => `    ${l}`).join("\n")}`);
  await client.close();
}

// ── 2. MEMORY ────────────────────────────────────────────────────────────
console.log(`\n${line}\n2. MEMORY — remember() → stop the process → start a new one → recall()\n${line}`);
const factId = "demo-run";
const factText = `demo ran at ${new Date().toISOString()}`;
{
  const client = await connect();
  await client.callTool({ name: "remember", arguments: { id: factId, text: factText } });
  console.log(`· remembered on server process #1: "${factText}"`);
  await client.close(); // process #1 is gone — no in-memory state survives
}
{
  const client = await connect(); // brand new process, zero shared memory
  const got = say(await client.callTool({ name: "recall", arguments: { id: factId } }));
  console.log(`· recalled on server process #2:  "${got}"`);
  if (got !== factText) throw new Error("memory did not survive the process boundary");
  await client.close();
}
console.log(`· project.fafm restored on exit — the demo leaves no trace`);

// ── 3. IDENTITY + _meta ──────────────────────────────────────────────────
console.log(`\n${line}\n3. IDENTITY — whoami() + the Server Card _meta block (read back)\n${line}`);
{
  const client = await connect();
  console.log(say(await client.callTool({ name: "whoami", arguments: {} })));
  const cardRes = await client.readResource({ uri: "mcp-context-card://server-card" });
  const card = JSON.parse((cardRes.contents[0] as { text: string }).text);
  console.log(`\n· mcp-context-card://server-card → _meta keys: ${Object.keys(card._meta).join(", ")}`);
  for (const k of Object.keys(card._meta)) {
    if (!k.startsWith("io.github.wolfe-jam.mcp-context-card/")) throw new Error(`unexpected _meta key: ${k}`);
  }
  await client.close();
}

// ── 4. DISCOVERY — one call, then the same server over HTTP ───────────────
console.log(`\n${line}\n4. DISCOVERY — list_context_sources(), then the same server over HTTP\n${line}`);
{
  const client = await connect();
  const sources = JSON.parse(say(await client.callTool({ name: "list_context_sources", arguments: {} })));
  for (const c of ["context", "memory", "identity"] as const) {
    console.log(`· ${c.padEnd(9)} ${sources[c].source} (${sources[c].mediaType}) — present: ${sources[c].present}`);
  }
  await client.close();
}
{
  const { serve } = await import("@hono/node-server");
  const { httpApp } = await import("./src/transport/http.js");
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );
  const srv = serve({ fetch: httpApp(here).fetch, port: 0 });
  await new Promise((r) => setTimeout(r, 50));
  const { port } = srv.address() as { port: number };

  const httpClient = new Client({ name: "demo-host", version: "0.5.1" }, { capabilities: {} });
  await httpClient.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  const tools = (await httpClient.listTools()).tools.map((t) => t.name);
  console.log(`· POST http://127.0.0.1:${port}/mcp → ${tools.length} tools: ${tools.join(", ")}`);
  const cat = await (await fetch(`http://127.0.0.1:${port}/.well-known/ai-catalog.json`)).json();
  console.log(`· GET  /.well-known/ai-catalog.json → ${cat.entries.map((e: any) => e.type).join(" · ")}`);
  const card = await (await fetch(`http://127.0.0.1:${port}/card`)).text();
  console.log(`· GET  /card → ${card.length.toLocaleString()} bytes of self-contained HTML (the view for people)`);
  await httpClient.close();
  srv.close();
}

console.log(
  `\n${"═".repeat(68)}\n` +
    `The same three sources (AGENTS.md, project.fafm, .well-known/fafa) back\n` +
    `both discovery surfaces, over stdio and stateless HTTP alike. Every step\n` +
    `above ran for real — a spawned process, files on disk, an HTTP round-trip.\n${"═".repeat(68)}\n`,
);
