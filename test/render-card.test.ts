import { test } from "node:test";
import assert from "node:assert/strict";
import { AAIF_ACCENT, clip, renderCard, renderCardText, safeAccent } from "../src/render-card.js";
import { fixture } from "./helpers.js";
import { join } from "node:path";
import { remember } from "../src/memory.js";

test("safeAccent: valid hex passes, anything else falls back to AAIF", () => {
  assert.equal(safeAccent("#0A7"), "#0A7");
  assert.equal(safeAccent("#0066cc"), "#0066cc");
  assert.equal(safeAccent("#12345678"), "#12345678");
  assert.equal(safeAccent("red"), AAIF_ACCENT);
  assert.equal(safeAccent("#fff</style><script>"), AAIF_ACCENT);
  assert.equal(safeAccent(undefined), AAIF_ACCENT);
});

test("renderCard: a complete, self-contained HTML document", () => {
  const { root, cleanup } = fixture();
  try {
    const html = renderCard(root);
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<title>mcp-context-card — context card<\/title>/);
    // self-contained: nothing loaded from the network — no external script,
    // stylesheet, font or image. The one <script> is inline (the toggle helper).
    assert.ok(!/<script[^>]+\bsrc=/.test(html), "no external script");
    assert.ok(!/\bhref="https?:|@import|<link\b/.test(html), "no external stylesheet/link");
    assert.ok(!/<img\b|\bsrc="https?:/.test(html), "no external image");
    // the AAIF accent by default
    assert.ok(html.includes(AAIF_ACCENT));
  } finally {
    cleanup();
  }
});

test("renderCard: renders all three concerns from the real sources", () => {
  const { root, cleanup } = fixture();
  try {
    const html = renderCard(root);
    assert.match(html, /Context — AGENTS\.md/);
    assert.match(html, /class="toc"/); // section index
    // AGENTS.md sections render as collapsible <details>, one per heading
    assert.match(html, /<details class="ctx-section" id="setup"><summary>Setup<\/summary>/);
    assert.match(html, /Memory — 4 facts/);
    assert.match(html, /class="tag">scope</); // a real fact tag
    assert.match(html, /Discovery/);
    assert.match(html, /text\/markdown/);
    assert.match(html, /mcp-context-card:\/\/server-card/);
  } finally {
    cleanup();
  }
});

test("renderCard: sections collapse by default; expanded opens them all", () => {
  const { root, cleanup } = fixture();
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
  try {
    const collapsed = renderCard(root);
    const expanded = renderCard(root, { expanded: true });

    const sections = count(collapsed, /<details class="ctx-section"/g);
    assert.ok(sections >= 3, "the fixture AGENTS.md has several sections");

    // default: not one <details> carries `open`
    assert.equal(count(collapsed, /<details class="ctx-section" open/g), 0);
    // expanded: every one does
    assert.equal(count(expanded, /<details class="ctx-section" open/g), sections);

    // the expand-all control: a button, hidden until the inline script un-hides
    // it (progressive enhancement — native <details> works without JS)
    assert.match(collapsed, /<button type="button" class="xall" hidden>Expand all<\/button>/);
    assert.match(expanded, /<button type="button" class="xall" hidden>Collapse all<\/button>/);
    // exactly one inline script, nothing external
    assert.equal(count(collapsed, /<script>/g), 1);
    assert.ok(!/<script[^>]+src=/.test(collapsed));

    // toc anchors resolve to the section ids
    const hrefs = [...collapsed.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    const ids = [...collapsed.matchAll(/<details class="ctx-section"[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, ids);
  } finally {
    cleanup();
  }
});

test("renderCard: theme option sets data-theme on <html>; auto leaves it off", () => {
  const { root, cleanup } = fixture();
  const htmlTag = (s: string) => s.match(/<html[^>]*>/)![0];
  try {
    assert.equal(htmlTag(renderCard(root, { theme: "dark" })), '<html lang="en" data-theme="dark">');
    assert.equal(htmlTag(renderCard(root, { theme: "light" })), '<html lang="en" data-theme="light">');
    assert.equal(htmlTag(renderCard(root, { theme: "auto" })), '<html lang="en">');
  } finally {
    cleanup();
  }
});

test("renderCard: a bogus accent never reaches the stylesheet", () => {
  const { root, cleanup } = fixture();
  try {
    const html = renderCard(root, { accent: "#abc</style><script>alert(1)</script>" });
    assert.ok(!html.includes("<script>alert"));
    assert.ok(html.includes(`--accent:${AAIF_ACCENT}`));
  } finally {
    cleanup();
  }
});

test("renderCard: handles a project with no AGENTS.md / no facts", () => {
  const { root, cleanup } = fixture();
  try {
    // point at an empty subdir via a fresh fixture that we strip
    const html = renderCard(root + "/does-not-exist");
    assert.match(html, /No AGENTS\.md in this project/);
    assert.match(html, /Memory — 0 facts/);
    assert.match(html, /No facts yet/);
  } finally {
    cleanup();
  }
});

test("renderCardText: the card as Markdown — identity, AGENTS.md headings, memory, discovery", () => {
  const { root, cleanup } = fixture();
  try {
    const md = renderCardText(root);
    assert.match(md, /^### mcp-context-card — context card/);
    assert.match(md, /io\.github\.Wolfe-Jam · v\d+\.\d+\.\d+ · published · MIT/);
    // every AGENTS.md section heading, and none of their bodies
    for (const h of ["Setup", "Build", "Test", "Layout", "Safety", "Definition of done"]) {
      assert.ok(md.includes(h), `missing section: ${h}`);
    }
    assert.match(md, /\*\*Context — AGENTS\.md\*\* · 9 sections/);
    assert.ok(!md.includes("npm install"), "section bodies stay in the full card");
    // tl;dr by default: each fact cut short, the full text stays in the card
    assert.match(md, /\*\*Memory\*\* · 4 facts/);
    assert.ok(md.includes("The context concern points at AGENTS.md"));
    assert.ok(!md.includes("one instantiation each"), "the default cuts long facts short");
    // detail: "full" — every fact whole
    const full = renderCardText(root, { detail: "full" });
    assert.ok(full.includes("so this server uses .fafm and .fafa as one instantiation each."));
    // discovery: the three concerns and their media types
    for (const t of ["text/markdown", "application/vnd.fafm+yaml", "application/vnd.fafa+yaml"]) {
      assert.ok(md.includes(t), `missing media type: ${t}`);
    }
    assert.ok(!/<[a-z]/i.test(md.replace(/`[^`]*`/g, "")), "plain Markdown, no HTML");
  } finally {
    cleanup();
  }
});

test("renderCardText: the tl;dr stays small however much memory a project has", () => {
  const { root, cleanup } = fixture();
  try {
    for (let i = 0; i < 60; i++) {
      remember(join(root, "project.fafm"), `bulk-${i}`, `Fact number ${i}: ${"a long remembered detail ".repeat(15)}`);
    }
    const md = renderCardText(root);
    assert.match(md, /\*\*Memory\*\* · 64 facts/);
    assert.equal((md.match(/^- /gm) ?? []).length, 5, "the tl;dr lists five facts");
    assert.match(md, /…and 59 more facts, in the full card/);
    assert.ok(md.length < 3000, `tl;dr grew to ${md.length} chars`);

    const full = renderCardText(root, { detail: "full" });
    assert.equal((full.match(/^- /gm) ?? []).length, 64, "full lists every fact");
  } finally {
    cleanup();
  }
});

test("clip: whole first sentence when it fits, else a word-boundary cut with …", () => {
  // short enough → untouched
  assert.equal(clip("Short fact.", 160), "Short fact.");
  // first sentence fits → exactly that sentence, no ellipsis, nothing reworded
  const two = "The first sentence is the point. " + "The second one adds detail ".repeat(10);
  assert.equal(clip(two, 160), "The first sentence is the point.");
  // a dot inside a name or version isn't a sentence end
  assert.equal(clip("Ships AGENTS.md and project.fafm v1.2 today. " + "x ".repeat(100), 160), "Ships AGENTS.md and project.fafm v1.2 today.");
  // first sentence too long → cut at a word boundary, marked with …
  const long = "word ".repeat(60);
  const c = clip(long, 160);
  assert.ok(c.endsWith("…") && c.length <= 161 && !c.includes("wor…"), c);
});

test("renderCardText: tl;dr facts are whole stored sentences", () => {
  const { root, cleanup } = fixture();
  try {
    const md = renderCardText(root);
    // this repo's first fact: its first sentence, verbatim, no ellipsis
    assert.ok(md.includes("- The context concern points at AGENTS.md — the de-facto standard for agent instructions. ✓"), md);
  } finally {
    cleanup();
  }
});

test("renderCardText: a project with no AGENTS.md points at the next step, not a dead end", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "mcp-cc-noagents-"));
  try {
    const md = renderCardText(dir);
    assert.match(md, /\*\*Context — AGENTS\.md\*\* · none yet/);
    assert.match(md, /author_agents_md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
