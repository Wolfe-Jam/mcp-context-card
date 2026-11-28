/**
 * catalog-gen — the AI Catalog (`application/ai-catalog+json`, v0.9) for
 * this server: its MCP Server Card, plus the sources that also back the Server
 * Card `_meta` block: `AGENTS.md` and `.fafa`, and `project.fafm` only when the
 * project opts in ({@link CatalogOptions.publishMemory}). Memory is written
 * during sessions, and SEP-2127 rules user- or session-specific data out of
 * public discovery documents, so it is left out by default.
 *
 * Identifiers follow `urn:air:{publisher}:{name}-{kind}`, with the
 * publisher domain and short name taken from the project's own `.fafa`
 * ({@link catalogPublisher}). Served over HTTP without a `.fafa` domain, the
 * request host is the publisher (whoever serves it controls that domain). The
 * committed static file with no domain uses plain `{name}:{kind}` ids:
 * the spec treats unknown schemes as opaque, and no domain is ever invented.
 *
 * Why `{name}-{kind}`: AI Catalog v0.9 reads `urn:air:{publisher}:{name}[:{kind}]`,
 * while earlier drafts read the same shape as `{namespace}:{name}`. One segment
 * after the publisher can't be read the wrong way round: v0.9 reads it as a name
 * with no kind. Catalogs this server wrote before 1.10.0
 * used `urn:air:{publisher}:{kind}:{name}`; {@link CatalogOptions.formerIds}
 * records that id on each entry (`<reverse-DNS publisher>.former-identifiers`).
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
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bodySections, parseAgentsMd } from "./agents-md.js";
import { parseFafm } from "./faf/parse-fafm.js";
import { parseFafa } from "./faf/parse-fafa.js";
import { META_NS, catalogPublisher, fafaFile } from "./identity.js";
import { SERVER_CARD_MEDIA_TYPE, SERVER_CARD_PATH } from "./constants.js";
import { serverCard } from "./server-card.js";

const iana = (t: string) => `https://www.iana.org/assignments/media-types/${t}`;

export interface CatalogOptions {
  /** Public origin the catalog is served from, e.g. `https://ctx.example.com`. */
  origin?: string;
  /** List the memory file (`project.fafm`). Default: off. */
  publishMemory?: boolean;
  /** Record each entry's earlier id (`urn:air:{publisher}:{kind}:{name}`, written before 1.10.0). Default: off. */
  formerIds?: boolean;
}

/** One AI Catalog entry, as this generator writes it. */
export interface CatalogEntry {
  identifier: string;
  type: string;
  displayName?: string;
  description?: string;
  url?: string;
  data?: ReturnType<typeof serverCard>;
  extensions?: Record<string, unknown>;
}

export function buildCatalog(root: string, opts: CatalogOptions = {}) {
  const agents = parseAgentsMd(join(root, "AGENTS.md"));
  const fafm = parseFafm(join(root, "project.fafm"));
  const file = fafaFile(root);
  const fafa = file ? parseFafa(file) : null;

  const { domain, handle } = catalogPublisher(root);
  // Served without a `.fafa` domain, the request host is the publisher (`localhost` included).
  // An IP literal can't sit in a urn:air id (`[::1]` carries colons), so it gives plain ids.
  const servedHost = opts.origin ? new URL(opts.origin).hostname.toLowerCase() : undefined;
  const publisher = domain ?? (servedHost && !isIP(servedHost.replace(/^\[|\]$/g, "")) ? servedHost : undefined);
  const id = (kind: string) =>
    publisher ? `urn:air:${publisher}:${handle}-${kind}` : `${handle}:${kind}`;
  // The earlier id, recorded on request for catalogs this server wrote before 1.10.0. The key is the
  // publisher's reverse-DNS (§ Extensions: Format and Key Naming), so only a dotted domain name
  // gets one: never `localhost` or an IP host from the request.
  const named = !!publisher && publisher.includes(".") && !isIP(publisher.replace(/^\[|\]$/g, ""));
  const formerKey = named ? `${publisher!.split(".").reverse().join(".")}.former-identifiers` : "";
  const former = (kind: string) =>
    opts.formerIds && named ? { [formerKey]: [`urn:air:${publisher}:${kind}:${handle}`] } : {};
  const withFormer = (kind: string, extensions: Record<string, unknown> = {}) => {
    const all = { ...extensions, ...former(kind) };
    return Object.keys(all).length ? { extensions: all } : {};
  };
  const at = (path: string) => (opts.origin ? `${opts.origin}/${path}` : `./${path}`);
  const ext = (type: string) => ({ extensions: { [META_NS]: { iana: iana(type) } } });

  const host = fafa?.displayName ?? fafa?.name ?? "mcp-context-card";

  return {
    specVersion: "0.9",
    // Host Info identifies the catalog's operator (§ Host Info), so its identifier is the publisher's
    // domain when there is one; it is optional, and left out otherwise.
    host: {
      displayName: host,
      ...(named ? { identifier: publisher } : {}),
    },
    entries: <CatalogEntry[]>[
      {
        // The card carries its own title, description and version, so the
        // entry repeats none of them (AI Catalog: avoid drift).
        identifier: id("mcp"),
        type: SERVER_CARD_MEDIA_TYPE,
        ...(opts.origin ? { url: `${opts.origin}${SERVER_CARD_PATH}` } : { data: serverCard() }),
        ...withFormer("mcp"),
      },
      // An entry only for a file this server actually serves, so every entry URL resolves.
      ...(agents ? [{
        identifier: id("context"),
        displayName: `${host} — project context (AGENTS.md)`,
        type: "text/markdown",
        description: (() => {
              const h = bodySections(agents!).map((s) => s.heading);
              return `Agent instructions for this project — ${h.length} section(s): ${h
                .slice(0, 6)
                .join(", ")}${h.length > 6 ? ", …" : ""}.`;
            })(),
        url: at("AGENTS.md"),
        ...withFormer("context"),
      }] : []),
      ...(opts.publishMemory ? [{
        identifier: id("memory"),
        displayName: `${host} — persistent memory (.fafm)`,
        type: "application/vnd.fafm+yaml",
        description: `Cross-session memory — ${fafm.facts.length} fact(s), profile "${
          fafm.profile ?? "?"
        }". Recall survives a process restart. No de-facto standard for this concern yet.`,
        url: at("project.fafm"),
        ...withFormer("memory", ext("application/vnd.fafm+yaml").extensions),
      }] : []),
      ...(file ? [{
        identifier: id("identity"),
        displayName: `${host} — agent identity (.fafa)`,
        type: "application/vnd.fafa+yaml",
        description:
          fafa?.description ??
          `Agent identity card (status: ${fafa?.status ?? "unknown"}).`,
        url: at(".well-known/fafa"),
        ...withFormer("identity", ext("application/vnd.fafa+yaml").extensions),
      }] : []),
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
    "wrote .well-known/ai-catalog.json — Server Card + AGENTS.md + .fafa entries (memory is opt-in, never in the static file)",
  );
}
