/**
 * catalog-gen — write `.well-known/ai-catalog.json` FROM the three sources
 * (`AGENTS.md`, `project.fafm`, `.well-known/fafa`) that also back the Server
 * Card `_meta` block. Same three artifacts, second exposure mechanism.
 *
 * Descriptions are derived from real file content (section count, fact count,
 * the agent's own description) — not hand-written blurbs that drift. The CI
 * job `catalog:check` regenerates this and fails on any diff.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseAgentsMd } from "./agents-md.js";
import { parseFafm } from "./faf/parse-fafm.js";
import { parseFafa } from "./faf/parse-fafa.js";
import { META_NS } from "./identity.js";

const iana = (t: string) => `https://www.iana.org/assignments/media-types/${t}`;

export function buildCatalog(root: string) {
  const agents = parseAgentsMd(join(root, "AGENTS.md"));
  const fafm = parseFafm(join(root, "project.fafm"));
  const fafa = parseFafa(join(root, ".well-known/fafa"));

  const host = fafa?.name ?? "mcp-trinity";

  return {
    specVersion: "1.0",
    host: {
      displayName: host,
      identifier: "https://github.com/Wolfe-Jam/mcp-trinity",
    },
    entries: [
      {
        identifier: `urn:air:${host}:context`,
        displayName: `${host} — project context (AGENTS.md)`,
        type: "text/markdown",
        mediaType: "text/markdown",
        description: agents
          ? (() => {
              const h = agents.sections.filter((s) => s.level > 1).map((s) => s.heading);
              return `Agent instructions for this project — ${h.length} section(s): ${h
                .slice(0, 6)
                .join(", ")}${h.length > 6 ? ", …" : ""}.`;
            })()
          : "Agent instructions for this project (AGENTS.md — not present).",
        url: "./AGENTS.md",
      },
      {
        identifier: `urn:air:${host}:memory`,
        displayName: `${host} — persistent memory (.fafm)`,
        type: "application/vnd.fafm+yaml",
        mediaType: "application/vnd.fafm+yaml",
        description: `Cross-session memory — ${fafm.facts.length} fact(s), profile "${
          fafm.profile ?? "?"
        }". Recall survives a process restart. No de-facto standard for this concern yet.`,
        url: "./project.fafm",
        _meta: { [`${META_NS}/iana`]: iana("application/vnd.fafm+yaml") },
      },
      {
        identifier: `urn:air:${host}:identity`,
        displayName: `${host} — agent identity (.fafa)`,
        type: "application/vnd.fafa+yaml",
        mediaType: "application/vnd.fafa+yaml",
        description:
          fafa?.description ??
          `Agent identity card (status: ${fafa?.status ?? "unknown"}).`,
        url: "./.well-known/fafa",
        _meta: { [`${META_NS}/iana`]: iana("application/vnd.fafa+yaml") },
      },
    ],
  };
}

// Direct run → write the file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  writeFileSync(
    join(root, ".well-known/ai-catalog.json"),
    JSON.stringify(buildCatalog(root), null, 2) + "\n",
  );
  console.log(
    "wrote .well-known/ai-catalog.json — 3 sibling entries, derived from AGENTS.md / project.fafm / .well-known/fafa",
  );
}
