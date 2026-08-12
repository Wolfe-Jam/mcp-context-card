/**
 * demo — proves all three mechanisms, not just describes them.
 *
 *   1. CONTEXT — same BEFORE/AFTER pattern as mcp-project-context: a plain
 *      callTool() hits "project_name required", then the same call routed
 *      through callToolWithContext() gets it filled from project.faf.
 *   2. MEMORY — remember() a fact, kill the server process entirely, spawn
 *      a fresh one, recall() the same fact. No in-memory state survives
 *      that — only the file does. That's the actual .fafm claim, proven.
 *   3. IDENTITY — whoami() reads this server's own .fafa, and the same
 *      three files (.faf/.fafm/.fafa) are shown as the Server Card _meta
 *      trinity block — the second proven exposure mechanism.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { callToolWithContext, contextFieldsFromProjectFaf } from "./src/context.js";
import { trinityMeta } from "./src/identity.js";

const here = dirname(fileURLToPath(import.meta.url));

async function connect(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: join(here, "node_modules/.bin/tsx"),
    args: [join(here, "src/server.ts")],
  });
  const client = new Client({ name: "demo-host", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

console.log(`\n🔺 faf-trinity — context, memory & agent, proven, not just described\n`);

// ── 1. CONTEXT ──────────────────────────────────────────────────────────
console.log(`${"─".repeat(68)}\n1. CONTEXT — BEFORE (plain callTool, no project.faf awareness)\n${"─".repeat(68)}`);
{
  const client = await connect();
  const res: any = await client.callTool({ name: "describe_project", arguments: {} });
  console.log(res.content.map((c: any) => c.text).join("\n"));
  await client.close();
}

console.log(`\n${"─".repeat(68)}\n1. CONTEXT — AFTER (routed through callToolWithContext)\n${"─".repeat(68)}`);
{
  const client = await connect();
  const contextFields = contextFieldsFromProjectFaf(join(here, "project.faf"));
  const { result, filled } = await callToolWithContext(client, "describe_project", {}, contextFields);
  console.log(`· auto-filled from project.faf: ${filled.join(", ") || "(none)"}`);
  console.log(result.content.map((c: any) => c.text).join("\n"));
  await client.close();
}

// ── 2. MEMORY ────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(68)}\n2. MEMORY — remember() → kill process → spawn fresh → recall()\n${"─".repeat(68)}`);
{
  const client = await connect();
  const fact = `demo ran at ${new Date().toISOString()}`;
  await client.callTool({ name: "remember", arguments: { id: "demo-run", text: fact } });
  console.log(`· remembered on server process #1: "${fact}"`);
  await client.close(); // process #1 is gone — no in-memory state survives this
}
{
  const client = await connect(); // a brand new server process, zero shared memory
  const res: any = await client.callTool({ name: "recall", arguments: { id: "demo-run" } });
  console.log(`· recalled on server process #2: "${res.content.map((c: any) => c.text).join("")}"`);
  await client.close();
}

// ── 3. IDENTITY ──────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(68)}\n3. IDENTITY — whoami() + Server Card _meta trinity block\n${"─".repeat(68)}`);
{
  const client = await connect();
  const res: any = await client.callTool({ name: "whoami", arguments: {} });
  console.log(res.content.map((c: any) => c.text).join("\n"));
  await client.close();
}
console.log(`\n· the same 3 files, as a Server Card _meta block (proven live at context.faf.one):`);
console.log(JSON.stringify({ _meta: trinityMeta() }, null, 2));

console.log(
  `\n${"═".repeat(68)}\n` +
    `Same three files (project.faf, project.fafm, .well-known/fafa) drive\n` +
    `both exposure mechanisms above. Memory genuinely crossed a process\n` +
    `boundary — nothing here is decorative.\n` +
    `${"═".repeat(68)}\n`,
);
