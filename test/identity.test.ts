import { test } from "node:test";
import assert from "node:assert/strict";
import { identity, trinityMeta, whoami } from "../src/identity.js";
import { fixture } from "./helpers.js";

test("identity: parses this server's own .fafa", () => {
  const { root, cleanup } = fixture();
  try {
    const id = identity(root);
    assert.equal(id?.name, "mcp-trinity");
  } finally {
    cleanup();
  }
});

test("whoami: one-line summary, falls back on missing card", () => {
  const { root, cleanup } = fixture();
  try {
    const s = whoami(root);
    assert.ok(s.includes("mcp-trinity"));
    assert.ok(s.includes("MIT"));
    assert.equal(whoami("/no/such/root").startsWith("(no .well-known/fafa"), true);
  } finally {
    cleanup();
  }
});

test("trinityMeta: three namespaced keys, each typed + IANA-anchored", () => {
  const m = trinityMeta();
  assert.deepEqual(Object.keys(m), [
    "one.faf/context",
    "one.faf/memory",
    "one.faf/agent",
  ]);
  assert.equal(m["one.faf/context"].mediaType, "application/vnd.faf+yaml");
  assert.equal(m["one.faf/memory"].mediaType, "application/vnd.fafm+yaml");
  assert.equal(m["one.faf/agent"].mediaType, "application/vnd.fafa+yaml");
  for (const v of Object.values(m)) {
    assert.ok(v.iana.startsWith("https://www.iana.org/assignments/media-types/"));
  }
});
