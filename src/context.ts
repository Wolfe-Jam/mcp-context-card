/**
 * context — the HOST-side mechanism, domain-agnostic.
 *
 * Wraps a normal MCP `Client.callTool`. Before dispatching, it checks the
 * target tool's OWN inputSchema (fetched via the OWN tools/list — no server
 * change needed) for parameter names the project context already knows the
 * answer to, and fills any that are missing from the call. If the tool
 * doesn't declare a matching field, or the caller already supplied it,
 * nothing changes — this never overrides an explicit argument.
 *
 * Same mechanism as mcp-project-context, generalized: instead of one
 * GitHub-specific field (repository → owner/repo), this fills whichever
 * flat scalar fields the project context exposes into any matching tool
 * schema property.
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseFaf } from "./faf/parse-faf.js";

export type ContextFields = Record<string, string>;

export interface FilledCall {
  result: unknown;
  /** Which schema properties were auto-filled from context. */
  filled: string[];
}

export async function callToolWithContext(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
  contextFields: ContextFields,
): Promise<FilledCall> {
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

/** Read a `.faf` and return its flat, tool-schema-keyed fields. */
export function contextFieldsFromProjectFaf(path: string): ContextFields {
  return parseFaf(path).fields;
}
