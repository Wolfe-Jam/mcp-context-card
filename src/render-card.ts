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

export type Theme = "light" | "dark" | "auto";

export interface CardOptions {
  theme?: Theme;
  /** CSS hex colour for the accent. Validated; invalid falls back to AAIF. */
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

/** AAIF brand orange (aaif.io). The default accent. */
export const AAIF_ACCENT = "#FF702D";

const ACCENT_OK = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?$/;

export function safeAccent(a?: string): string {
  return a && ACCENT_OK.test(a) ? a : AAIF_ACCENT;
}

const CSS = (accent: string) => `
:root{
  --accent:${accent};
  --bg:#f4f4f5; --card:#fff; --fg:#0a0a0a; --muted:#6b6b70;
  --line:rgba(0,0,0,.09); --chip:rgba(0,0,0,.05);
  --card-shadow:0 1px 3px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.10);
}
:root[data-theme="dark"]{
  --bg:#000; --card:#0d0d0d; --fg:#fafafa; --muted:#9a9aa0;
  --line:rgba(255,255,255,.13); --chip:rgba(255,255,255,.07);
  --card-shadow:0 0 0 1px rgba(255,255,255,.16),
    0 8px 40px color-mix(in srgb, var(--accent) 20%, transparent);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#000; --card:#0d0d0d; --fg:#fafafa; --muted:#9a9aa0;
    --line:rgba(255,255,255,.13); --chip:rgba(255,255,255,.07);
    --card-shadow:0 0 0 1px rgba(255,255,255,.16),
      0 8px 40px color-mix(in srgb, var(--accent) 20%, transparent);
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  padding:40px 16px}
/* ── the business card: two faces, flip, two views ─────────────────── */
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.stage{max-width:760px;margin:0 auto}
.views{display:flex;justify-content:flex-end;margin:0 0 10px}
.view,.hint label{cursor:pointer}
.view{font-size:.78rem;font-weight:600;padding:3px 11px;border-radius:20px;border:1px solid var(--line);
  background:var(--chip);color:var(--muted);letter-spacing:.2em}
.view:hover,.hint label:hover{color:var(--accent);border-color:var(--accent)}
.bcard{margin:0 auto;width:100%;aspect-ratio:7/4;perspective:1600px}
#portrait:checked~.stage{max-width:480px}
#portrait:checked~.stage .bcard{aspect-ratio:4/7}
.faces{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .6s ease}
#flip:checked~.stage .faces{transform:rotateY(180deg)}
.face{position:absolute;inset:0;background:var(--card);border:1px solid var(--line);border-radius:16px;
  box-shadow:var(--card-shadow);backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.back{transform:rotateY(180deg);display:flex;flex-direction:column}
.front{display:flex;flex-direction:column;justify-content:center;padding:34px 44px;
  border-top:5px solid var(--accent);
  background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 10%,var(--card)) 0%,var(--card) 55%)}
.front .id{max-width:34em}
h1{margin:0;font-size:2.1rem;line-height:1.15;letter-spacing:-.025em}
.title{margin:8px 0 0;font-size:.82rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.oneliner{margin:16px 0 0;font-size:1.05rem;color:var(--muted);line-height:1.5}
.foot-front{position:absolute;left:44px;right:70px;bottom:22px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.domain{font:.8rem ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.corner{position:absolute;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
  cursor:pointer;font-weight:700;font-size:.9rem;color:var(--muted);background:var(--chip);border:1px solid var(--line);z-index:4}
.corner:hover{color:var(--accent);border-color:var(--accent)}
.corner.tr{top:16px;right:16px;font-family:Georgia,serif;font-style:italic}
.logo{position:absolute;top:22px;left:24px;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;
  color:#fff;font-weight:800;font-size:1.05rem;letter-spacing:.02em;
  background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#000));
  box-shadow:0 2px 10px color-mix(in srgb,var(--accent) 35%,transparent)}
.corner.br{bottom:16px;right:16px}
.tabbar .corner.flipback{position:static;margin:0 0 6px auto;width:28px;height:28px;padding:0;border-radius:50%;color:var(--muted)}
.tabbar{display:flex;flex-wrap:wrap;gap:4px;padding:14px 18px 0;border-bottom:1px solid var(--line);border-top:5px solid var(--accent)}
.tabbar label{cursor:pointer;font-size:.8rem;font-weight:600;color:var(--muted);padding:6px 11px;border-radius:8px 8px 0 0}
.tabbar label:hover{color:var(--fg)}
.panes{flex:1;overflow:auto;padding:20px 26px 28px}
.pane{display:none}
#t-about:checked~.panes .p-about,#t-skills:checked~.panes .p-skills,#t-context:checked~.panes .p-context,
#t-memory:checked~.panes .p-memory,#t-discovery:checked~.panes .p-discovery{display:block}
#t-about:checked~.tabbar label[for=t-about],#t-skills:checked~.tabbar label[for=t-skills],
#t-context:checked~.tabbar label[for=t-context],#t-memory:checked~.tabbar label[for=t-memory],
#t-discovery:checked~.tabbar label[for=t-discovery]{color:var(--accent);background:var(--chip)}
.lead{margin:0 0 14px;font-size:1rem;line-height:1.6}
.kv{border-collapse:collapse;font-size:.86rem;width:100%}
.kv th{text-align:left;font-weight:600;color:var(--muted);padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top}
.kv td{padding:6px 0;border-bottom:1px solid var(--line)}
.kv code,.lead code{font:.86em ui-monospace,SFMono-Regular,Menlo,monospace}
.hint{text-align:center;color:var(--muted);font-size:.78rem;margin:14px 0 0}
.hint label{color:var(--accent)}
#flip:focus-visible~.stage .corner.br,#portrait:focus-visible~.stage .view{outline:2px solid var(--accent);outline-offset:2px}
@media (max-width:640px){
  .bcard,#portrait:checked~.stage .bcard{aspect-ratio:auto;height:min(78vh,720px)}
  .front{padding:28px 26px}.foot-front{left:26px}
  h1{font-size:1.7rem}
}
/* flat: expanded render and print — both faces, every tab, no flip */
.flat .faces,.flat .face{position:static;transform:none!important;height:auto}
.flat .bcard{aspect-ratio:auto;perspective:none}
.flat .face{margin:0 0 18px}.flat .front{min-height:260px;position:relative}
.flat .pane{display:block;margin:0 0 22px}.flat .tabbar,.flat .views,.flat .hint,.flat .corner{display:none}
.flat .panes{overflow:visible}
@media print{
  .faces,.face{position:static!important;transform:none!important;height:auto!important}
  .bcard{aspect-ratio:auto!important}.face{margin:0 0 18px;box-shadow:none}
  .pane{display:block!important;margin:0 0 22px}.tabbar,.views,.hint,.corner{display:none!important}
  .panes{overflow:visible}
}
.pills{display:flex;flex-wrap:wrap;gap:6px}
.pill{font-size:.74rem;font-weight:600;padding:3px 9px;border-radius:20px;background:var(--chip);color:var(--muted)}
.pill.accent{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}
.label{font-size:.7rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:var(--accent);margin:0 0 14px}
.toc{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0;padding:0;list-style:none}
.toc a{font-size:.82rem;color:var(--muted);text-decoration:none}
.toc a:hover{color:var(--accent)}
/* ── collapsible context ─────────────────────────────────────────── */
.ctx-nav{position:sticky;top:-20px;z-index:3;background:var(--card);
  margin:0 -26px 16px;padding:11px 26px;border-bottom:1px solid var(--line);
  display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 16px}
.xall{margin-left:auto;flex:none;font:inherit;font-size:.76rem;font-weight:600;
  white-space:nowrap;padding:3px 11px;border-radius:20px;border:1px solid var(--line);
  background:var(--chip);color:var(--muted);cursor:pointer}
.xall:hover{color:var(--accent);border-color:var(--accent)}
.ctx-preamble{padding-bottom:4px}
details.ctx-section{border-top:1px solid var(--line)}
details.ctx-section>summary{cursor:pointer;list-style:none;padding:11px 0;
  font-weight:600;font-size:1rem;letter-spacing:-.01em;display:flex;gap:9px}
details.ctx-section>summary::-webkit-details-marker{display:none}
details.ctx-section>summary::before{content:"›";color:var(--accent);font-weight:700;
  transition:transform .15s ease}
details.ctx-section[open]>summary::before{transform:rotate(90deg)}
details.ctx-section>.md{padding:0 0 16px}
@media print{
  .ctx-nav{display:none}
  details.ctx-section:not([open])>.md{display:block!important}
  details.ctx-section>summary::before{content:""}
}
.md h1,.md h2,.md h3,.md h4{margin:22px 0 8px;font-size:1rem;letter-spacing:-.01em}
.md h1{font-size:1.15rem}
.md p{margin:8px 0}
.md ul,.md ol{margin:8px 0;padding-left:22px}
.md li{margin:3px 0}
.md code{background:var(--chip);padding:1px 5px;border-radius:5px;
  font:.86em ui-monospace,SFMono-Regular,Menlo,monospace}
.md pre{background:var(--chip);padding:14px 16px;border-radius:9px;overflow:auto}
.md pre code{background:none;padding:0}
.md table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.88rem;display:block;overflow:auto}
.md th,.md td{border:1px solid var(--line);padding:6px 10px;text-align:left}
.md blockquote{margin:10px 0;padding-left:14px;border-left:3px solid var(--line);color:var(--muted)}
.md a{color:var(--accent)}
.fact{padding:12px 0;border-bottom:1px solid var(--line)}
.fact:last-child{border-bottom:0}
.fact p{margin:0 0 7px}
.meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tag{font-size:.72rem;padding:2px 8px;border-radius:5px;background:var(--chip);color:var(--muted)}
.dot{width:7px;height:7px;border-radius:50%;background:var(--accent);display:inline-block}
.dot.pending{background:var(--muted)}
.disc{width:100%;border-collapse:collapse;font-size:.84rem}
.disc th,.disc td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line)}
.disc th{color:var(--muted);font-weight:600}
.disc code{font:.86em ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.fetch{margin:14px 0 0;font-size:.82rem;color:var(--muted)}
.fetch code{background:var(--chip);padding:1px 5px;border-radius:5px}
.none{color:var(--muted);font-style:italic}
`;

const htmlAttr = (theme: Theme) =>
  theme === "auto" ? "" : ` data-theme="${theme}"`;

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

/** The front's logo: the first letters of the name's first two words ("mcp-context-card" → "MC"). */
export function cardInitials(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0].toUpperCase())
    .join("");
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

