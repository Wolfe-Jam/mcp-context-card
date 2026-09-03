import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolveLaunch } from "../src/bin.js";
import { ROOT } from "../src/server.js";

test("resolveLaunch: no args, no env → stdio at the package root", () => {
  const l = resolveLaunch([], {});
  assert.equal(l.http, false);
  assert.equal(l.root, ROOT);
});

test("resolveLaunch: --http → http on the default port", () => {
  assert.deepEqual(resolveLaunch(["--http"], {}), { http: true, port: 3000, root: ROOT });
});

test("resolveLaunch: PORT set → http on that port (the hosted-deploy path)", () => {
  const l = resolveLaunch([], { PORT: "8080" });
  assert.equal(l.http, true);
  assert.equal(l.port, 8080);
});

test("resolveLaunch: --stdio wins over PORT", () => {
  const l = resolveLaunch(["--stdio"], { PORT: "8080" });
  assert.equal(l.http, false);
});

test("resolveLaunch: empty / non-numeric / non-positive PORT → stdio", () => {
  for (const PORT of ["", "not-a-port", "0", "-1"]) {
    assert.equal(resolveLaunch([], { PORT }).http, false, `PORT=${JSON.stringify(PORT)}`);
  }
});

test("resolveLaunch: MCP_TRINITY_ROOT is resolved to an absolute path", () => {
  const l = resolveLaunch([], { MCP_TRINITY_ROOT: "./some/where" });
  assert.equal(l.root, resolve("./some/where"));
  assert.equal(l.http, false);
});

test("resolveLaunch: --http + MCP_TRINITY_ROOT compose", () => {
  const l = resolveLaunch(["--http"], { MCP_TRINITY_ROOT: "srv/proj", PORT: "9000" });
  assert.deepEqual(l, { http: true, port: 9000, root: resolve("srv/proj") });
});
