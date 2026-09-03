/**
 * demo — every tool, run live, over both transports. Not a description.
 *
 *   1. CONTEXT   — list the AGENTS.md sections, then pull just one.
 *   2. MEMORY    — remember() a fact, kill the server process, spawn a fresh
 *      one, recall() the same fact. Only the file survives that.
 *   3. IDENTITY  — whoami(), and the Server Card _meta block read back from
 *      the `mcp-context-card://server-card` resource.
 *   4. DISCOVERY — list_context_sources(), then the same server over
 *      stateless Streamable HTTP with its .well-known routes.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { callToolWithContext, contextFieldsFromProjectFaf } from "./src/context.js";

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
  const client = new Client({ name: "demo-host", version: "0.2.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

const say = (r: any) => r.content.map((c: any) => c.text).join("\n");

console.log(`\n🔺 mcp-context-card — context, memory & identity, discoverable, proven live\n`);

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
console.log(`\n${line}\n2. MEMORY — remember() → kill process → spawn fresh → recall()\n${line}`);
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

  const httpClient = new Client({ name: "demo-host", version: "0.2.0" }, { capabilities: {} });
  await httpClient.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  const tools = (await httpClient.listTools()).tools.map((t) => t.name);
  console.log(`· POST http://127.0.0.1:${port}/mcp → ${tools.length} tools: ${tools.join(", ")}`);
  const cat = await (await fetch(`http://127.0.0.1:${port}/.well-known/ai-catalog.json`)).json();
  console.log(`· GET  /.well-known/ai-catalog.json → ${cat.entries.map((e: any) => e.type).join(" · ")}`);
  await httpClient.close();
  srv.close();
}

// ── 5. PARAM-FILL — the host side: spend project context on another server ─
console.log(`\n${line}\n5. PARAM-FILL — a host fills a 3rd-party tool's params from project.faf\n${line}`);
{
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
    "@modelcontextprotocol/sdk/types.js"
  );

  // a throwaway server whose `deploy` tool needs facts the host already has
  const deployer = new Server({ name: "deployer", version: "0" }, { capabilities: { tools: {} } });
  deployer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "deploy",
        description: "deploy the project",
        inputSchema: {
          type: "object",
          properties: {
            project_name: { type: "string" },
            main_language: { type: "string" },
            target: { type: "string" },
          },
          required: ["project_name", "main_language", "target"],
        },
      },
    ],
  }));
  deployer.setRequestHandler(CallToolRequestSchema, async (req) => ({
    content: [{ type: "text", text: `deploy(${JSON.stringify(req.params.arguments)})` }],
  }));

  const [a, b] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: "demo-host", version: "0.2.0" }, { capabilities: {} });
  await Promise.all([deployer.connect(b), host.connect(a)]);

  // the model produced only `target`; the host wraps callTool and fills the
  // required params it already knows, from project.faf — no server change,
  // no re-prompt. This is `mcp-project-context`, generalized.
  const fields = contextFieldsFromProjectFaf(join(here, "project.faf"));
  const { result, filled } = await callToolWithContext(host, "deploy", { target: "staging" }, fields);
  console.log(`· model supplied:         { target: "staging" }`);
  console.log(`· host filled from .faf:  ${filled.join(", ")}`);
  console.log(`· ${say(result)}`);
  await host.close();
}

console.log(
  `\n${"═".repeat(68)}\n` +
    `Same three sources (AGENTS.md, project.fafm, .well-known/fafa) drive\n` +
    `both exposure mechanisms, over stdio and stateless HTTP alike. Memory\n` +
    `crossed a real process boundary; the _meta block was read back from a\n` +
    `live client; the host filled another server's params from project.faf.\n` +
    `Nothing here is decorative.\n${"═".repeat(68)}\n`,
);
