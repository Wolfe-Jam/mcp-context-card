/**
 * render-card - the project's context card as one self-contained HTML page.
 *
 * Everything an MCP client discovers about a project - its AGENTS.md, its
 * memory, its identity - rendered as a card a person can read, screenshot,
 * or drop into a PR. Same three sources as the Server Card _meta block and
 * ai-catalog; this is the view for people.
 *
 * Self-contained: inline CSS, no JS, no external fonts. Renders anywhere,
 * including as a data: URI.
 */
import { join } from "node:path";
import { parseAgentsMd } from "./agents-md.js";
import { parseFafm } from "./memory.js";
import { identity, trinityMeta, META_NS } from "./identity.js";
import { NAME, SERVER_CARD_URI } from "./constants.js";
import { escapeHtml, renderInline, renderMarkdown, slug } from "./md.js";

export type Theme = "light" | "dark" | "auto";

export interface CardOptions {
  theme?: Theme;
  /** CSS hex colour for the accent. Validated; invalid falls back to AAIF. */
  accent?: string;
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
}
:root[data-theme="dark"]{
  --bg:#000; --card:#0d0d0d; --fg:#fafafa; --muted:#9a9aa0;
  --line:rgba(255,255,255,.13); --chip:rgba(255,255,255,.07);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#000; --card:#0d0d0d; --fg:#fafafa; --muted:#9a9aa0;
    --line:rgba(255,255,255,.13); --chip:rgba(255,255,255,.07);
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  padding:40px 18px}
.card{max-width:760px;margin:0 auto;background:var(--card);border:1px solid var(--line);
  border-radius:14px;overflow:hidden}
.card>*{padding:26px 30px}
.top{border-top:4px solid var(--accent);border-bottom:1px solid var(--line)}
h1{margin:0 0 10px;font-size:1.7rem;letter-spacing:-.02em}
.pills{display:flex;flex-wrap:wrap;gap:6px}
.pill{font-size:.74rem;font-weight:600;padding:3px 9px;border-radius:20px;background:var(--chip);color:var(--muted)}
.pill.accent{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}
section{border-bottom:1px solid var(--line)}
section:last-child{border-bottom:0}
.label{font-size:.7rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:var(--accent);margin:0 0 14px}
.toc{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0 0 20px;padding:0;list-style:none}
.toc a{font-size:.82rem;color:var(--muted);text-decoration:none}
.toc a:hover{color:var(--accent)}
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
.foot{color:var(--muted);font-size:.78rem;text-align:center;border-top:1px solid var(--line)}
.none{color:var(--muted);font-style:italic}
`;

const htmlAttr = (theme: Theme) =>
  theme === "auto" ? "" : ` data-theme="${theme}"`;

export function renderCard(root: string, opts: CardOptions = {}): string {
  const theme: Theme = opts.theme ?? "auto";
  const accent = safeAccent(opts.accent);

  const agents = parseAgentsMd(join(root, "AGENTS.md"));
  const mem = parseFafm(join(root, "project.fafm"));
  const id = identity(root);
  const meta = trinityMeta() as Record<string, { source: string; mediaType: string; note?: string }>;

  const name = id?.displayName ?? id?.name ?? NAME;

  const pills = [
    id?.vendor && id.vendor !== id.status && `<span class="pill">${escapeHtml(id.vendor)}</span>`,
    id?.agentVersion && `<span class="pill">v${escapeHtml(id.agentVersion)}</span>`,
    id?.status && `<span class="pill accent">${escapeHtml(id.status)}</span>`,
    id?.license && `<span class="pill">${escapeHtml(id.license)}</span>`,
  ]
    .filter(Boolean)
    .join("");

  // CONTEXT — drop the redundant top-level "# AGENTS.md" heading, keep its intro
  const bodySections = agents?.sections.filter((s) => s.level > 1) ?? [];
  const toc = bodySections.length
    ? `<ul class="toc">${bodySections
        .map((s) => `<li><a href="#${slug(s.heading)}">${escapeHtml(s.heading)}</a></li>`)
        .join("")}</ul>`
    : "";
  const contextBody = agents
    ? `${toc}<div class="md">${renderMarkdown(
        [
          agents.preamble,
          agents.sections.find((s) => s.level === 1)?.body ?? "",
          ...bodySections.map((s) => `${"#".repeat(s.level)} ${s.heading}\n\n${s.body}`),
        ]
          .filter(Boolean)
          .join("\n\n"),
      )}</div>`
    : `<p class="none">No AGENTS.md in this project.</p>`;

  // MEMORY
  const memoryBody = mem.facts.length
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
    : `<p class="none">No facts yet.</p>`;

  // DISCOVERY
  const rows = Object.entries(meta)
    .map(([k, v]) => {
      const concern = k.slice(META_NS.length + 1);
      return `<tr><td>${concern}</td><td><code>${escapeHtml(v.source)}</code></td><td><code>${escapeHtml(
        v.mediaType,
      )}</code></td></tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en"${htmlAttr(theme)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(name)} — context card</title>
<style>${CSS(accent)}</style>
</head>
<body>
<main class="card">
  <div class="top">
    <h1>${escapeHtml(name)}</h1>
    <div class="pills">${pills || '<span class="pill">MCP context card</span>'}</div>
  </div>
  <section>
    <p class="label">Context — AGENTS.md</p>
    ${contextBody}
  </section>
  <section>
    <p class="label">Memory — ${mem.facts.length} fact${mem.facts.length === 1 ? "" : "s"}</p>
    ${memoryBody}
  </section>
  <section>
    <p class="label">Discovery</p>
    <table class="disc"><thead><tr><th>concern</th><th>source</th><th>media type</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="fetch">A machine reads this from
      <code>${escapeHtml(SERVER_CARD_URI)}</code>,
      <code>GET /.well-known/mcp/server-card</code>, or
      <code>GET /.well-known/ai-catalog.json</code>.</p>
  </section>
  <div class="foot">${escapeHtml(name)} · context card</div>
</main>
</body>
</html>
`;
}
