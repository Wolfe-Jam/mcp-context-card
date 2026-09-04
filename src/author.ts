/**
 * author — author an AGENTS.md for a project, at the tier the project earns.
 *
 * BETTER: the engine is `agents-md-facts` (a published, standalone tool) —
 * it detects real build/test commands, entry points, toolchain conventions
 * and nothing invented. Every project gets at least this.
 *
 * BEST: when `project.faf` exists, its structured intent — goal, who it's
 * for, why it exists, the files that matter most — is real, human-authored
 * truth that no amount of repo-scanning can detect. A project with a
 * `project.faf` gets BOTH: the facts block, unchanged, plus this intent as
 * its own managed block ahead of it. This is the whole point of the app:
 * give the BEST AGENTS.md when the structured source to build it from is
 * sitting right there.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { authorAgentsMd as authorBlock, buildRepoContext } from "agents-md-facts";

/** The markers `agents-md-facts` uses to bound its managed block. */
export const BLOCK_START = "<!-- agents:from-facts:start -->";
export const BLOCK_END = "<!-- agents:from-facts:end -->";

/** The markers this file uses to bound the project.faf-sourced intent block. */
export const FAF_BLOCK_START = "<!-- context:from-faf:start -->";
export const FAF_BLOCK_END = "<!-- context:from-faf:end -->";

export interface Authored {
  /** the AGENTS.md text — one or two managed blocks, ready to drop in */
  markdown: string;
  /** whether an AGENTS.md already exists at the target */
  exists: boolean;
  /** which tier was authored — BEST only when a readable project.faf was found */
  tier: "better" | "best";
}

interface FafIntent {
  name?: string;
  goal?: string;
  who?: string;
  why?: string;
  keyFiles?: string[];
}

/** Read the structured intent out of `root`'s project.faf, or null if there isn't one to read. */
function readFafIntent(root: string): FafIntent | null {
  const path = join(root, "project.faf");
  if (!existsSync(path)) return null;
  try {
    const doc = (parse(readFileSync(path, "utf8")) ?? {}) as Record<string, any>;
    const project = doc.project ?? {};
    const humanContext = doc.human_context ?? {};
    const intent: FafIntent = {
      name: str(project.name),
      goal: str(project.goal),
      who: str(humanContext.who),
      why: str(humanContext.why),
      keyFiles: Array.isArray(doc.key_files) ? doc.key_files.map(String).filter(Boolean) : undefined,
    };
    // A .faf with nothing usable in it isn't a real intent source.
    return intent.goal || intent.who || intent.why ? intent : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s || undefined;
}

/** Render the project.faf-sourced intent as its own managed block. */
function fafIntentBlock(intent: FafIntent): string {
  const lines: string[] = ["## Project", ""];
  if (intent.goal) lines.push(intent.goal, "");
  if (intent.who) lines.push(`**Who it's for:** ${intent.who}`, "");
  if (intent.why) lines.push(`**Why:** ${intent.why}`, "");
  if (intent.keyFiles?.length) {
    lines.push("**Start here:**", "");
    for (const f of intent.keyFiles) lines.push(`- \`${f}\``);
    lines.push("");
  }
  return `${FAF_BLOCK_START}\n${lines.join("\n").trimEnd()}\n${FAF_BLOCK_END}\n`;
}

/**
 * Author AGENTS.md for `root`. BETTER from repo facts alone; BEST — facts
 * plus the project.faf intent block, ahead of it — when a project.faf with
 * real content exists.
 */
export function authorAgentsMd(root: string): Authored {
  const factsBlock = `${BLOCK_START}\n${authorBlock(buildRepoContext(root)).trim()}\n${BLOCK_END}\n`;
  const exists = existsSync(join(root, "AGENTS.md"));
  const intent = readFafIntent(root);

  if (!intent) return { markdown: factsBlock, exists, tier: "better" };

  return {
    markdown: `${fafIntentBlock(intent)}\n${factsBlock}`,
    exists,
    tier: "best",
  };
}
