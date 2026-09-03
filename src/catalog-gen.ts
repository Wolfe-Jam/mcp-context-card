/**
 * catalog-gen — generate `.well-known/ai-catalog.json` FROM the three
 * source files (`project.faf`, `project.fafm`, `.well-known/fafa`) that
 * also back the Server Card `_meta` block. Same three artifacts, second
 * exposure mechanism — the shape live at faf.one/.well-known/ai-catalog.json.
 *
 * v0.1.0 wrote a hardcoded object. This reads the files and derives the
 * entry displayNames / descriptions from real content.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFaf } from "./faf/parse-faf.js";
import { parseFafm } from "./faf/parse-fafm.js";
import { parseFafa } from "./faf/parse-fafa.js";

const IANA = (t: string) => `https://www.iana.org/assignments/media-types/${t}`;

export function buildCatalog(root: string) {
  const faf = parseFaf(join(root, "project.faf"));
  const fafm = parseFafm(join(root, "project.fafm"));
  const fafa = parseFafa(join(root, ".well-known/fafa"));

  const host = faf.name ?? "mcp-trinity";
  const authoredWs =
    (["who", "what", "why", "where", "when", "how"] as const).filter((w) => faf[w]).length;

  return {
    specVersion: "1.0",
    host: {
      displayName: host,
      identifier: "https://github.com/Wolfe-Jam/mcp-trinity",
    },
    entries: [
      {
        identifier: `urn:air:${host}:context`,
        displayName: `${host} — project context (.faf)`,
        type: "application/vnd.faf+yaml",
        mediaType: "application/vnd.faf+yaml",
        description:
          faf.goal ??
          `IANA-registered project context. ${authoredWs}/6 human-context fields authored.`,
        url: "./project.faf",
        _meta: { "one.faf/iana": IANA("application/vnd.faf+yaml") },
      },
      {
        identifier: `urn:air:${host}:memory`,
        displayName: `${host} — persistent memory (.fafm)`,
        type: "application/vnd.fafm+yaml",
        mediaType: "application/vnd.fafm+yaml",
        description: `IANA-registered memory — ${fafm.facts.length} fact(s), profile "${
          fafm.profile ?? "?"
        }". Recall survives a process restart.`,
        url: "./project.fafm",
        _meta: { "one.faf/iana": IANA("application/vnd.fafm+yaml") },
      },
      {
        identifier: `urn:air:${host}:agent`,
        displayName: `${host} — agent identity (.fafa)`,
        type: "application/vnd.fafa+yaml",
        mediaType: "application/vnd.fafa+yaml",
        description:
          fafa?.description ??
          `IANA-registered agent identity card (status: ${fafa?.status ?? "unknown"}).`,
        url: "./.well-known/fafa",
        _meta: { "one.faf/iana": IANA("application/vnd.fafa+yaml") },
      },
    ],
  };
}

// Direct run → write the file.
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const catalog = buildCatalog(root);
  writeFileSync(
    join(root, ".well-known/ai-catalog.json"),
    JSON.stringify(catalog, null, 2) + "\n",
  );
  console.log(
    `wrote .well-known/ai-catalog.json — 3 sibling entries, derived from project.faf / project.fafm / .well-known/fafa`,
  );
}