export function renderCard(root: string, opts: CardOptions = {}): string {
  const theme: Theme = opts.theme ?? "auto";
  const accent = safeAccent(opts.accent);
  const portrait = opts.layout === "portrait";
  const flat = !!opts.expanded;

  const agents = parseAgentsMd(join(root, "AGENTS.md"));
  const mem = parseFafm(join(root, "project.fafm"));
  const id = resolveIdentity(root);
  const meta = serverCardMeta() as Record<string, { source: string; mediaType: string; note?: string }>;

  const name = id?.displayName ?? id?.name ?? basename(resolve(root));
  const title = cardTitle(id);
  const oneLiner = cardOneLiner(id);
  const domain = /^urn:air:([^:]+):/i.exec(id?.id ?? "")?.[1];

  // The version rides in the title line, so the front's pills skip it.
  const pills = [
    id?.vendor && id.vendor !== id.status && `<span class="pill">${escapeHtml(id.vendor)}</span>`,
    !title && id?.agentVersion && `<span class="pill">v${escapeHtml(id.agentVersion)}</span>`,
    id?.status && `<span class="pill accent">${escapeHtml(id.status)}</span>`,
    id?.license && `<span class="pill">${escapeHtml(id.license)}</span>`,
  ]
    .filter(Boolean)
    .join("");

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
      ? ([["skills", `Skills · ${skills.length}`, `Skills — ${skills.length}`, skillsBody]] as [string, string, string, string][])
      : []),
    ["context", "Context", "Context — AGENTS.md", contextBody],
    ["memory", `Memory · ${mem.facts.length}`, `Memory — ${memLabel}`, memoryBody],
    ["discovery", "Discovery", "Discovery", discoveryBody],
  ];
  const radios = tabs
    .map(([k], i) => `<input type="radio" name="tab" id="t-${k}" class="sr"${i === 0 ? " checked" : ""}>`)
    .join("");
  const tabbar = tabs.map(([k, label]) => `<label for="t-${k}">${escapeHtml(label)}</label>`).join("");
  const panes = tabs
    .map(([k, , heading, body]) => `<div class="pane p-${k}"><p class="label">${escapeHtml(heading)}</p>${body}</div>`)
    .join("");

  return `<!doctype html>
<html lang="en"${htmlAttr(theme)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(name)} — business card</title>
<style>${CSS(accent)}</style>
</head>
<body${flat ? ` class="flat"` : ""}>
<input type="checkbox" id="flip" class="sr" aria-label="Flip the card">
<input type="checkbox" id="portrait" class="sr" aria-label="Portrait view"${portrait ? " checked" : ""}>
<div class="stage">
  <div class="views"><label for="portrait" class="view" title="Landscape or portrait">▭ ▯</label></div>
  <main class="bcard">
    <div class="faces">
      <section class="face front">
        <div class="logo" aria-hidden="true">${escapeHtml(cardInitials(name))}</div>
        <label for="flip" class="corner tr" title="About">i</label>
        <div class="id">
          <h1>${escapeHtml(name)}</h1>
          ${title ? `<p class="title">${escapeHtml(title)}</p>` : ""}
          ${oneLiner ? `<p class="oneliner">${escapeHtml(oneLiner)}</p>` : ""}
        </div>
        <div class="foot-front">${domain ? `<span class="domain">${escapeHtml(domain)}</span>` : ""}${pills ? `<div class="pills">${pills}</div>` : ""}</div>
        <label for="flip" class="corner br" title="Flip the card">⟲</label>
      </section>
      <section class="face back">
        ${radios}
        <div class="tabbar">${tabbar}<label for="flip" class="corner flipback" title="Flip back">⟲</label></div>
        <div class="panes">${panes}</div>
      </section>
    </div>
  </main>
  <p class="hint">${escapeHtml(name)} · business card · <label for="flip">flip it over</label></p>
</div>
${CARD_SCRIPT}
</body>
</html>
`;
}

