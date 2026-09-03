/**
 * parse-faf — read a `.faf` file into a typed ProjectContext.
 *
 * Real YAML parse (the `yaml` package), not regex. `.faf` is
 * `application/vnd.faf+yaml` — it IS yaml, so parse it as yaml.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { ProjectContext } from "./types.js";

/** Field-name aliases: `.faf` key → the param name a tool schema might use. */
const FIELD_MAP: Record<string, string> = {
  name: "project_name",
  goal: "project_goal",
  main_language: "main_language",
  type: "project_type",
};

export function parseFaf(path: string): ProjectContext {
  let doc: any;
  try {
    doc = parse(readFileSync(path, "utf8")) ?? {};
  } catch {
    return { fields: {} };
  }

  const project = doc.project ?? {};
  const human = doc.human_context ?? {};

  const ctx: ProjectContext = {
    name: str(project.name),
    goal: str(project.goal),
    language: str(project.main_language),
    type: str(project.type),
    who: str(human.who),
    what: str(human.what),
    why: str(human.why),
    where: str(human.where),
    when: str(human.when),
    how: str(human.how),
    fields: {},
  };

  // Build the flat, tool-schema-keyed field map from the project block.
  for (const [key, alias] of Object.entries(FIELD_MAP)) {
    const v = str(project[key]);
    if (v !== undefined) ctx.fields[alias] = v;
  }
  // The six Ws are fillable too, under their bare names.
  for (const w of ["who", "what", "why", "where", "when", "how"] as const) {
    if (ctx[w] !== undefined) ctx.fields[w] = ctx[w]!;
  }

  return ctx;
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}
