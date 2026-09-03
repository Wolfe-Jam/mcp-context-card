/**
 * identity — reads this server's own `.well-known/fafa` and reports it,
 * and builds the Server Card `_meta` trinity block.
 *
 * The `_meta` block is three reverse-DNS-namespaced keys, one per format,
 * all pointing at the same three source files this repo ships. Same shape
 * already proven live at context.faf.one — and, unlike v0.1.0, it is now
 * actually emitted in the server's `initialize` response (see server.ts),
 * not just printed by the demo.
 */
import { join } from "node:path";
import { parseFafa } from "./faf/parse-fafa.js";
import type { AgentIdentity } from "./faf/types.js";

export function identity(root: string): AgentIdentity | null {
  return parseFafa(join(root, ".well-known/fafa"));
}

/** Human-readable one-liner for the `whoami` tool. */
export function whoami(root: string): string {
  const id = identity(root);
  if (!id) return "(no .well-known/fafa found)";
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
 * The Server Card `_meta` trinity block — three namespaced keys, one per
 * IANA-registered format. Paths are relative to the server package root.
 */
export function trinityMeta() {
  return {
    "one.faf/context": {
      faf: "./project.faf",
      mediaType: "application/vnd.faf+yaml",
      iana: "https://www.iana.org/assignments/media-types/application/vnd.faf+yaml",
    },
    "one.faf/memory": {
      fafm: "./project.fafm",
      mediaType: "application/vnd.fafm+yaml",
      iana: "https://www.iana.org/assignments/media-types/application/vnd.fafm+yaml",
    },
    "one.faf/agent": {
      fafa: "./.well-known/fafa",
      mediaType: "application/vnd.fafa+yaml",
      iana: "https://www.iana.org/assignments/media-types/application/vnd.fafa+yaml",
    },
  } as const;
}
