/**
 * author — write an AGENTS.md for a project.
 *
 * The rule is concrete:
 *   project.faf present  →  BEST   (authored from the structured source)
 *   no project.faf       →  BETTER (authored from repo detection)
 *
 * Same section structure either way — this repo's own AGENTS.md is the
 * template. Detection supplies the mechanics (install / build / test / CI); a
 * `project.faf` adds the intent (name, one-line summary, why, key files). BEST
 * fills more; BETTER leaves `<!-- TODO -->` on the judgement parts.
 *
 * It authors — never guesses a section it can fill, never overwrites an
 * AGENTS.md that already exists.
 */
import { basename, join } from "node:path";
import { detect, type Detected } from "./detect.js";
import { parseFaf } from "./faf/parse-faf.js";
import type { ProjectContext } from "./faf/types.js";

export type Tier = "BEST" | "BETTER";

export interface Authored {
  tier: Tier;
  markdown: string;
  /** where it came from — "project.faf" or the manifests detect() read */
  from: string[];
}

interface Facts {
  name: string;
  summary?: string;
  why?: string;
  language?: string;
  runtime?: string;
  install?: string;
  build?: string;
  test?: string;
  layout: { path: string; what?: string }[];
  ci: string[];
}

const TODO = "<!-- TODO -->";

/** first sentence, capped — an AGENTS.md intro is one line, not a paragraph. */
function oneLine(s?: string): string | undefined {
  if (!s) return undefined;
  const first = s.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0].replace(/\.$/, "");
  return first.length > 160 ? first.slice(0, 157).replace(/[\s—-]+$/, "") + "…" : first;
}

function fromFaf(faf: ProjectContext, root: string): Facts {
  const d = detect(root); // mechanics + CI + layout the .faf doesn't carry
  return {
    name: faf.name ?? d.name ?? basename(root),
    summary: oneLine(faf.goal ?? faf.what ?? d.description),
    why: oneLine(faf.why),
    language: faf.language ?? d.language,
    runtime: d.runtime ?? faf.stack?.runtime,
    install: d.install,
    build: d.build,
    test: d.test,
    layout: faf.keyFiles?.length
      ? faf.keyFiles.map((p) => ({ path: p }))
      : d.layout.map((p) => ({ path: `${p}/`, what: TODO })),
    ci: d.ci,
  };
}

function fromDetection(d: Detected, root: string): Facts {
  return {
    name: d.name ?? basename(root),
    summary: oneLine(d.description),
    language: d.language,
    runtime: d.runtime,
    install: d.install,
    build: d.build,
    test: d.test,
    layout: d.layout.map((p) => ({ path: `${p}/`, what: TODO })),
    ci: d.ci,
  };
}

function render(f: Facts, tier: Tier): string {
  const out: string[] = ["# AGENTS.md", ""];

  out.push(f.summary ? `**${f.name}** — ${f.summary}.` : `**${f.name}**`, "");
  if (f.why) out.push(`${f.why}.`, "");
  else if (tier === "BETTER") out.push(`${TODO} one line on what this project is for`, "");

  if (f.install) {
    out.push("## Setup", "", "```bash", f.install, "```", "");
    if (f.runtime) out.push(`Requires ${f.runtime}.`, "");
  }
  if (f.build) out.push("## Build", "", "```bash", f.build, "```", "");
  if (f.test) out.push("## Test", "", "```bash", f.test, "```", "");

  if (f.layout.length) {
    out.push("## Layout", "");
    const described = f.layout.some((e) => e.what && e.what !== TODO);
    if (described) {
      out.push("| Path | What |", "|---|---|");
      for (const { path, what } of f.layout) out.push(`| \`${path}\` | ${what ?? TODO} |`);
      out.push("");
    } else {
      for (const { path } of f.layout) out.push(`- \`${path}\``);
      out.push("", `${TODO} one line on what each holds`, "");
    }
  }

  out.push("## Conventions", "");
  out.push("- Conventional Commit messages (`feat:`, `fix:`, `chore:`, …).");
  if (f.language) out.push(`- ${f.language} — ${TODO} style, import rules`);
  out.push(`- ${TODO} which files an agent must keep in sync when it changes code`, "");

  if (f.ci.length) {
    const verb = f.ci.length === 1 ? "runs" : "run";
    out.push("## CI", "", `\`.github/workflows/${f.ci.join("`, `")}\` ${verb} on every push and PR.`, "");
  }

  out.push(
    "## Safety",
    "",
    "- Branch off the default branch; keep CI green before merge.",
    "- Never commit secrets.",
    `- ${TODO} anything an agent should ask before doing (deletes, migrations, deploys)`,
    "",
  );

  const done = [f.test, f.build].filter(Boolean).join(" && ");
  out.push("## Definition of done", "");
  out.push(done ? `\`${done}\` green.` : `${TODO} what "done" means for a change here.`);
  out.push(`${TODO} refresh this file when layout or commands change`, "");

  out.push("---", "");
  out.push(
    tier === "BEST"
      ? "<!-- Authored by mcp-context-card · BEST — from project.faf. Refresh: npx mcp-context-card init -->"
      : "<!-- Authored by mcp-context-card · BETTER — from repo detection. A project.faf authors a BEST AGENTS.md. -->",
  );

  return out.join("\n") + "\n";
}

/** Author an AGENTS.md for `root` — BEST from a project.faf, else BETTER. */
export function authorAgentsMd(root: string): Authored {
  const faf = parseFaf(join(root, "project.faf"));
  if (faf.name || faf.goal || faf.stack) {
    return { tier: "BEST", markdown: render(fromFaf(faf, root), "BEST"), from: ["project.faf"] };
  }
  const d = detect(root);
  return {
    tier: "BETTER",
    markdown: render(fromDetection(d, root), "BETTER"),
    from: d.from.length ? d.from : ["(no manifests found)"],
  };
}
