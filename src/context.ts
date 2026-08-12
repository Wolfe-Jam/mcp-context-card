/**
 * context — the HOST-side mechanism, domain-agnostic.
 *
 * Wraps a normal MCP `Client.callTool`. Before dispatching, it checks the
 * target tool's OWN inputSchema (fetched via the OWN tools/list — no server
 * change needed) for parameter names project.faf already knows the answer
 * to, and fills any that are missing from the call. If the tool doesn't
 * declare a matching field, or the caller already supplied it, nothing
 * changes — this never overrides an explicit argument.
 *
 * Same mechanism as mcp-project-context, generalized: instead of one
 * GitHub-specific field (repository → owner/repo), this reads whichever
 * flat scalar fields exist in project.faf and fills any tool schema
 * property with a matching name.
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readFileSync } from "node:fs";

export type ContextFields = Record<string, string>;

export async function callToolWithContext(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
  contextFields: ContextFields,
): Promise<{ result: any; filled: string[] }> {
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === toolName);
  const schemaProps = ((tool?.inputSchema as any)?.properties ?? {}) as Record<string, unknown>;

  const merged: Record<string, unknown> = { ...args };
  const filled: string[] = [];

  for (const key of Object.keys(schemaProps)) {
    if (merged[key] === undefined && contextFields[key] !== undefined) {
      merged[key] = contextFields[key];
      filled.push(key);
    }
  }

  const result = await client.callTool({ name: toolName, arguments: merged });
  return { result, filled };
}

/** Reads project.faf's `project:` block and flattens it into fillable fields. */
export function contextFieldsFromProjectFaf(path: string): ContextFields {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  const fields: ContextFields = {};
  const name = raw.match(/^\s{2}name:\s*(.+)$/m);
  const goal = raw.match(/^\s{2}goal:\s*(.+)$/m);
  const language = raw.match(/^\s{2}main_language:\s*(.+)$/m);

  if (name) fields.project_name = name[1].trim();
  if (goal) fields.project_goal = goal[1].trim();
  if (language) fields.main_language = language[1].trim();

  return fields;
}
