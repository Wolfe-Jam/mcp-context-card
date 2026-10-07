/**
 * The business card (1.6.0): front = name · title · one-liner; flip for the
 * back's tabs. Title and skills come from the project's own .fafa, the way
 * `faf card init` writes it (endpoints, capabilities, metadata.cards.packages).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardInitials, cardKind, cardOneLiner, cardTitle, readCard, renderBusinessCard, renderCard } from "../src/render-card.js";
import { parseFafa } from "../src/faf/parse-fafa.js";
import { fixture } from "./helpers.js";

/** A project whose only file is the given .fafa. */
function withFafa(yaml: string, fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "bcard-"));
  try {
    writeFileSync(join(root, "agent.fafa"), yaml);
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("title: what it is, from where it runs, then the version", () => {
  assert.deepEqual(cardKind(null), []);
  assert.equal(cardTitle(null), "");
  assert.equal(cardTitle({ agentVersion: "2.0.0" }), "v2.0.0");
  assert.equal(cardTitle({ endpoints: [{ protocol: "a2a" }], agentVersion: "1.0.0" }), "A2A agent · v1.0.0");
  assert.equal(cardTitle({ endpoints: [{ protocol: "mcp" }] }), "MCP server");
  assert.equal(cardTitle({ packages: [{ registryType: "npm", identifier: "x" }] }), "MCP server");
  assert.equal(
    cardTitle({ endpoints: [{ protocol: "a2a" }, { protocol: "mcp" }], agentVersion: "3.1.0" }),
    "A2A agent · MCP server · v3.1.0",
  );
});

test("one-liner: a short description whole; a long first sentence stops at its first natural pause", () => {
  assert.equal(cardOneLiner({ description: "Weather for agents. Also tides." }), "Weather for agents. Also tides.");
  const long =
    "The essential MCP components for a project's context (AGENTS.md), cross-session memory, and identity — a base MCP on its own, or a drop-in extension for any existing MCP server";
  assert.equal(
    cardOneLiner({ description: long }),
    "The essential MCP components for a project's context (AGENTS.md), cross-session memory, and identity",
  );
  assert.equal(cardOneLiner(null), "");
});

test("the parser reads endpoints, capabilities and packages as faf card init writes them", () => {
  withFafa(
    `version: "1.0"
agent: { name: wx, version: "1.2.0", description: "Weather." }
endpoints: [{ protocol: A2A, location: "https://wx.example.com/a2a" }, { location: "no protocol" }]
capabilities: [{ name: forecast, description: "Five-day forecast" }, { description: "unnamed" }]
metadata: { cards: { packages: [{ registryType: npm, identifier: wx-mcp }] } }
`,
    (root) => {
      const id = parseFafa(join(root, "agent.fafa"))!;
      assert.deepEqual(id.endpoints, [{ protocol: "a2a", location: "https://wx.example.com/a2a" }]);
      assert.deepEqual(id.skills, [{ name: "forecast", description: "Five-day forecast" }]);
      assert.deepEqual(id.packages, [{ registryType: "npm", identifier: "wx-mcp" }]);
      assert.equal(cardTitle(id), "A2A agent · MCP server · v1.2.0");
    },
  );
});

test("front: name, title, one-liner; the version shows once, in the title", () => {
  const { root, cleanup } = fixture();
  try {
    const html = renderCard(root);
    const front = html.slice(html.indexOf('class="face front"'), html.indexOf('class="face back"'));
    assert.match(front, /<h1>mcp-context-card<\/h1>/);
    assert.match(front, /<p class="title">MCP server · v1\.5\.0<\/p>/);
    assert.match(front, /<p class="oneliner">The essential MCP components/);
    assert.equal((front.match(/v1\.5\.0/g) ?? []).length, 1);
    assert.match(front, /<span class="domain">faf\.one<\/span>/);
    assert.match(front, /<label for="flip" class="flipbtn" data-tip="Flip the card"[^>]*aria-label="Flip the card"><span aria-hidden="true">↻<\/span><\/label>/);
    assert.match(front, /<details class="whatis">[\s\S]*Business Cards for Agents/);
    const back = html.slice(html.indexOf('class="face back"'));
    assert.match(back, /<details class="whatis">[\s\S]*Business Cards for Agents/); // (i) on both faces
    assert.match(back, /class="flipbtn back-btn"/); // flip on both faces, same spot
    assert.match(html, /class="flipbtn back-btn"[^>]*aria-label="Flip back"><span aria-hidden="true">↺<\/span><\/label>/);
  } finally {
    cleanup();
  }
});

test("back: tabs, with Skills only when the .fafa lists capabilities", () => {
  const { root, cleanup } = fixture();
  try {
    const html = renderCard(root);
    for (const t of ["about", "context", "memory", "discovery"]) assert.match(html, new RegExp(`id="t-${t}"`));
    assert.doesNotMatch(html, /id="t-skills"/);
  } finally {
    cleanup();
  }
  withFafa(`agent: { name: wx }\ncapabilities: [{ name: forecast }, { name: tides }]\n`, (root) => {
    const html = renderCard(root);
    assert.match(html, /<label for="t-skills">Skills<\/label>/);
    assert.match(html, /<b>forecast<\/b>/);
  });
});

test("flip, tabs and the view toggle are CSS: no script needed, and portrait is an option", () => {
  const { root, cleanup } = fixture();
  try {
    const html = renderCard(root);
    assert.match(html, /<input type="checkbox" id="flip" class="sr"/);
    assert.match(html, /<input type="checkbox" id="portrait" class="sr" aria-label="Portrait view">/);
    assert.match(html, /#flip:checked~\.stage \.faces\{transform:rotateY\(180deg\)\}/);
    assert.match(html, /#t-about:checked~\.panes \.p-about/);
    // the face turned away takes no wheel or pointer events, so the back scrolls (macOS Chrome/Safari)
    assert.match(html, /#flip:checked~\.stage \.front,#flip:not\(:checked\)~\.stage \.back\{pointer-events:none/);
    assert.match(renderCard(root, { layout: "portrait" }), /id="portrait" class="sr" aria-label="Portrait view" checked>/);
    assert.match(renderCard(root, { expanded: true }), /<body class="flat">/);
  } finally {
    cleanup();
  }
});

test("markup in the .fafa can't reach either face", () => {
  withFafa(
    `agent:
  name: "<script>alert(1)</script>"
  description: "<img src=x onerror=alert(2)> weather"
capabilities: [{ name: "<b>x</b>", description: "<iframe src=//evil>" }]
endpoints: [{ protocol: a2a, location: "javascript:alert(3)" }]
`,
    (root) => {
      const html = renderCard(root);
      assert.ok(!html.includes("<script>alert(1)"), "name");
      assert.ok(!/<img[^>]+onerror=/i.test(html), "description");
      assert.ok(!html.includes("<iframe"), "skill description");
      assert.ok(!html.includes("<b>x</b>") || html.includes("<b>&lt;b&gt;x&lt;/b&gt;</b>"), "skill name");
      assert.ok(!/href="javascript:/i.test(html), "endpoint is shown as text, never a link");
      assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    },
  );
});

test("logo: a monogram from the name's first two words, top-left on the front", () => {
  assert.equal(cardInitials("mcp-context-card"), "MC");
  assert.equal(cardInitials("Weather Agent"), "WA");
  assert.equal(cardInitials("faf"), "F");
  assert.equal(cardInitials("@scope/pkg_name"), "SP");
  assert.equal(cardInitials("élan vital"), "ÉV");
  withFafa(`agent: { name: "<x> y" }\n`, (root) => {
    const html = renderCard(root);
    assert.match(html, /<div class="logo" aria-hidden="true">XY<\/div>/);
  });
});

test("read and render are separate: readCard gives a neutral card, renderBusinessCard draws any card", () => {
  const { root, cleanup } = fixture();
  try {
    const card = readCard(root);
    assert.equal(card.name, "mcp-context-card");
    assert.equal(card.title, "MCP server · v1.5.0");
    assert.deepEqual(card.tabs.map((t) => t.key), ["about", "context", "memory", "discovery"]);
    assert.ok(card.chips.some((c) => c.accent && c.text === "published"));
    assert.equal(renderCard(root), renderBusinessCard(card)); // renderCard = read, then draw
  } finally {
    cleanup();
  }
  // A person's card, from nothing but the neutral shape: same renderer, own tabs.
  const html = renderBusinessCard({
    name: "Ada Lovelace",
    title: "Analyst",
    oneLiner: "Notes on the Analytical Engine.",
    chips: [{ text: "London" }],
    tabs: [
      { key: "about", label: "About", heading: "About", html: "<p>First program.</p>" },
      { key: "Work!", label: "Work", heading: "Work", html: "<p>Note G.</p>" },
    ],
    about: "<p>A person's business card.</p>",
  });
  assert.match(html, /<div class="logo" aria-hidden="true">AL<\/div>/);
  assert.match(html, /<p class="title">Analyst<\/p>/);
  assert.match(html, /id="t-work"/); // keys are cleaned to [a-z0-9-]
  assert.match(html, /#t-work:checked~\.panes \.p-work\{display:block\}/); // tab CSS follows the card's own tabs
  assert.doesNotMatch(html, /t-memory|t-discovery/);
});
