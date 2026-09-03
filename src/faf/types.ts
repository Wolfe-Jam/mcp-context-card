/**
 * Shared types for the three FAF-family formats this server reads.
 * These are the minimal shapes mcp-context-card needs — not the full specs.
 * Full specs: application/vnd.faf+yaml, application/vnd.fafm+yaml,
 * application/vnd.fafa+yaml (all IANA-registered).
 */

/** A parsed `.faf` — project context. */
export interface ProjectContext {
  /** `project.name` */
  name?: string;
  /** `project.goal` */
  goal?: string;
  /** `project.main_language` */
  language?: string;
  /** `project.type` */
  type?: string;
  /** `human_context.*` — the six Ws, when authored */
  who?: string;
  what?: string;
  why?: string;
  where?: string;
  when?: string;
  how?: string;
  /** `stack.*` — tool-chain facts (`runtime`, `build`, `cicd`, …), `slotignored` values dropped. */
  stack?: Record<string, string>;
  /** `key_files` — the files that matter, in order. */
  keyFiles?: string[];
  /**
   * Flat scalar fields, keyed by the exact name a tool `inputSchema` might
   * declare (`project_name`, `project_goal`, `main_language`, …). This is
   * what the host-side param-fill mechanism reads from.
   */
  fields: Record<string, string>;
}

/** One `.fafm` fact. */
export interface MemoryFact {
  id: string;
  text: string;
  type?: string;
  priority?: string;
  tags?: string[];
  source?: string;
  verification_status?: string;
}

/** A parsed `.fafm` — persistent memory. */
export interface Memory {
  version?: string;
  profile?: string;
  namepoint?: string;
  facts: MemoryFact[];
}

/** A parsed `.fafa` — agent identity card. */
export interface AgentIdentity {
  version?: string;
  name?: string;
  displayName?: string;
  vendor?: string;
  agentVersion?: string;
  description?: string;
  status?: string;
  license?: string;
}
