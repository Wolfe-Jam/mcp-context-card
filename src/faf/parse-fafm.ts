/**
 * parse-fafm — read and write a `.fafm` file (persistent memory).
 *
 * Uses the `yaml` package's Document API so remember()/recall() edit the
 * file structurally and stringify back with comments and layout intact.
 * This file is dogfood memory about the repo's own build — the header
 * comments matter, and a `git diff` after a `remember()` should show only
 * the fact that was added, not a whole-file reformat.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument, Scalar, YAMLSeq, YAMLMap, type Document } from "yaml";
import type { Memory, MemoryFact } from "./types.js";

/** Stringify options that keep the file stable across edits. */
const OUT = {
  lineWidth: 0, // never fold long scalars onto new lines
  flowCollectionPadding: false, // `["a","b"]`, not `[ "a", "b" ]`
} as const;

/** A double-quoted string scalar — the .fafm/.fafa house convention. */
function q(v: string): Scalar {
  const s = new Scalar(v);
  s.type = Scalar.QUOTE_DOUBLE;
  return s;
}

/** A YAMLMap with every string value double-quoted. */
function factMap(entries: Record<string, string>): YAMLMap {
  const m = new YAMLMap();
  for (const [k, v] of Object.entries(entries)) m.set(k, q(v));
  return m;
}

function load(path: string): Document {
  return parseDocument(readFileSync(path, "utf8"));
}

export function parseFafm(path: string): Memory {
  const doc = load(path);
  const seq = doc.getIn(["memory", "facts"], true) as YAMLSeq | undefined;
  const facts = (seq?.toJSON?.() ?? []) as unknown[];

  return {
    version: doc.get("version") as string | undefined,
    profile: doc.get("profile") as string | undefined,
    namepoint: doc.get("namepoint") as string | undefined,
    facts: (Array.isArray(facts) ? facts : []).map(normFact),
  };
}

export function recall(path: string, id: string): MemoryFact | null {
  return parseFafm(path).facts.find((f) => f.id === id) ?? null;
}

/** Add a fact, or update its text in place if the id already exists. */
export function remember(path: string, id: string, text: string): void {
  const doc = load(path);

  let facts = doc.getIn(["memory", "facts"], true) as YAMLSeq | undefined;
  if (!facts) {
    if (!doc.has("memory")) doc.set("memory", new YAMLMap());
    facts = new YAMLSeq();
    (doc.getIn(["memory"], true) as YAMLMap).set("facts", facts);
  }

  const now = new Date().toISOString();

  for (const item of facts.items as YAMLMap[]) {
    if (item.get("id") === id) {
      item.set("text", q(text));
      item.set("verification_status", q("unverified"));
      doc.set("last_etched", q(now));
      writeFileSync(path, doc.toString(OUT));
      return;
    }
  }

  facts.add(
    factMap({
      text,
      id,
      type: "session",
      priority: "standard",
      source: "remember()",
      verification_status: "unverified",
    }),
  );
  doc.set("last_etched", q(now));
  writeFileSync(path, doc.toString(OUT));
}

/** Remove a fact by id. Returns true if one was removed. */
export function forget(path: string, id: string): boolean {
  const doc = load(path);
  const facts = doc.getIn(["memory", "facts"], true) as YAMLSeq | undefined;
  if (!facts) return false;

  const idx = (facts.items as YAMLMap[]).findIndex((it) => it.get("id") === id);
  if (idx === -1) return false;

  facts.delete(idx);
  doc.set("last_etched", q(new Date().toISOString()));
  writeFileSync(path, doc.toString(OUT));
  return true;
}

function normFact(f: unknown): MemoryFact {
  const o = (f ?? {}) as Record<string, unknown>;
  return {
    id: String(o.id ?? ""),
    text: String(o.text ?? ""),
    type: o.type as string | undefined,
    priority: o.priority as string | undefined,
    tags: Array.isArray(o.tags) ? o.tags.map(String) : undefined,
    source: o.source as string | undefined,
    verification_status: o.verification_status as string | undefined,
  };
}
