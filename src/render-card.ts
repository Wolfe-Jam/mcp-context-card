/**
 * render-card - the project's context card as one self-contained HTML page.
 *
 * Everything an MCP client discovers about a project - its AGENTS.md, its
 * memory, its identity - rendered as a card a person can read, screenshot,
 * or drop into a PR. Same three sources as the Server Card _meta block and
 * ai-catalog; this is the view for people.
 *
 * Self-contained: inline CSS, no external fonts or resources. The only script
 * is the expand-all / print helper (TOGGLE_SCRIPT) — a progressive enhancement;
 * every section still opens on its own without it. Renders anywhere.
 */
import { basename, join, resolve } from "node:path";
import { parseAgentsMd } from "./agents-md.js";
import { parseFafm } from "./memory.js";
import { resolveIdentity, serverCardMeta, META_NS } from "./identity.js";
import type { AgentIdentity } from "./faf/types.js";
import { PUBLISH_MEMORY_ENV, SERVER_CARD_URI } from "./constants.js";
import { escapeHtml, renderInline, renderMarkdown, slug } from "./md.js";
import { renderBusinessCard, type BusinessCard, type RenderOptions, type Theme } from "agent-business-card";

// The renderer lives in agent-business-card; these readers build the card from a project's files.
export { cardInitials, renderBusinessCard, safeAccent } from "agent-business-card";
export type { BusinessCard, RenderOptions, Theme } from "agent-business-card";

export interface CardOptions {
  theme?: Theme;
  /**
   * CSS hex colour for the accent. Validated; invalid is ignored. Wins over the
   * owner's colour; with neither, the card is drawn in ink (black or white).
   */
  accent?: string;
  /**
   * Render every AGENTS.md section open. Default: sections collapse to their
   * headings (`<details>`), click one to read it — the card scans in one screen.
   * `expanded` is the whole-page render, for a screenshot or a PR.
   */
  expanded?: boolean;
  /**
   * `private` shows how many facts memory holds but not the facts: for a card
   * served beyond this machine without the publish opt-in. Default: `full`.
   */
  memory?: "full" | "private";
  /** Business-card view. Default `landscape`; the reader can switch it too. */
  layout?: "landscape" | "portrait";
}

/** AAIF brand orange (aaif.io): this project's own card colour, declared in its `.fafa`. */
export const AAIF_ACCENT = "#FF702D";

/** What the front calls this thing, from where it runs: "MCP server", "A2A agent", or both. */
export function cardKind(id: AgentIdentity | null): string[] {
  const kinds: string[] = [];
  const protocols = new Set((id?.endpoints ?? []).map((e) => e.protocol));
  if (protocols.has("a2a")) kinds.push("A2A agent");
  if (protocols.has("mcp") || (id?.packages ?? []).length) kinds.push("MCP server");
  return kinds;
}

/** The front's title line: what it is, then its version. Empty when nothing is known. */
export function cardTitle(id: AgentIdentity | null): string {
  return [cardKind(id).join(" · "), id?.agentVersion ? `v${id.agentVersion}` : ""].filter(Boolean).join(" · ");
}

/** The front's one-liner: the first sentence of the description. */
export function cardOneLiner(id: AgentIdentity | null, max = 140): string {
  const d = id?.description;
  if (!d) return "";
  const first = clip(d, max);
  if (!first.endsWith("…")) return first;
  // A long first sentence: stop at its first natural pause (— ; :) when that
  // still says something, rather than cutting a phrase in half.
  const pause = /\s[—–]\s|;\s|:\s/.exec(d);
  return pause && pause.index >= 40 && pause.index <= max ? d.slice(0, pause.index).trim() : first;
}

/** The project's card: read its files, then draw. */
export function renderCard(root: string, opts: CardOptions = {}): string {
  return renderBusinessCard(readCard(root, opts), opts);
}

/** The (i) panel for an agent or server card. */
const AGENT_ABOUT = `<p class="whatis-head">Business Cards for Agents</p>
            <p>This is the public card of an AI agent or MCP server: who it is, what it does, where to reach it. Flip it for the detail.</p>
            <p>People read it here. Machines read the same facts from its MCP Server Card and AI Catalog, before they ever connect.</p>
            <p class="whatis-foot">Made with <code>mcp-context-card</code></p>`;

