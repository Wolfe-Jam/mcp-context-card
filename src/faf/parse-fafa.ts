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
    id: str(agent.id),
    vendor: str(agent.vendor),
    agentVersion: str(agent.version),
    description: str(agent.description),
    status: str(agent.status),
    license: str(agent.license),
    ...extras(doc),
  };
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s.length ? s : undefined;
}

/** Where it runs, what it can do, and what installs it: `.fafa` fields outside `agent`. */
function extras(doc: Record<string, unknown>): Pick<AgentIdentity, "endpoints" | "skills" | "packages"> {
  const list = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
  const endpoints = list(doc.endpoints)
    .filter((e) => typeof e.protocol === "string" && e.protocol.trim())
    .map((e) => ({ protocol: String(e.protocol).trim().toLowerCase(), ...(typeof e.location === "string" ? { location: e.location } : {}) }));
  const skills = list(doc.capabilities)
    .filter((c) => typeof c.name === "string" && c.name.trim())
    .map((c) => ({ name: String(c.name), ...(typeof c.description === "string" ? { description: c.description } : {}) }));
  const meta = doc.metadata && typeof doc.metadata === "object" ? (doc.metadata as Record<string, unknown>) : {};
  const cards = meta.cards && typeof meta.cards === "object" ? (meta.cards as Record<string, unknown>) : {};
  const packages = list(cards.packages)
    .filter((p) => typeof p.registryType === "string" && typeof p.identifier === "string")
    .map((p) => ({ registryType: String(p.registryType), identifier: String(p.identifier) }));
  return {
    ...(endpoints.length ? { endpoints } : {}),
    ...(skills.length ? { skills } : {}),
    ...(packages.length ? { packages } : {}),
  };
}
