/**
 * demo — proves all three mechanisms, not just describes them.
 *
 *   1. CONTEXT  — a plain callTool() hits "project_name required"; the same
 *      call routed through the host-side fill gets it from project.faf.
 *   2. MEMORY   — remember() a fact, kill the server process entirely,
 *      spawn a fresh one, recall() the same fact. Only the file survives.
 *   3. IDENTITY — whoami() reads this server's own .fafa; the Server Card
 *      + its _meta trinity block is read back from the
 *      `mcp-trinity://server-card` resource (the http transport also serves
 *      it at /.well-known/mcp/server-card).
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
  // Spawn `node --import tsx src/server.ts` — cross-platform, no .bin shim.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", join(here, "src/server.ts")],
  });
  const client = new Client({ name: "demo-host", version: "0.2.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

console.log(`\n🔺 mcp-trinity — context, memory & agent identity, proven, not described\n`);

// ── 1. CONTEXT ───────────────────────────────────────────────────────────
console.log(`${line}\n1. CONTEXT — BEFORE (plain callTool, no .faf awareness)\n${line}`);
{
  const client = await connect();
  const res = (await client.callTool({ name: "describe_project", arguments: {} })) as any;
  console.log(res.content.map((c: any) => c.text).join("\n"));
  await client.close();
}
console.log(`\n${line}\n1. CONTEXT — AFTER (host fills project_name from project.faf)\n${line}`);
{
  const client = await connect();
  const fields = contextFieldsFromProjectFaf(join(here, "project.faf"));
  const { result, filled } = await callToolWithContext(client, "describe_project", {}, fields);
  console.log(`· auto-filled from project.faf: ${filled.join(", ") || "(none)"}`);
  console.log((result as any).content.map((c: any) => c.text).join("\n"));
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
  const res = (await client.callTool({ name: "recall", arguments: { id: factId } })) as any;
  const got = res.content.map((c: any) => c.text).join("");
  console.log(`· recalled on server process #2: "${got}"`);
  if (got !== factText) throw new Error("memory did not survive the process boundary");
  await client.close();
}
console.log(`· project.fafm restored on exit — the demo leaves no trace`);

// ── 3. IDENTITY + _meta ──────────────────────────────────────────────────
console.log(`\n${line}\n3. IDENTITY — whoami() + Server Card _meta (read back, not printed)\n${line}`);
{
  const client = await connect();
  const who = (await client.callTool({ name: "whoami", arguments: {} })) as any;
  console.log(who.content.map((c: any) => c.text).join("\n"));

  const card = (await client.readResource({ uri: "mcp-trinity://server-card" })) as any;
  const parsed = JSON.parse(card.contents[0].text);
  console.log(`\n· mcp-trinity://server-card resource → _meta keys: ${Object.keys(parsed._meta).join(", ")}`);
  for (const k of ["one.faf/context", "one.faf/memory", "one.faf/agent"]) {
    if (!parsed._meta[k]) throw new Error(`server-card _meta missing ${k}`);
  }
  await client.close();
}

console.log(
  `\n${"═".repeat(68)}\n` +
    `Same three files (project.faf, project.fafm, .well-known/fafa) drive\n` +
    `both exposure mechanisms. Memory genuinely crossed a process boundary,\n` +
    `and the _meta block was read back from a live client — nothing here is\n` +
    `decorative.\n${"═".repeat(68)}\n`,
);
