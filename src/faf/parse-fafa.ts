/**
 * parse-fafa — read a `.fafa` agent identity card into a typed shape.
 * `application/vnd.fafa+yaml` — yaml, parsed as yaml.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { AgentIdentity } from "./types.js";

export function parseFafa(path: string): AgentIdentity | null {
  let doc: any;
  try {
    doc = parse(readFileSync(path, "utf8")) ?? {};
  } catch {
    return null;
  }

  const agent = doc.agent ?? {};
  return {
    version: str(doc.version),
    name: str(agent.name),
    displayName: str(agent.displayName),
    vendor: str(agent.vendor),
    agentVersion: str(agent.version),
    description: str(agent.description),
    status: str(agent.status),
    license: str(agent.license),
  };
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s.length ? s : undefined;
}