/** Read a project's AGENTS.md, memory and identity into a business card. */
export function readCard(root: string, opts: Pick<CardOptions, "expanded" | "memory"> = {}): BusinessCard {
  const flat = !!opts.expanded;

  const agents = parseAgentsMd(join(root, "AGENTS.md"));
  const mem = parseFafm(join(root, "project.fafm"));
  const id = resolveIdentity(root);
  const meta = serverCardMeta() as Record<string, { source: string; mediaType: string; note?: string }>;

  const name = id?.displayName ?? id?.name ?? basename(resolve(root));
  const title = cardTitle(id);
  const oneLiner = cardOneLiner(id);
  const domain = /^urn:air:([^:]+):/i.exec(id?.id ?? "")?.[1];

  // The version rides in the title line, so the front's chips skip it.
  const chips = [
    id?.vendor && id.vendor !== id.status ? { text: id.vendor } : null,
    !title && id?.agentVersion ? { text: `v${id.agentVersion}` } : null,
    id?.status ? { text: id.status, accent: true } : null,
    id?.license ? { text: id.license } : null,
  ].filter((c): c is { text: string; accent?: boolean } => !!c);

  // CONTEXT — one <details> per AGENTS.md section, collapsed by default;
  // `expanded` renders them all open. The "# AGENTS.md" top-level heading is
  // dropped; its intro rides above the sections.
  const bodySections = agents?.sections.filter((s) => s.level > 1) ?? [];
  const toc = bodySections.length
    ? `<ul class="toc">${bodySections
        .map((s) => `<li><a href="#${slug(s.heading)}">${escapeHtml(s.heading)}</a></li>`)
        .join("")}</ul>`
    : "";
  const preamble = [agents?.preamble, agents?.sections.find((s) => s.level === 1)?.body ?? ""]
    .filter(Boolean)
    .join("\n\n");
  const openAttr = flat ? " open" : "";
  const sections = bodySections
    .map(
      (s) =>
        `<details class="ctx-section"${openAttr} id="${slug(s.heading)}"><summary>${escapeHtml(
          s.heading,
        )}</summary><div class="md">${renderMarkdown(s.body)}</div></details>`,
    )
    .join("");
  const contextBody = agents
    ? `<div class="ctx-nav">${toc}${
        bodySections.length
          ? `<button type="button" class="xall" hidden>${flat ? "Collapse all" : "Expand all"}</button>`
          : ""
      }</div>
    ${preamble ? `<div class="ctx-preamble md">${renderMarkdown(preamble)}</div>` : ""}
    <div class="ctx-body">${sections}</div>`
    : `<p class="none">No AGENTS.md yet. Ask your agent to draft one: <code>author_agents_md</code> builds it from this repo's real build and test commands, nothing invented.</p>`;

  // MEMORY
  const memLabel = `${mem.facts.length} fact${mem.facts.length === 1 ? "" : "s"}${
    opts.memory === "private" && mem.facts.length ? ", kept private" : ""
  }`;
  const memoryBody = opts.memory === "private" && mem.facts.length
    ? `<p class="none">Kept private on this page. To show the facts, set <code>${PUBLISH_MEMORY_ENV}=1</code>.</p>`
    : mem.facts.length
    ? mem.facts
        .map((f) => {
          const verified = f.verification_status === "verified";
          const tags = (f.tags ?? [])
            .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
            .join("");
          return `<div class="fact"><p>${renderInline(f.text)}</p><div class="meta">${tags}<span class="dot${
            verified ? "" : " pending"
          }" title="${verified ? "verified" : f.verification_status ?? "unverified"}"></span></div></div>`;
        })
        .join("")
    : `<p class="none">No facts yet. Ask your agent to remember something, and it lands here.</p>`;

  // ABOUT — the identity, in full
  const aboutRows = [
    id?.id && ["Agent ID", `<code>${escapeHtml(id.id)}</code>`],
    id?.vendor && ["Publisher", escapeHtml(id.vendor)],
    id?.agentVersion && ["Version", `v${escapeHtml(id.agentVersion)}`],
    id?.status && ["Status", escapeHtml(id.status)],
    id?.license && ["License", escapeHtml(id.license)],
    ...(id?.endpoints ?? []).map((e) => [
      e.protocol === "a2a" ? "A2A endpoint" : e.protocol === "mcp" ? "MCP endpoint" : escapeHtml(e.protocol),
      e.location ? `<code>${escapeHtml(e.location)}</code>` : "—",
    ]),
    ...(id?.packages ?? []).map((pk) => [`Package (${escapeHtml(pk.registryType)})`, `<code>${escapeHtml(pk.identifier)}</code>`]),
  ].filter(Boolean) as string[][];
  const aboutBody = `${id?.description ? `<p class="lead">${escapeHtml(id.description)}</p>` : `<p class="none">No description yet. <code>npx faf-cli card init</code> writes one into the project's <code>.fafa</code>.</p>`}${
    aboutRows.length
      ? `<table class="kv"><tbody>${aboutRows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</tbody></table>`
      : ""
  }`;

  // SKILLS — only when the .fafa lists capabilities
  const skills = id?.skills ?? [];
  const skillsBody = skills
    .map((sk) => `<div class="fact"><p><b>${escapeHtml(sk.name)}</b>${sk.description ? ` — ${escapeHtml(sk.description)}` : ""}</p></div>`)
    .join("");

  // DISCOVERY
  const rows = Object.entries(meta)
    .map(([k, v]) => {
      const concern = k.slice(META_NS.length + 1);
      return `<tr><td>${concern}</td><td><code>${escapeHtml(v.source)}</code></td><td><code>${escapeHtml(
        v.mediaType,
      )}</code></td></tr>`;
    })
    .join("");
  const discoveryBody = `<table class="disc"><thead><tr><th>concern</th><th>source</th><th>media type</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="fetch">A machine reads this over <b>MCP</b> from the
      <code>${escapeHtml(SERVER_CARD_URI)}</code> resource; over <b>HTTP</b> also
      from <code>GET /mcp/server-card</code> and
      <code>GET /.well-known/ai-catalog.json</code>.</p>`;

  // The back: tabs (CSS radios; every pane shows when flat or printed).
  // [key, tab label, pane heading, body]
  const tabs: [string, string, string, string][] = [
    ["about", "About", "About", aboutBody],
    ...(skills.length
      ? ([["skills", "Skills", `Skills — ${skills.length}`, skillsBody]] as [string, string, string, string][])
      : []),
    ["context", "Context", "Context — AGENTS.md", contextBody],
    ["memory", "Memory", `Memory — ${memLabel}`, memoryBody],
    ["discovery", "Discovery", "Discovery", discoveryBody],
  ];
  return {
    name,
    title,
    oneLiner,
    domain,
    chips,
    tabs: tabs.map(([key, label, heading, html]) => ({ key, label, heading, html })),
    about: AGENT_ABOUT,
    ...(id?.accent ? { accent: id.accent } : {}),
  };
}

/** tl;dr: the first few facts, each cut to about a line. `full`: every fact, whole. */
export type Detail = "tldr" | "full";
const TLDR_FACTS = 5;
const TLDR_CHARS = 160;

/**
 * Shorten a fact for the tl;dr without rewording it. The whole first sentence
 * when it fits in `max` (a stored sentence, verbatim, so a model has no ragged
 * end to "tidy"); otherwise a word-boundary cut marked with …. A dot inside a
 * word (AGENTS.md, v1.2) is not a sentence end: it must be followed by space.
 */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const first = /^(.+?[.!?])(?=\s)/.exec(s)?.[1];
  if (first && first.length <= max) return first;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.—-]+$/, "")}…`;
}

