/**
 * author — author an AGENTS.md for a project from its repo facts.
 *
 * The engine is `agents-md-facts` (a published, standalone tool, AGENTS.md
 * BETTER tier): it detects real build/test commands, entry points, toolchain
 * conventions and nothing invented. This wraps it in the managed-block
 * markers so `agents-md-facts --check` (or its Action / pre-commit hook) can
 * keep the result true afterwards.
 *
 * A `project.faf` is the BEST tier — the same discipline plus a structured
 * source of truth that refreshes the file. This wrapper stays at BETTER; the
 * README points at the BEST path.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { authorAgentsMd as authorBlock, buildRepoContext } from "agents-md-facts";

/** The markers `agents-md-facts` uses to bound its managed block. */
export const BLOCK_START = "<!-- agents:from-facts:start -->";
export const BLOCK_END = "<!-- agents:from-facts:end -->";

export interface Authored {
  /** the AGENTS.md text — a managed block, ready to drop in */
  markdown: string;
  /** whether an AGENTS.md already exists at the target */
  exists: boolean;
}

/** Author a managed AGENTS.md block for `root`, from its repo facts. */
export function authorAgentsMd(root: string): Authored {
  const block = authorBlock(buildRepoContext(root)).trim();
  return {
    markdown: `${BLOCK_START}\n${block}\n${BLOCK_END}\n`,
    exists: existsSync(join(root, "AGENTS.md")),
  };
}
