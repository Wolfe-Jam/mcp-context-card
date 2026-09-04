/**
 * identity — reads this server's own `.well-known/fafa` and reports it, and
 * builds the `_meta` context block for the Server Card.
 *
 * The `_meta` block is three reverse-DNS-namespaced keys — one per concern
 * (context, memory, identity) — each naming a source file, its media type,
 * and (where one exists) its IANA anchor. Same shape a real client reading
 * the Server Card would consume; see server.ts for where it's emitted.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFafa } from "./faf/parse-fafa.js";
import type { AgentIdentity } from "./faf/types.js";

/** The `_meta` key namespace — the publisher's, reverse-DNS. */
export const META_NS = "io.github.wolfe-jam.mcp-context-card";

const iana = (t: string) => `https://www.iana.org/assignments/media-types/${t}`;

export function identity(root: string): AgentIdentity | null {
  return parseFafa(join(root, ".well-known/fafa"));
}

/** Fall back to package.json — most projects have no .fafa, but they have this. */
function fromPackageJson(root: string): AgentIdentity | null {
  try {
    const p = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (!p.name) return null;
    return {
      name: String(p.name),
      agentVersion: p.version ? String(p.version) : undefined,
      license: p.license ? String(p.license) : undefined,
      description: p.description ? String(p.description) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * The identity to show: the `.well-known/fafa` card if present — richer and
 * portable — else a thin one from `package.json` (the common project has no
 * `.fafa`). null only when neither exists.
 */
export function resolveIdentity(root: string): AgentIdentity | null {
  return identity(root) ?? fromPackageJson(root);
}

/** Human-readable one-liner for the `whoami` tool. */
export function whoami(root: string): string {
  const id = resolveIdentity(root);
  if (!id) return "(no .well-known/fafa or package.json found)";
  const parts = [
    id.displayName ?? id.name ?? "(unnamed)",
    id.agentVersion ? `v${id.agentVersion}` : null,
    id.vendor ? `vendor: ${id.vendor}` : null,
    id.status ? `status: ${id.status}` : null,
    id.license ? id.license : null,
  ].filter(Boolean);
  return parts.join(" · ") + (id.description ? `\n${id.description}` : "");
}

/**
 * The `_meta` context block — one namespaced key per concern. The `context`
 * concern points at `AGENTS.md` (the de-facto standard, plain Markdown). The
 * other two point at their worked-example artifacts; `memory` carries a note
 * because there is no de-facto standard for it yet.
 */
export function trinityMeta() {
  return {
    [`${META_NS}/context`]: {
      source: "AGENTS.md",
      mediaType: "text/markdown",
    },
    [`${META_NS}/memory`]: {
      source: "project.fafm",
      mediaType: "application/vnd.fafm+yaml",
      iana: iana("application/vnd.fafm+yaml"),
      note: "no de-facto standard for agent memory yet — this is one instantiation",
    },
    [`${META_NS}/identity`]: {
      source: ".well-known/fafa",
      mediaType: "application/vnd.fafa+yaml",
      iana: iana("application/vnd.fafa+yaml"),
    },
  } as const;
}