/**
 * The same card as Markdown, for chats that can't display HTML: identity,
 * the AGENTS.md section headings (bodies stay in the full card), memory,
 * and the discovery table. Same sources as renderCard.
 *
 * The default tl;dr stays small however much memory a project holds: five
 * facts, each cut short, and a count of the rest. `detail: "full"` lists
 * every fact whole. The saved HTML card always has everything.
 */
export function renderCardText(root: string, opts: { detail?: Detail } = {}): string {
  const agents = parseAgentsMd(join(root, "AGENTS.md"));
  const mem = parseFafm(join(root, "project.fafm"));
  const id = resolveIdentity(root);
  const meta = serverCardMeta() as Record<string, { source: string; mediaType: string }>;
  const name = id?.displayName ?? id?.name ?? basename(resolve(root));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  const out = [`### ${name} — business card`];
  const title = cardTitle(id);
  if (title) out.push(`**${title}**`);
  const pills = [
    id?.vendor && id.vendor !== id.status ? id.vendor : null,
    id?.agentVersion ? `v${id.agentVersion}` : null,
    id?.status,
    id?.license,
  ].filter(Boolean);
  if (pills.length) out.push(pills.join(" · "));
  if (id?.description) out.push(id.description);

  const sections = agents?.sections.filter((s) => s.level > 1) ?? [];
  out.push(
    agents
      ? `**Context — AGENTS.md** · ${plural(sections.length, "section")}\n${sections.map((s) => s.heading).join(" · ")}`
      : "**Context — AGENTS.md** · none yet. `author_agents_md` drafts one from this repo's real build and test commands, nothing invented.",
  );

  const full = opts.detail === "full";
  const shown = full ? mem.facts : mem.facts.slice(0, TLDR_FACTS);
  const rest = mem.facts.length - shown.length;
  out.push(
    mem.facts.length
      ? `**Memory** · ${plural(mem.facts.length, "fact")}\n${shown
          .map((f) => `- ${full ? f.text : clip(f.text, TLDR_CHARS)}${f.verification_status === "verified" ? " ✓" : ""}`)
          .join("\n")}${rest ? `\n\n…and ${plural(rest, "more fact")}, in the full card` : ""}`
      : "**Memory** · no facts yet. Ask your agent to remember something, and it lands here.",
  );

  const rows = Object.entries(meta).map(
    ([k, v]) => `| ${k.slice(META_NS.length + 1)} | \`${v.source}\` | \`${v.mediaType}\` |`,
  );
  out.push(
    ["**Discovery**", ...(id?.id ? [`Agent ID \`${id.id}\``, ""] : []), "| concern | source | media type |", "|---|---|---|", ...rows].join("\n"),
  );

  return out.join("\n\n");
}
