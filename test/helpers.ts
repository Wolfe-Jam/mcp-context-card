/**
 * Test helpers. Every test that touches a file works on a throwaway copy
 * of the repo's three source files — the real project.fafm is never mutated.
 */
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The tools this server must expose, sorted — the one place a new tool gets
 * added on the test side. Written out by hand on purpose: a list read back
 * from the server couldn't catch a tool that went missing.
 */
export const TOOLS = [
  "author_agents_md",
  "forget",
  "list_agents_md_sections",
  "list_context_sources",
  "read_agents_md",
  "recall",
  "remember",
  "render_context_card",
  "save_context_card",
  "whoami",
];

/** A temp dir with copies of AGENTS.md, project.faf, project.fafm, .well-known/. */
export function fixture(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "mcp-context-card-"));
  cpSync(join(REPO_ROOT, "AGENTS.md"), join(root, "AGENTS.md"));
  cpSync(join(REPO_ROOT, "project.faf"), join(root, "project.faf"));
  cpSync(join(REPO_ROOT, "project.fafm"), join(root, "project.fafm"));
  cpSync(join(REPO_ROOT, ".well-known"), join(root, ".well-known"), { recursive: true });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
