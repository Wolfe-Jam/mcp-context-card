/**
 * agents-md — read a project's AGENTS.md.
 *
 * AGENTS.md is the de-facto standard for telling a coding agent how to work
 * in a repo: setup, build, test, conventions, safety. It is plain Markdown.
 *
 * A client today has to know the file exists and read the whole thing into
 * context. This splits it into addressable sections by heading so a client
 * can pull just "## Testing" on demand. No Markdown-parser dependency —
 * a heading is a `^#{1,6} ` line outside a fenced code block.
 */
import { readFileSync } from "node:fs";

export interface AgentsSection {
  /** heading text, verbatim, without the leading `#`s */
  heading: string;
  /** heading depth, 1–6 */
  level: number;
  /** everything under this heading up to the next heading, trimmed */
  body: string;
}

export interface AgentsMd {
  /** the file, byte-for-byte */
  raw: string;
  /** any text before the first heading (often a one-line intro) */
  preamble: string;
  sections: AgentsSection[];
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

export function parseAgentsMd(path: string): AgentsMd | null {
  try {
    return fromString(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function fromString(raw: string): AgentsMd {
  const sections: AgentsSection[] = [];
  const preamble: string[] = [];
  let cur: { heading: string; level: number; body: string[] } | null = null;
  let inFence = false;

  const flush = () => {
    if (cur) {
      sections.push({ heading: cur.heading, level: cur.level, body: cur.body.join("\n").trim() });
      cur = null;
    }
  };

  for (const line of raw.split(/\r?\n/)) {
    if (FENCE.test(line)) inFence = !inFence;
    const m = inFence ? null : line.match(HEADING);
    if (m) {
      flush();
      cur = { heading: m[2].trim(), level: m[1].length, body: [] };
    } else if (cur) {
      cur.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  flush();

  return { raw, preamble: preamble.join("\n").trim(), sections };
}

/**
 * Resolve a section by heading: exact (case-insensitive) first, then prefix,
 * then substring. Returns null if nothing matches.
 */
export function findSection(doc: AgentsMd, query: string): AgentsSection | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const h = (s: AgentsSection) => s.heading.toLowerCase();
  return (
    doc.sections.find((s) => h(s) === q) ??
    doc.sections.find((s) => h(s).startsWith(q)) ??
    doc.sections.find((s) => h(s).includes(q)) ??
    null
  );
}
