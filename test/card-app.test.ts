/**
 * The card's MCP Apps script, run against a stub host. No real host: the
 * script's postMessage is the wire, and the stub answers ui/initialize.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderAppsCard, renderCard } from "../src/render-card.js";
import { fixture } from "./helpers.js";

/** The helper's own inline script (the card's toggle script is separate). */
function scriptOf(html: string): string {
  const m = html.match(/<script data-card-app>([\s\S]*?)<\/script>/);
  assert.ok(m, "the ui:// card has the helper script");
  return m[1];
}

type Wire = { jsonrpc?: string; id?: number; method?: string; params?: Record<string, unknown>; result?: unknown };

type FakeEl = {
  hidden: boolean;
  dataset: Record<string, string>;
  listeners: Record<string, Array<() => void>>;
  addEventListener(type: string, fn: () => void): void;
};

function fakeEl(): FakeEl {
  const el: FakeEl = {
    hidden: true,
    dataset: {},
    listeners: {},
    addEventListener(type: string, fn: () => void) {
      (el.listeners[type] ??= []).push(fn);
    },
  };
  return el;
}

function run(js: string, framed: boolean, withView = false) {
  const messages: Wire[] = [];
  const listeners: Array<(ev: { data: unknown; source: unknown }) => void> = [];
  const documentElement = {
    style: { height: "" },
    dataset: {} as Record<string, string>,
    getBoundingClientRect: () => ({ height: 480, width: 640, top: 0, left: 0, bottom: 480, right: 640 }),
    setAttribute() {},
    classList: { contains: () => false },
  };
  const body = { style: {}, dataset: {} as Record<string, string> };
  const els: Record<string, FakeEl> = withView
    ? { "inline-view": fakeEl(), "open-full-card": fakeEl(), "inline-saved": fakeEl() }
    : {};
  const document = {
    documentElement,
    body,
    head: { appendChild() {} },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: (id: string) => els[id] ?? null,
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
    els,
    documentElement,
    body,
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

test("ui:// card bundles the size message and stays one self-contained file", () => {
  const { root, cleanup } = fixture();
  try {
    const html = renderAppsCard(root);
    assert.doesNotMatch(renderCard(root), /ui\/notifications\/size-changed/);
    // two inline scripts: the card's toggle, then the helper in its own element
    assert.equal((html.match(/<script[\s>]/g) ?? []).length, 2);
    assert.equal((html.match(/<script data-card-app>/g) ?? []).length, 1);
    assert.ok(!/<script[^>]+\bsrc=/.test(html));
    assert.match(html, /ui\/initialize/);
    assert.match(html, /ui\/notifications\/size-changed/);
    assert.match(html, /ui\/request-display-mode/);
    // hidden until a host says the panel is inline; the full card is already drawn
    assert.match(html, /id="inline-view" hidden/);
    assert.match(html, />Open full card<\/button>/);
    assert.match(html, /sections · /);
    assert.match(html, /· identity/);
    assert.match(html, /context-card\.html/);
    const scriptAt = html.indexOf("<script>");
    assert.ok(html.slice(0, scriptAt).includes('class="bcard"'));
    assert.ok(html.slice(0, scriptAt).includes('id="inline-view"'));
  } finally {
    cleanup();
  }
});

test("the helper is its own script: an error in the card's script can't stop it", () => {
  const { root, cleanup } = fixture();
  try {
    const helper = scriptOf(renderAppsCard(root));
    // The card's toggle decodes location.hash, which throws on a malformed hash.
    assert.ok(!helper.includes("location.hash"), "the toggle is not in the helper's script");
  } finally {
    cleanup();
  }
});

test("no host: the script sends nothing", async () => {
  const { root, cleanup } = fixture();
  try {
    const host = run(scriptOf(renderAppsCard(root)), false);
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
    const host = run(scriptOf(renderAppsCard(root)), true);
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

async function connect(host: ReturnType<typeof run>, hostContext: Record<string, unknown>) {
  assert.ok(await until(() => host.messages.some((m) => m.method === "ui/initialize")), "no ui/initialize");
  const init = host.messages.find((m) => m.method === "ui/initialize")!;
  host.reply({
    jsonrpc: "2.0",
    id: init.id,
    result: {
      protocolVersion: init.params?.protocolVersion,
      hostInfo: { name: "stub-host", version: "0" },
      hostCapabilities: {},
      hostContext,
    },
  });
}

test("no host: the inline view stays hidden", async () => {
  const { root, cleanup } = fixture();
  try {
    const host = run(scriptOf(renderAppsCard(root)), false, true);
    const spoke = await until(() => host.messages.length > 0, 200);
    assert.equal(spoke, false);
    assert.equal(host.els["inline-view"].hidden, true);
    assert.equal(host.documentElement.dataset.view, undefined);
  } finally {
    cleanup();
  }
});

test("stub host: inline and pip show the inline view, fullscreen shows the full card", async () => {
  const { root, cleanup } = fixture();
  try {
    const js = scriptOf(renderAppsCard(root));

    const inline = run(js, true, true);
    await connect(inline, { displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"], theme: "dark" });
    assert.ok(await until(() => inline.documentElement.dataset.view === "inline"));
    assert.equal(inline.els["inline-view"].hidden, false);
    assert.equal(inline.body.dataset.theme, "dark");

    const full = run(js, true, true);
    await connect(full, { displayMode: "fullscreen", availableDisplayModes: ["inline", "fullscreen"], theme: "light" });
    assert.ok(await until(() => full.body.dataset.theme === "light"));
    assert.equal(full.els["inline-view"].hidden, true);
    assert.equal(full.documentElement.dataset.view, undefined);

    const pip = run(js, true, true);
    await connect(pip, { displayMode: "pip", availableDisplayModes: ["pip"] });
    assert.ok(await until(() => pip.documentElement.dataset.view === "inline"));
    assert.equal(pip.els["inline-view"].hidden, false);
  } finally {
    cleanup();
  }
});

test("Open full card asks for fullscreen, or offers context-card.html", async () => {
  const { root, cleanup } = fixture();
  try {
    const js = scriptOf(renderAppsCard(root));

    const ok = run(js, true, true);
    await connect(ok, { displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] });
    assert.ok(await until(() => ok.documentElement.dataset.view === "inline"));
    ok.els["open-full-card"].listeners.click?.[0]?.();
    assert.ok(await until(() => ok.messages.some((m) => m.method === "ui/request-display-mode")));
    const req = ok.messages.find((m) => m.method === "ui/request-display-mode")!;
    assert.equal(req.params?.mode, "fullscreen");
    ok.reply({ jsonrpc: "2.0", id: req.id, result: { mode: "fullscreen" } });
    assert.ok(await until(() => ok.els["inline-view"].hidden === true));
    assert.equal(ok.documentElement.dataset.view, undefined);
    assert.equal(ok.els["inline-saved"].hidden, true);

    const denied = run(js, true, true);
    await connect(denied, { displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] });
    assert.ok(await until(() => denied.documentElement.dataset.view === "inline"));
    denied.els["open-full-card"].listeners.click?.[0]?.();
    assert.ok(await until(() => denied.messages.filter((m) => m.method === "ui/request-display-mode").length === 1));
    const req2 = denied.messages.find((m) => m.method === "ui/request-display-mode")!;
    denied.reply({ jsonrpc: "2.0", id: req2.id, result: { mode: "inline" } });
    assert.ok(await until(() => denied.els["inline-saved"].hidden === false));
    assert.equal(denied.documentElement.dataset.view, "inline");

    const stuck = run(js, true, true);
    await connect(stuck, { displayMode: "inline", availableDisplayModes: ["inline"] });
    assert.ok(await until(() => stuck.documentElement.dataset.view === "inline"));
    const n = stuck.messages.length;
    stuck.els["open-full-card"].listeners.click?.[0]?.();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(stuck.messages.length, n);
    assert.equal(stuck.els["inline-saved"].hidden, false);
  } finally {
    cleanup();
  }
});

test("a later fullscreen host context shows the full card", async () => {
  const { root, cleanup } = fixture();
  try {
    const host = run(scriptOf(renderAppsCard(root)), true, true);
    await connect(host, { displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] });
    assert.ok(await until(() => host.documentElement.dataset.view === "inline"));
    host.reply({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { displayMode: "fullscreen" },
    });
    assert.ok(await until(() => host.els["inline-view"].hidden === true), "still the inline view");
    assert.equal(host.documentElement.dataset.view, undefined);
  } finally {
    cleanup();
  }
});
