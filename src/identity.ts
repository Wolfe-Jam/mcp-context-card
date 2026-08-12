/**
 * identity — reads this server's own .well-known/fafa and reports it.
 *
 * Also builds the Server Card `_meta` trinity block: three namespaced
 * keys, one per format, all pointing at the same three source files this
 * repo already ships. Same shape already proven live at context.faf.one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function whoami(root: string): string {
  try {
    return readFileSync(join(root, ".well-known/fafa"), "utf8");
  } catch {
    return "(no .well-known/fafa found)";
  }
}

export function trinityMeta() {
  return {
    "one.faf/context": { faf: "./project.faf", mediaType: "application/vnd.faf+yaml" },
    "one.faf/memory": { fafm: "./project.fafm", mediaType: "application/vnd.fafm+yaml" },
    "one.faf/agent": { fafa: "./.well-known/fafa", mediaType: "application/vnd.fafa+yaml" },
  };
}
