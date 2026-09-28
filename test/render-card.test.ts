import { test } from "node:test";
import assert from "node:assert/strict";
import { AAIF_ACCENT, renderCard, renderCardText, safeAccent } from "../src/render-card.js";
import { fixture } from "./helpers.js";

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
    // every remembered fact, whole
    assert.match(md, /\*\*Memory\*\* · 4 facts/);
    assert.ok(md.includes("The context concern points at AGENTS.md"));
    // discovery: the three concerns and their media types
    for (const t of ["text/markdown", "application/vnd.fafm+yaml", "application/vnd.fafa+yaml"]) {
      assert.ok(md.includes(t), `missing media type: ${t}`);
    }
    assert.ok(!/<[a-z]/i.test(md.replace(/`[^`]*`/g, "")), "plain Markdown, no HTML");
  } finally {
    cleanup();
  }
});
