/**
 * catalog-gen — the AI Catalog (`application/ai-catalog+json`, spec 1.0) for
 * this server: its MCP Server Card, plus the three sources (`AGENTS.md`,
 * `project.fafm`, `.fafa`) that also back the Server Card `_meta` block.
 *
 * Identifiers follow `urn:air:{publisher}:{namespace}:{name}`, with the
 * publisher domain and short name taken from the project's own `.fafa`
 * ({@link catalogPublisher}). Served over HTTP without a `.fafa` domain, the
 * request host is the publisher (whoever serves it controls that domain). The
 * committed static file with no domain uses plain `{name}:{namespace}` ids:
 * the spec treats unknown schemes as opaque, and no domain is ever invented.
 *
 * Served (an origin is known): entries point at absolute URLs and the card
 * entry links `<origin>/mcp/server-card`. Static: relative URLs and the card
 * inline as `data` (no remotes, since no origin is known).
 *
 * Descriptions are derived from real file content (section count, fact count,
 * the agent's own description), not hand-written blurbs that drift. The CI
 * job `catalog:check` regenerates the static file and fails on any diff.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseAgentsMd } from "./agents-md.js";
import { parseFafm } from "./faf/parse-fafm.js";
import { parseFafa } from "./faf/parse-fafa.js";
import { META_NS, catalogPublisher, fafaFile } from "./identity.js";
import { SERVER_CARD_MEDIA_TYPE, SERVER_CARD_PATH } from "./constants.js";
import { serverCard } from "./server-card.js";

const iana = (t: string) => `https://www.iana.org/assignments/media-types/${t}`;

export interface CatalogOptions {
  /** Public origin the catalog is served from, e.g. `https://ctx.example.com`. */
  origin?: string;
}

export function buildCatalog(root: string, opts: CatalogOptions = {}) {
  const agents = parseAgentsMd(join(root, "AGENTS.md"));
  const fafm = parseFafm(join(root, "project.fafm"));
  const file = fafaFile(root);
  const fafa = file ? parseFafa(file) : null;

  const { domain, handle } = catalogPublisher(root);
  const publisher = domain ?? (opts.origin ? new URL(opts.origin).hostname.toLowerCase() : undefined);
  const id = (namespace: string) =>
    publisher ? `urn:air:${publisher}:${namespace}:${handle}` : `${handle}:${namespace}`;
  const at = (path: string) => (opts.origin ? `${opts.origin}/${path}` : `./${path}`);
  const ext = (type: string) => ({ extensions: { [META_NS]: { iana: iana(type) } } });

  const host = fafa?.displayName ?? fafa?.name ?? "mcp-context-card";

  return {
    specVersion: "1.0",
    host: {
      displayName: host,
      identifier: "https://github.com/Wolfe-Jam/mcp-context-card",
    },
    entries: [
      {
        // The card carries its own title, description and version, so the
        // entry repeats none of them (AI Catalog: avoid drift).
        identifier: id("mcp"),
        type: SERVER_CARD_MEDIA_TYPE,
        ...(opts.origin ? { url: `${opts.origin}${SERVER_CARD_PATH}` } : { data: serverCard() }),
      },
      {
        identifier: id("context"),
        displayName: `${host} — project context (AGENTS.md)`,
        type: "text/markdown",
        description: agents
          ? (() => {
              const h = agents.sections.filter((s) => s.level > 1).map((s) => s.heading);
              return `Agent instructions for this project — ${h.length} section(s): ${h
                .slice(0, 6)
                .join(", ")}${h.length > 6 ? ", …" : ""}.`;
            })()
          : "Agent instructions for this project (AGENTS.md — not present).",
        url: at("AGENTS.md"),
      },
      {
        identifier: id("memory"),
        displayName: `${host} — persistent memory (.fafm)`,
        type: "application/vnd.fafm+yaml",
        description: `Cross-session memory — ${fafm.facts.length} fact(s), profile "${
          fafm.profile ?? "?"
        }". Recall survives a process restart. No de-facto standard for this concern yet.`,
        url: at("project.fafm"),
        ...ext("application/vnd.fafm+yaml"),
      },
      {
        identifier: id("identity"),
        displayName: `${host} — agent identity (.fafa)`,
        type: "application/vnd.fafa+yaml",
        description:
          fafa?.description ??
          `Agent identity card (status: ${fafa?.status ?? "unknown"}).`,
        url: at(".well-known/fafa"),
        ...ext("application/vnd.fafa+yaml"),
      },
    ],
  };
}

// Direct run → write the static file (no origin: relative URLs, card inline).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  writeFileSync(
    join(root, ".well-known/ai-catalog.json"),
    JSON.stringify(buildCatalog(root), null, 2) + "\n",
  );
  console.log(
    "wrote .well-known/ai-catalog.json — Server Card + 3 sibling entries, derived from AGENTS.md / project.fafm / .fafa",
  );
}
