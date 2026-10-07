# Wiring

1. [Running it in a host](#1-running-it-in-a-host)
2. [The tools in practice](#2-the-tools-in-practice)
3. [Adapting it for your own artifacts](#3-adapting-it)

---

## 1. Running it in a host

### stdio (local)

```jsonc
// claude_desktop_config.json  ·  ~/.cursor/mcp.json  ·  etc.
{
  "mcpServers": {
    "context-card": {
      "command": "npx",
      "args": ["-y", "mcp-context-card"]
    }
  }
}
```

- **Which project.** Unset, a stdio server finds it per call: the host's first
  MCP root (a `file://` directory), then the start directory if it holds an
  `AGENTS.md`, then the server's own bundled copies. A `roots/list_changed`
  notification makes the next call look again. `list_context_sources` reports
  `project: { path, from }`.
- **`MCP_CONTEXT_CARD_ROOT`** — pins the project: a directory holding
  `AGENTS.md`, `project.fafm`, and `.well-known/fafa`. Always wins over roots.
  Over HTTP there are no roots, so it's the only way to pick a project there.
- `stdout` is the JSON‑RPC wire; logging is on `stderr`.
- **`command: "npx"` fails to spawn on some hosts** (`spawn npx ENOENT`) — the
  host's process spawn doesn't inherit a shell `PATH` that has `npx` on it,
  even though a login shell does. Observed with Cursor. Fix: point `command`
  at an absolute path to `node`, with the installed package's `dist/bin.js` as
  the arg — e.g. `command: "node"`, `args: ["/path/to/node_modules/mcp-context-card/dist/bin.js"]`
  (or wherever `npm install -g` / your package manager put it; find it with
  `npm root -g` or `which mcp-context-card` after a global install).
- **`@modelcontextprotocol/inspector` 2.x reports `prompts/list` as `{ "prompts": [] }`** —
  this server declares only `tools` + `resources`, so `prompts/list` returns
  `-32601` on the wire; the current Inspector CLI masks that as an empty list
  (raw JSON-RPC, or Inspector 0.21.x, shows the real `-32601`).

### Streamable HTTP (remote)

```bash
HOST=0.0.0.0 PORT=8080 npx mcp-context-card   # exposed; without HOST it binds 127.0.0.1 only
```

```jsonc
{ "mcpServers": { "context-card": { "url": "https://your-host.example/mcp" } } }
```

Stateless — any replica serves any request, no session store. Rationale in
[TRANSPORT.md](./TRANSPORT.md).

---

## 2. The tools in practice

A client that just connected wants the project's conventions — but not the whole
`AGENTS.md` in its context window:

```ts
// what's documented?
await client.callTool({ name: "list_agents_md_sections", arguments: {} });
// → [{ "heading": "Setup", "level": 2 }, { "heading": "Test", "level": 2 }, …]

// pull just the one it needs
await client.callTool({ name: "read_agents_md", arguments: { section: "Test" } });
// → "## Test\n\n```bash\nnpm test\n```\n…"
```

Between sessions, carry a fact forward:

```ts
await client.callTool({ name: "remember", arguments: { id: "db-migration", text: "run `npm run migrate` before tests since #412" } });
// next session, different process:
await client.callTool({ name: "recall", arguments: { id: "db-migration" } });
// → "run `npm run migrate` before tests since #412"
```

And to discover what a server offers before committing to it:

```ts
await client.callTool({ name: "list_context_sources", arguments: {} });
// → { context: { source: "AGENTS.md", mediaType: "text/markdown", present: true, sections: 10 },
//     memory:  { … }, identity: { … },
//     surfaces: { mcp: { serverCard: "resource mcp-context-card://server-card",
//                        card: "resource ui://mcp-context-card/card.html (MCP App, text/html;profile=mcp-app)" },
//                 http: { serverCard: "GET /.well-known/mcp/server-card",
//                         aiCatalog: "GET /.well-known/ai-catalog.json",
//                         card: "GET /card" } } }
```

---

## 3. Adapting it

To serve *your* artifacts:

1. **Replace the three files** — `AGENTS.md`, `project.fafm`, `.well-known/fafa`
   — with your own, or point `MCP_CONTEXT_CARD_ROOT` at a directory that has them.
   `AGENTS.md` is the one with a real standard; the other two are swappable.
2. **Set your domain in your `.fafa`, not in code.** The AI Catalog identifiers
   (`urn:air:{domain}:{namespace}:{name}`) take the domain and short name from
   your project's `.fafa`: `npx faf-cli card init` (or `--domain example.com`)
   writes `agent.id: urn:air:example.com:agent:<short-name>`, and the catalog
   follows it. No `.fafa`, no invented domain: the served catalog uses the host
   it's served from, and the static file uses plain IDs. Only the Server Card
   `_meta` key namespace (`io.github.Wolfe-Jam.mcp-context-card/*`,
   `META_NS` in `src/identity.ts`) is a code constant. Change it if you fork
   ([MECHANISMS.md](./MECHANISMS.md)).
3. **Swap the media types** in `serverCardMeta()` if your memory / identity
   artifacts aren't `.fafm` / `.fafa`. Drop the `iana` field for any that isn't
   a registered type.
4. `npm run catalog` to regenerate, `npm run demo` to confirm all three still
   round‑trip, `npm test` for the suite.

---
