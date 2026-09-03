import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fromString, findSection, parseAgentsMd } from "../src/agents-md.js";
import { REPO_ROOT } from "./helpers.js";

const SAMPLE = `Intro line before any heading.

# Title

top matter

## Setup

\`\`\`bash
npm ci
\`\`\`

## Testing

run \`npm test\`

### Coverage

90% lines

## Safety

be careful
`;

test("fromString: splits into sections by heading, keeps the preamble", () => {
  const doc = fromString(SAMPLE);
  assert.equal(doc.preamble, "Intro line before any heading.");
  assert.deepEqual(
    doc.sections.map((s) => s.heading),
    ["Title", "Setup", "Testing", "Coverage", "Safety"],
  );
});

test("fromString: a section body stops at the next heading", () => {
  const doc = fromString(SAMPLE);
  const testing = doc.sections.find((s) => s.heading === "Testing")!;
  assert.equal(testing.body, "run `npm test`");
  assert.equal(testing.level, 2);
});

test("fromString: `#` lines inside a fenced block are not headings", () => {
  const doc = fromString("## A\n\n```sh\n# this is a shell comment\n```\n\n## B\n");
  assert.deepEqual(doc.sections.map((s) => s.heading), ["A", "B"]);
  assert.match(doc.sections[0].body, /# this is a shell comment/);
});

test("findSection: exact, then prefix, then substring — case-insensitive", () => {
  const doc = fromString(SAMPLE);
  assert.equal(findSection(doc, "setup")?.heading, "Setup");
  assert.equal(findSection(doc, "test")?.heading, "Testing"); // prefix
  assert.equal(findSection(doc, "careful")?.heading, undefined); // not in a heading
  assert.equal(findSection(doc, "safe")?.heading, "Safety");
  assert.equal(findSection(doc, ""), null);
});

test("parseAgentsMd: reads the repo's own AGENTS.md", () => {
  const doc = parseAgentsMd(join(REPO_ROOT, "AGENTS.md"));
  assert.ok(doc);
  const headings = doc.sections.map((s) => s.heading);
  for (const h of ["Setup", "Build", "Test", "Safety", "Definition of done"]) {
    assert.ok(headings.includes(h), `missing "${h}"`);
  }
});

test("parseAgentsMd: missing file → null", () => {
  assert.equal(parseAgentsMd("/no/such/AGENTS.md"), null);
});

test("fromString: a file with no headings is all preamble", () => {
  const doc = fromString("just some text\nand more\n");
  assert.equal(doc.sections.length, 0);
  assert.equal(doc.preamble, "just some text\nand more");
});
