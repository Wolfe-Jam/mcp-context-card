/**
 * md - a minimal Markdown to HTML renderer, dependency-free.
 *
 * Covers exactly what an AGENTS.md uses: ATX headings, paragraphs, fenced
 * code, unordered / ordered lists (one nested level), GFM tables,
 * blockquotes, horizontal rules, and inline bold / italic / code / links.
 * Anything it does not recognise becomes an escaped paragraph. It never
 * throws and never emits an unescaped angle bracket.
 *
 * Not spec-compliant CommonMark. If a project's AGENTS.md outgrows it,
 * swap in `marked`.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** kebab slug for a heading id */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const SAFE_URL = /^(https?:|mailto:|#|\.?\/)/i;
/**
 * Inline pass: escape first, then pull out code spans as HTML-comment
 * placeholders (impossible in escaped text), then links -> bold -> italic,
 * then restore the code spans. ASCII throughout.
 */
export function renderInline(src: string): string {
  const codes: string[] = [];
  let s = escapeHtml(src).replace(/`([^`]+)`/g, (_m, c) => {
    codes.push("<code>" + c + "</code>");
    return "<!--c" + (codes.length - 1) + "-->";
  });

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => {
    // url is already escaped; &amp; is valid inside an href
    return SAFE_URL.test(String(url).replace(/&amp;/g, "&"))
      ? '<a href="' + url + '">' + text + "</a>"
      : text;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_([^_\s][^_]*?)_(?![\w])/g, "$1<em>$2</em>");

  s = s.replace(/<!--c(\d+)-->/g, (_m, i) => codes[Number(i)] ?? "");
  return s;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^(\s*)(```+|~~~+)(.*)$/;
const HR = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const LI = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

function tableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  const flushPara = (buf: string[]) => {
    if (buf.length) out.push("<p>" + renderInline(buf.join(" ").trim()) + "</p>");
    buf.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // fenced code
    const fence = line.match(FENCE);
    if (fence) {
      const close = fence[2][0] === "`" ? /^\s*```+\s*$/ : /^\s*~~~+\s*$/;
      const lang = fence[3].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      const cls = lang ? ' class="language-' + escapeHtml(lang) + '"' : "";
      out.push("<pre><code" + cls + ">" + escapeHtml(body.join("\n")) + "</code></pre>");
      continue;
    }

    // heading
    const h = line.match(HEADING);
    if (h) {
      const n = h[1].length;
      out.push("<h" + n + ' id="' + slug(h[2]) + '">' + renderInline(h[2].trim()) + "</h" + n + ">");
      i++;
      continue;
    }

    // hr
    if (HR.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        inner.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push("<blockquote>" + renderMarkdown(inner.join("\n")) + "</blockquote>");
      continue;
    }

    // table
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = tableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(tableRow(lines[i]));
        i++;
      }
      const th = head.map((c) => "<th>" + renderInline(c) + "</th>").join("");
      const trs = rows
        .map((r) => "<tr>" + r.map((c) => "<td>" + renderInline(c) + "</td>").join("") + "</tr>")
        .join("");
      out.push("<table><thead><tr>" + th + "</tr></thead><tbody>" + trs + "</tbody></table>");
      continue;
    }

    // list (one nested level)
    if (LI.test(line)) {
      const first = line.match(LI)!;
      const tag = /\d/.test(first[2]) ? "ol" : "ul";
      const items: string[] = [];
      let baseIndent = first[1].length;
      let cur: { text: string[]; sub: string[] } | null = null;
      const push = () => {
        if (cur) {
          const subHtml = cur.sub.length ? renderMarkdown(cur.sub.join("\n")) : "";
          items.push("<li>" + renderInline(cur.text.join(" ").trim()) + subHtml + "</li>");
          cur = null;
        }
      };
      while (i < lines.length) {
        const m = lines[i].match(LI);
        if (m && m[1].length <= baseIndent + 1) {
          push();
          baseIndent = m[1].length;
          cur = { text: [m[3]], sub: [] };
          i++;
        } else if (m && cur) {
          cur.sub.push(lines[i].slice(baseIndent + 2));
          i++;
        } else if (lines[i].trim() && cur && !HEADING.test(lines[i]) && !FENCE.test(lines[i])) {
          cur.text.push(lines[i].trim());
          i++;
        } else {
          break;
        }
      }
      push();
      out.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
      continue;
    }

    // paragraph
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !LI.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    flushPara(buf);
  }

  return out.join("\n");
}
