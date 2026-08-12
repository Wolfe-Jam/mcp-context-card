/**
 * memory — real, file-backed remember/recall against project.fafm itself.
 *
 * No in-memory cache, no side-file: every call reads/writes project.fafm
 * from disk. That's the actual claim `.fafm` makes ("memory that survives
 * across sessions") — proven by demo.ts restarting the server process
 * between remember() and recall() and getting the same fact back.
 *
 * Facts are always written as `- text: "..."` immediately followed by
 * `  id: "..."` on the next line (see project.fafm) — recall() relies on
 * that adjacency rather than a full YAML parse.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FACTS_HEADER = "  facts:";

export function recall(path: string, id: string): string | null {
  const lines = readFileSync(path, "utf8").split("\n");
  const idLine = lines.findIndex((l) => l.includes(`id: "${id}"`));
  if (idLine <= 0) return null;

  const textMatch = lines[idLine - 1].match(/-\s*text:\s*"(.*)"\s*$/);
  return textMatch ? textMatch[1] : null;
}

export function remember(path: string, id: string, text: string): void {
  const raw = readFileSync(path, "utf8");

  if (raw.includes(`id: "${id}"`)) {
    const lines = raw.split("\n");
    const idLine = lines.findIndex((l) => l.includes(`id: "${id}"`));
    if (idLine > 0) {
      lines[idLine - 1] = lines[idLine - 1].replace(/text:\s*".*"/, `text: "${text}"`);
      writeFileSync(path, lines.join("\n"));
      return;
    }
  }

  const newFact =
    `    - text: "${text}"\n` +
    `      id: "${id}"\n` +
    `      type: "session"\n` +
    `      priority: "standard"\n` +
    `      source: "remember()"\n` +
    `      verification_status: "unverified"\n`;

  writeFileSync(path, raw.replace(FACTS_HEADER, `${FACTS_HEADER}\n${newFact}`));
}
