import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderInline, renderMarkdown, slug } from "../src/md.js";

test("escapeHtml: neutralises the four dangerous chars", () => {
  assert.equal(escapeHtml(`<a href="x">&`), "&lt;a href=&quot;x&quot;&gt;&amp;");
});

test("slug: kebab, alnum only", () => {
  assert.equal(slug("The invariant!"), "the-invariant");
  assert.equal(slug("Definition of done"), "definition-of-done");
});

test("renderInline: code span > bold > italic, and escapes around them", () => {
  assert.equal(
    renderInline("a **b** and *c* and `d<e>` and <f>"),
    "a <strong>b</strong> and <em>c</em> and <code>d&lt;e&gt;</code> and &lt;f&gt;",
  );
});

test("renderInline: only safe link schemes; others degrade to text", () => {
  assert.equal(renderInline("[x](https://ok.dev)"), '<a href="https://ok.dev">x</a>');
  assert.equal(renderInline("[x](javascript:alert)"), "x");
  assert.equal(renderInline("[x](#anchor)"), '<a href="#anchor">x</a>');
  assert.equal(renderInline("[x](./rel/path)"), '<a href="./rel/path">x</a>');
});

test("renderMarkdown: headings get ids", () => {
  assert.match(renderMarkdown("## Build\n"), /<h2 id="build">Build<\/h2>/);
});

test("renderMarkdown: fenced code is escaped and not re-parsed", () => {
  const html = renderMarkdown("```sh\n# not a heading\n<script>\n```\n");
  assert.match(html, /<pre><code class="language-sh"># not a heading\n&lt;script&gt;<\/code><\/pre>/);
});

test("renderMarkdown: nested list", () => {
  const html = renderMarkdown("- a\n- b\n  - b1\n");
  assert.equal(html, "<ul><li>a</li><li>b<ul><li>b1</li></ul></li></ul>");
});

test("renderMarkdown: ordered list", () => {
  assert.match(renderMarkdown("1. one\n2. two\n"), /^<ol><li>one<\/li><li>two<\/li><\/ol>$/);
});

test("renderMarkdown: GFM table", () => {
  const html = renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n");
  assert.equal(
    html,
    "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
  );
});

test("renderMarkdown: blockquote, hr, paragraph", () => {
  assert.match(renderMarkdown("> quoted\n"), /<blockquote><p>quoted<\/p><\/blockquote>/);
  assert.equal(renderMarkdown("---\n"), "<hr>");
  assert.equal(renderMarkdown("just text\nwrapped\n"), "<p>just text wrapped</p>");
});

test("renderMarkdown: raw HTML in prose is escaped, never passed through", () => {
  assert.ok(!renderMarkdown("hi <img src=x onerror=y>\n").includes("<img"));
});