/**
 * The card's only script — a progressive enhancement. Flip, tabs and the view
 * toggle are CSS (checkbox and radio inputs) and work without it. It adds:
 * Expand all / Collapse all for the context sections, opening the section a
 * `#hash` names (flipping to the back and its Context tab first), and opening
 * every section for printing (browsers disagree on printing a closed
 * `<details>`).
 */
const CARD_SCRIPT = `<script>
(function(){
  var secs=[].slice.call(document.querySelectorAll("details.ctx-section"));
  var btn=document.querySelector(".xall");
  var sync=function(){if(btn)btn.textContent=secs.every(function(d){return d.open})?"Collapse all":"Expand all"};
  if(btn&&secs.length){
    btn.hidden=false;
    btn.addEventListener("click",function(){var open=!secs.every(function(d){return d.open});secs.forEach(function(d){d.open=open});sync()});
    secs.forEach(function(d){d.addEventListener("toggle",sync)});
  }
  var openHash=function(){
    var d=document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if(!d||d.tagName!=="DETAILS")return;
    var f=document.getElementById("flip"),t=document.getElementById("t-context");
    if(f)f.checked=true;if(t)t.checked=true;d.open=true;sync();
    setTimeout(function(){d.scrollIntoView({block:"nearest"})},620);
  };
  addEventListener("hashchange",openHash);openHash();
  var pre=[];
  addEventListener("beforeprint",function(){pre=secs.map(function(d){return d.open});secs.forEach(function(d){d.open=true})});
  addEventListener("afterprint",function(){secs.forEach(function(d,i){d.open=pre[i]});sync()});
  sync();
})();
</script>`;

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
