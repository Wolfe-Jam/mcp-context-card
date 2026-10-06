/**
 * conformance/discovery — a portable checker for MCP Server Card discovery
 * (SEP-2127, Final) and the AI Catalog (spec 1.0), run against any server URL.
 *
 * Self-contained on purpose: no imports from this package, only the global
 * `fetch`, so the file can be lifted into another tool as-is. Point it at a
 * server's Streamable HTTP endpoint and it returns one result per requirement,
 * each tagged MUST or SHOULD exactly as the spec words it. Requirements the
 * spec leaves at MAY (where the card lives, whether a catalog exists) are
 * never failures: a missing optional document turns its checks into skips.
 *
 * JSON Schema validation is optional: pass `validateCard` (for example Ajv
 * against the official v1 schema) and it runs as one more card check.
 */

export const SERVER_CARD_SCHEMA_URL =
  "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";
export const SERVER_CARD_TYPE = "application/mcp-server-card+json";
export const AI_CATALOG_TYPE = "application/ai-catalog+json";

const NAME_RE = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;
const EXT_KEY_RE = /^(https?:\/\/\S+|[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)$/;
const URN_RE = /^urn:air:[^:]+\.[^:]+:[^:]+:[^:]+$/i;
const SECRET_RE = /(api[_-]?key|secret|password|bearer\s|token["']?\s*:)/i;
const PRIVATE_HOST_RE =
  /\b(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/i;

export type Tier = "card" | "hosting" | "catalog";
export type Level = "must" | "should";
export type Status = "pass" | "fail" | "skip";

export interface CheckResult {
  id: string;
  tier: Tier;
  level: Level;
  title: string;
  status: Status;
  detail?: string;
}

export interface DiscoveryTarget {
  /** The server's Streamable HTTP endpoint, e.g. `https://ctx.example.com/mcp`. */
  mcpUrl: string;
  /** Where to read the card. Default: `<mcpUrl>/server-card`, then the catalog's card entry. */
  cardUrl?: string;
  /** Where to read the catalog. Default: `<origin>/.well-known/ai-catalog.json`. */
  catalogUrl?: string;
}

export interface DiscoveryOptions {
  fetch?: typeof fetch;
  /** Returns null when the card is valid, else a short error. */
  validateCard?: (card: unknown) => string | null;
  /** Per-request timeout in milliseconds (default 10000). */
  timeoutMs?: number;
}

export interface DiscoveryReport {
  mcpUrl: string;
  cardUrl: string | null;
  catalogUrl: string;
  results: CheckResult[];
  passed: number;
  failed: number;
  skipped: number;
  /** Failed MUST checks: zero means nothing the spec requires is broken. */
  mustFailures: number;
}

interface Fetched {
  status: number;
  headers: Headers;
  text: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isLoopback = (u: URL) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(u.hostname);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function checkDiscovery(
  target: DiscoveryTarget,
  opts: DiscoveryOptions = {},
): Promise<DiscoveryReport> {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const results: CheckResult[] = [];
  const add = (tier: Tier, level: Level, id: string, title: string, status: Status, detail?: string) =>
    results.push({ id, tier, level, title, status, ...(detail ? { detail } : {}) });
  const check = (tier: Tier, level: Level, id: string, title: string, ok: boolean, detail?: string) =>
    add(tier, level, id, title, ok ? "pass" : "fail", ok ? undefined : detail);

  const get = async (url: string, headers: Record<string, string> = {}, method = "GET"): Promise<Fetched | null> => {
    try {
      const r = await doFetch(url, { method, headers, signal: AbortSignal.timeout(timeoutMs) });
      return { status: r.status, headers: r.headers, text: method === "OPTIONS" ? "" : await r.text() };
    } catch {
      return null;
    }
  };

  const mcp = new URL(target.mcpUrl);
  const catalogUrl = target.catalogUrl ?? new URL("/.well-known/ai-catalog.json", mcp).href;

  // ── Catalog first: it may be where the card is found ──────────────────────
  const catRes = await get(catalogUrl, { Accept: AI_CATALOG_TYPE });
  const catalog = catRes && catRes.status === 200 ? parseJson(catRes.text) : undefined;
  const entries = isObject(catalog) && Array.isArray(catalog.entries) ? (catalog.entries as unknown[]) : [];
  const cardEntry = entries.find((e) => isObject(e) && e.type === SERVER_CARD_TYPE) as
    | Record<string, unknown>
    | undefined;

  // ── Find the card: explicit → <mcp>/server-card → catalog entry ──────────
  const candidates = [
    target.cardUrl,
    `${target.mcpUrl.replace(/\/+$/, "")}/server-card`,
    cardEntry && typeof cardEntry.url === "string" ? new URL(cardEntry.url, catalogUrl).href : undefined,
  ].filter((u): u is string => !!u);
  let cardUrl: string | null = null;
  let cardRes: Fetched | null = null;
  for (const u of [...new Set(candidates)]) {
    const r = await get(u, { Accept: SERVER_CARD_TYPE });
    if (r && r.status === 200) {
      cardUrl = u;
      cardRes = r;
      break;
    }
  }
  const inlineCard = !cardRes && cardEntry && isObject(cardEntry.data) ? cardEntry.data : undefined;

  // ── Tier: card ────────────────────────────────────────────────────────────
  const card = cardRes ? parseJson(cardRes.text) : inlineCard;
  if (card === undefined && !cardRes) {
    add("card", "should", "card.found", "A Server Card is published (hosted or in the catalog)", "fail",
      `none at ${candidates.join(", ")}`);
  } else {
    add("card", "should", "card.found", "A Server Card is published (hosted or in the catalog)", "pass");
    check("card", "must", "card.json", "The card is a JSON object", isObject(card), "body is not a JSON object");
    if (isObject(card)) {
      check("card", "must", "card.schema-url", "$schema is the v1 Server Card schema URL",
        card.$schema === SERVER_CARD_SCHEMA_URL, `got ${JSON.stringify(card.$schema)}`);
      check("card", "must", "card.name", "name is reverse-DNS with one slash",
        typeof card.name === "string" && NAME_RE.test(card.name) && card.name.length >= 3 && card.name.length <= 200,
        `got ${JSON.stringify(card.name)}`);
      check("card", "must", "card.version", "version is present",
        typeof card.version === "string" && card.version.length > 0 && card.version.length <= 255,
        `got ${JSON.stringify(card.version)}`);
      check("card", "must", "card.description", "description is 1–100 characters",
        typeof card.description === "string" && card.description.length >= 1 && card.description.length <= 100,
        typeof card.description === "string" ? `${card.description.length} characters` : "missing");
      if (opts.validateCard) {
        const err = opts.validateCard(card);
        check("card", "must", "card.schema-valid", "The card validates against the v1 JSON Schema", err === null, err ?? "");
      } else {
        add("card", "must", "card.schema-valid", "The card validates against the v1 JSON Schema", "skip",
          "no schema validator supplied");
      }
      const text = JSON.stringify(card);
      const leak = SECRET_RE.exec(text) ?? PRIVATE_HOST_RE.exec(text);
      check("card", "must", "card.no-secrets", "No credentials or private endpoints in the card",
        !leak || isLoopback(mcp), `found "${leak?.[0]}"`);
      const remotes = Array.isArray(card.remotes) ? (card.remotes as unknown[]) : [];
      if (remotes.length) {
        const urls = remotes.filter(isObject).map((r) => r.url);
        check("card", "should", "card.remote-matches", "The card's remotes include the endpoint it was found for",
          urls.includes(target.mcpUrl), `remotes: ${urls.join(", ")}`);
      } else {
        add("card", "should", "card.remote-matches", "The card's remotes include the endpoint it was found for",
          "skip", "the card declares no remotes");
      }
    }
  }

  // ── Tier: hosting (only for a hosted card) ───────────────────────────────
  const hostingTitles: [Level, string, string][] = [
    ["should", "hosting.content-type", `Served as ${SERVER_CARD_TYPE}`],
    ["must", "hosting.cors-origin", "CORS: Access-Control-Allow-Origin is *"],
    ["must", "hosting.cors-expose", "CORS: ETag is exposed"],
    ["must", "hosting.cors-preflight", "CORS preflight allows GET with Content-Type and If-None-Match"],
    ["should", "hosting.cache-control", "Cache-Control is public with a max-age"],
    ["should", "hosting.etag", "An ETag is returned and If-None-Match gets 304"],
    ["must", "hosting.https", "Served over HTTPS (HTTP only for local development)"],
  ];
  if (!cardRes || !cardUrl) {
    for (const [level, id, title] of hostingTitles) add("hosting", level, id, title, "skip", "no hosted card");
  } else {
    const h = cardRes.headers;
    const ct = h.get("content-type") ?? "";
    check("hosting", "should", "hosting.content-type", hostingTitles[0][2],
      ct.split(";")[0].trim().toLowerCase() === SERVER_CARD_TYPE, `got "${ct}"`);

    const withOrigin = await get(cardUrl, { Origin: "https://conformance.example" });
    const acao = withOrigin?.headers.get("access-control-allow-origin") ?? "";
    check("hosting", "must", "hosting.cors-origin", hostingTitles[1][2], acao === "*", `got "${acao}"`);
    const expose = withOrigin?.headers.get("access-control-expose-headers") ?? "";
    check("hosting", "must", "hosting.cors-expose", hostingTitles[2][2], /(^|,)\s*etag\s*(,|$)/i.test(expose),
      `got "${expose}"`);

    const pre = await get(cardUrl, {
      Origin: "https://conformance.example",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type, if-none-match",
    }, "OPTIONS");
    const methods = (pre?.headers.get("access-control-allow-methods") ?? "").toUpperCase();
    const allowed = (pre?.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    check("hosting", "must", "hosting.cors-preflight", hostingTitles[3][2],
      /(^|,)\s*GET\s*(,|$)/.test(methods) && allowed.includes("content-type") && allowed.includes("if-none-match"),
      `methods "${methods}", headers "${allowed}"`);

    const cc = (h.get("cache-control") ?? "").toLowerCase();
    check("hosting", "should", "hosting.cache-control", hostingTitles[4][2],
      /\bpublic\b/.test(cc) && /\bmax-age=\d+/.test(cc), `got "${cc}"`);

    const etag = h.get("etag");
    const again = etag ? await get(cardUrl, { "If-None-Match": etag }) : null;
    check("hosting", "should", "hosting.etag", hostingTitles[5][2], !!etag && again?.status === 304,
      etag ? `If-None-Match answered ${again?.status}` : "no ETag header");

    const u = new URL(cardUrl);
    if (u.protocol === "https:") add("hosting", "must", "hosting.https", hostingTitles[6][2], "pass");
    else if (isLoopback(u)) add("hosting", "must", "hosting.https", hostingTitles[6][2], "skip", "local development");
    else add("hosting", "must", "hosting.https", hostingTitles[6][2], "fail", `served from ${u.protocol}//${u.host}`);
  }

  // ── Tier: catalog (optional: absent → skipped) ───────────────────────────
  const catTitles: [Level, string, string][] = [
    ["should", "catalog.content-type", `Served as ${AI_CATALOG_TYPE}`],
    ["must", "catalog.spec-version", "specVersion is present"],
    ["must", "catalog.entries", "entries is an array"],
    ["must", "catalog.host", "host.displayName is present when host is"],
    ["must", "catalog.entry-fields", "Every entry has identifier and type"],
    ["must", "catalog.entry-one-of", "Every entry has exactly one of url or data"],
    ["should", "catalog.identifiers", "Identifiers use urn:air:{publisher-domain}:{namespace}:{name}"],
    ["should", "catalog.extensions", "Custom data sits in extensions under URL or reverse-DNS keys"],
    ["should", "catalog.card-entry", "The catalog lists the Server Card"],
    ["should", "catalog.card-entry-lean", "The card entry repeats no displayName, description or version"],
    ["should", "catalog.links", "Every entry URL resolves with the type its entry declares"],
  ];
  if (!catRes || catRes.status !== 200 || !isObject(catalog)) {
    const why = !catRes ? "unreachable" : catRes.status !== 200 ? `HTTP ${catRes.status}` : "not a JSON object";
    for (const [level, id, title] of catTitles) add("catalog", level, id, title, "skip", `no catalog (${why})`);
  } else {
    const t = (i: number) => catTitles[i];
    const ct = catRes.headers.get("content-type") ?? "";
    check("catalog", t(0)[0], t(0)[1], t(0)[2], ct.split(";")[0].trim().toLowerCase() === AI_CATALOG_TYPE, `got "${ct}"`);
    check("catalog", t(1)[0], t(1)[1], t(1)[2], typeof catalog.specVersion === "string", "missing");
    check("catalog", t(2)[0], t(2)[1], t(2)[2], Array.isArray(catalog.entries), "missing or not an array");
    check("catalog", t(3)[0], t(3)[1], t(3)[2],
      catalog.host === undefined || (isObject(catalog.host) && typeof catalog.host.displayName === "string"),
      "host without displayName");

    const objs = entries.filter(isObject);
    const bad = (pred: (e: Record<string, unknown>) => boolean) =>
      objs.filter((e) => !pred(e)).map((e) => String(e.identifier ?? "(no identifier)"));
    const noFields = bad((e) => typeof e.identifier === "string" && typeof e.type === "string");
    check("catalog", t(4)[0], t(4)[1], t(4)[2], noFields.length === 0 && objs.length === entries.length,
      noFields.join(", ") || "non-object entry");
    const notOne = bad((e) => (e.url !== undefined) !== (e.data !== undefined));
    check("catalog", t(5)[0], t(5)[1], t(5)[2], notOne.length === 0, notOne.join(", "));
    const notUrn = bad((e) => typeof e.identifier === "string" && URN_RE.test(e.identifier));
    check("catalog", t(6)[0], t(6)[1], t(6)[2], notUrn.length === 0, notUrn.join(", "));
    const badExt = objs.flatMap((e) =>
      isObject(e.extensions) ? Object.keys(e.extensions).filter((k) => !EXT_KEY_RE.test(k)) : [],
    );
    check("catalog", t(7)[0], t(7)[1], t(7)[2], badExt.length === 0, badExt.join(", "));

    check("catalog", t(8)[0], t(8)[1], t(8)[2], !!cardEntry, `no entry of type ${SERVER_CARD_TYPE}`);
    if (cardEntry) {
      const repeated = ["displayName", "description", "version"].filter((k) => cardEntry[k] !== undefined);
      check("catalog", t(9)[0], t(9)[1], t(9)[2], repeated.length === 0, repeated.join(", "));
    } else {
      add("catalog", t(9)[0], t(9)[1], t(9)[2], "skip", "no card entry");
    }

    const linked = objs.filter((e) => typeof e.url === "string");
    if (!linked.length) {
      add("catalog", t(10)[0], t(10)[1], t(10)[2], "skip", "no entry has a url");
    } else {
      const broken: string[] = [];
      for (const e of linked) {
        const u = new URL(e.url as string, catalogUrl).href;
        const r = await get(u, { Accept: String(e.type) });
        const rt = (r?.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!r || r.status !== 200) broken.push(`${u} → ${r ? `HTTP ${r.status}` : "unreachable"}`);
        else if (rt !== String(e.type).toLowerCase()) broken.push(`${u} → "${rt}"`);
      }
      check("catalog", t(10)[0], t(10)[1], t(10)[2], broken.length === 0, broken.join("; "));
    }
  }

  const count = (s: Status) => results.filter((r) => r.status === s).length;
  return {
    mcpUrl: target.mcpUrl,
    cardUrl,
    catalogUrl,
    results,
    passed: count("pass"),
    failed: count("fail"),
    skipped: count("skip"),
    mustFailures: results.filter((r) => r.status === "fail" && r.level === "must").length,
  };
}
