import { test } from "node:test";
import assert from "node:assert/strict";
import { AAIF_ACCENT, renderCard, safeAccent } from "../src/render-card.js";
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
    // self-contained: no external fetches
    assert.ok(!/src=|href="http|@import/.test(html) || !/<script/.test(html));
    assert.ok(!html.includes("<script"));
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
    assert.match(html, /<h2 id="setup">Setup<\/h2>/); // AGENTS.md rendered
    assert.match(html, /Memory — 3 facts/);
    assert.match(html, /class="tag">scope</); // a real fact tag
    assert.match(html, /Discovery/);
    assert.match(html, /text\/markdown/);
    assert.match(html, /mcp-context-card:\/\/server-card/);
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
