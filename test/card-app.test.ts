/**
 * The card's MCP Apps script, run against a stub host. No real host: the
 * script's postMessage is the wire, and the stub answers ui/initialize.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderCard } from "../src/render-card.js";
import { fixture } from "./helpers.js";

function scriptOf(html: string): string {
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(m, "the card has one inline script");
  return m[1];
}

type Wire = { jsonrpc?: string; id?: number; method?: string; params?: Record<string, unknown>; result?: unknown };

function run(js: string, framed: boolean) {
  const messages: Wire[] = [];
  const listeners: Array<(ev: { data: unknown; source: unknown }) => void> = [];
  const documentElement = {
    style: { height: "" },
    getBoundingClientRect: () => ({ height: 480, width: 640, top: 0, left: 0, bottom: 480, right: 640 }),
    setAttribute() {},
    classList: { contains: () => false },
  };
  const document = {
    documentElement,
    body: { style: {} },
    head: { appendChild() {} },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ id: "", textContent: "", style: {} }),
  };
  const sandbox = vm.createContext({
    console: { debug() {}, log() {}, info() {}, warn: console.warn, error: console.error },
    Promise,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    structuredClone,
    AbortController,
    atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),
    document,
    location: {
      hash: "",
      search: "",
      origin: "https://card.invalid",
      pathname: "/card.html",
      href: "https://card.invalid/card.html",
    },
    navigator: { userAgent: "stub" },
    innerWidth: 640,
    requestAnimationFrame: (cb: (t: number) => void) => {
      cb(0);
      return 0;
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
    addEventListener(type: string, fn: (ev: { data: unknown; source: unknown }) => void) {
      if (type === "message") listeners.push(fn);
    },
    removeEventListener() {},
    getComputedStyle: () => ({}),
  }) as Record<string, unknown>;
  const parent = framed
    ? { postMessage(data: Wire) { messages.push(data); } }
    : sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.parent = parent;
  sandbox.document = document;
  sandbox.postMessage = (data: Wire) => messages.push(data);
  vm.runInContext(js, sandbox);
  return {
    messages,
    reply(data: unknown) {
      for (const fn of listeners) fn({ data, source: parent });
    },
  };
}

async function until(pred: () => boolean, ms = 1500) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) return false;
    await new Promise((r) => setTimeout(r, 10));
  }
  return true;
}

test("card html bundles the size message and stays one self-contained file", () => {
  const { root, cleanup } = fixture();
  try {
    const html = renderCard(root);
    assert.equal((html.match(/<script>/g) ?? []).length, 1);
    assert.ok(!/<script[^>]+\bsrc=/.test(html));
    assert.match(html, /ui\/initialize/);
    assert.match(html, /ui\/notifications\/size-changed/);
    // the card is already drawn before the script: progressive enhancement
    const scriptAt = html.indexOf("<script>");
    assert.ok(html.slice(0, scriptAt).includes('class="bcard"'));
  } finally {
    cleanup();
  }
});

test("no host: the script sends nothing", async () => {
  const { root, cleanup } = fixture();
  try {
    const host = run(scriptOf(renderCard(root)), false);
    const spoke = await until(() => host.messages.length > 0, 200);
    assert.equal(spoke, false);
    assert.equal(host.messages.length, 0);
  } finally {
    cleanup();
  }
});

test("stub host: initialize, then a size-changed message", async () => {
  const { root, cleanup } = fixture();
  try {
    const host = run(scriptOf(renderCard(root)), true);
    assert.ok(await until(() => host.messages.some((m) => m.method === "ui/initialize")), "no ui/initialize");
    const init = host.messages.find((m) => m.method === "ui/initialize")!;
    assert.equal(init.params?.appInfo && (init.params.appInfo as { name: string }).name, "mcp-context-card");
    host.reply({
      jsonrpc: "2.0",
      id: init.id,
      result: {
        protocolVersion: init.params?.protocolVersion,
        hostInfo: { name: "stub-host", version: "0" },
        hostCapabilities: {},
        hostContext: { displayMode: "inline", availableDisplayModes: ["inline"] },
      },
    });
    assert.ok(
      await until(() => host.messages.some((m) => m.method === "ui/notifications/size-changed")),
      `no size message; saw ${host.messages.map((m) => m.method).join(", ")}`,
    );
    const size = host.messages.find((m) => m.method === "ui/notifications/size-changed")!;
    assert.equal(size.params?.width, 640);
    assert.equal(size.params?.height, 480);
    assert.ok(host.messages.some((m) => m.method === "ui/notifications/initialized"));
  } finally {
    cleanup();
  }
});
