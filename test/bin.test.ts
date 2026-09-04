import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { flagValue, resolveLaunch } from "../src/bin.js";
import { ROOT } from "../src/server.js";

test("resolveLaunch: no args, no env → stdio at the package root", () => {
  const l = resolveLaunch([], {});
  assert.equal(l.mode, "stdio");
  assert.equal(l.root, ROOT);
});

test("resolveLaunch: --http → http on the default port", () => {
  assert.deepEqual(resolveLaunch(["--http"], {}), { mode: "http", port: 3000, root: ROOT });
});

test("resolveLaunch: PORT set → http on that port (the hosted-deploy path)", () => {
  const l = resolveLaunch([], { PORT: "8080" });
  assert.equal(l.mode, "http");
  assert.equal(l.port, 8080);
});

test("resolveLaunch: --stdio wins over PORT", () => {
  assert.equal(resolveLaunch(["--stdio"], { PORT: "8080" }).mode, "stdio");
});

test("resolveLaunch: empty / non-numeric / non-positive PORT → stdio", () => {
  for (const PORT of ["", "not-a-port", "0", "-1"]) {
    assert.equal(resolveLaunch([], { PORT }).mode, "stdio", `PORT=${JSON.stringify(PORT)}`);
  }
});

test("resolveLaunch: MCP_CONTEXT_CARD_ROOT is resolved to an absolute path", () => {
  const l = resolveLaunch([], { MCP_CONTEXT_CARD_ROOT: "./some/where" });
  assert.equal(l.root, resolve("./some/where"));
  assert.equal(l.mode, "stdio");
});

test("resolveLaunch: --http + MCP_CONTEXT_CARD_ROOT compose", () => {
  const l = resolveLaunch(["--http"], { MCP_CONTEXT_CARD_ROOT: "srv/proj", PORT: "9000" });
  assert.deepEqual(l, { mode: "http", port: 9000, root: resolve("srv/proj") });
});

test("resolveLaunch: `card` → card mode, root is the cwd", () => {
  const l = resolveLaunch(["card"], {});
  assert.equal(l.mode, "card");
  assert.equal(l.root, process.cwd());
});

test("resolveLaunch: `card` honours MCP_CONTEXT_CARD_ROOT over cwd", () => {
  const l = resolveLaunch(["card", "--theme", "dark"], { MCP_CONTEXT_CARD_ROOT: "x/y" });
  assert.equal(l.mode, "card");
  assert.equal(l.root, resolve("x/y"));
});

test("flagValue: reads `--flag value`, else undefined", () => {
  assert.equal(flagValue(["card", "--theme", "light"], "--theme"), "light");
  assert.equal(flagValue(["card", "--theme"], "--theme"), undefined);
  assert.equal(flagValue(["card"], "--accent"), undefined);
});
