/**
 * Shared types for the two FAF-family formats this server reads.
 * These are the minimal shapes mcp-context-card needs — not the full specs.
 * Full specs: application/vnd.fafm+yaml, application/vnd.fafa+yaml
 * (both IANA-registered).
 */

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
