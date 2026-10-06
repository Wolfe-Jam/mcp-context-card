/**
 * Test helpers. Every test that touches a file works on a throwaway copy
 * of the repo's three source files — the real project.fafm is never mutated.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

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

/**
 * A validator for the official MCP Server Card v1 JSON Schema (the fixture is
 * the SEP-2127 snapshot). Returns null when valid, else the Ajv errors.
 */
export function cardValidator(): (card: unknown) => string | null {
  const schema = JSON.parse(readFileSync(join(REPO_ROOT, "test/fixtures/server-card.schema.v1.json"), "utf8"));
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  // ajv-formats is CommonJS: under ESM the callable may sit on `.default`.
  const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (a: Ajv2020) => Ajv2020;
  addFormats(ajv);
  ajv.addSchema(schema, "server-card");
  const validate = ajv.getSchema("server-card#/$defs/ServerCard")!;
  return (card) => (validate(card) ? null : ajv.errorsText(validate.errors));
}
