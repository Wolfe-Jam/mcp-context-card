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
      "args": ["-y", "mcp-context-card"],
      "env": { "MCP_CONTEXT_CARD_ROOT": "/abs/path/to/your/project" }
    }
  }
}
```

- **`MCP_CONTEXT_CARD_ROOT`** — directory holding `AGENTS.md`, `project.fafm`, and
  `.well-known/fafa`. Omit it and the server uses its own bundled copies.
- `stdout` is the JSON‑RPC wire; logging is on `stderr`.
- **`command: "npx"` fails to spawn on some hosts** (`spawn npx ENOENT`) — the
  host's process spawn doesn't inherit a shell `PATH` that has `npx` on it,
  even though a login shell does. Observed with Cursor. Fix: point `command`
  at an absolute path to `node`, with the installed package's `dist/bin.js` as
  the arg — e.g. `command: "node"`, `args: ["/path/to/node_modules/mcp-context-card/dist/bin.js"]`
  (or wherever `npm install -g` / your package manager put it; find it with
  `npm root -g` or `which mcp-context-card` after a global install).

### Streamable HTTP (remote)

```bash
PORT=8080 npx mcp-context-card        # or:  npx mcp-context-card --http
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
// → { context: { source: "AGENTS.md", mediaType: "text/markdown", present: true, sections: 9 },
//     memory:  { … }, identity: { … },
//     surfaces: { mcp: { serverCard: "resource mcp-context-card://server-card" },
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
2. **Rename the namespace.** `serverCardMeta()` in `src/identity.ts` uses
   `io.github.wolfe-jam.mcp-context-card/*` keys, and `buildCatalog()` in
   `src/catalog-gen.ts` uses `urn:air:mcp-context-card:*` identifiers. Change both to
   a domain or GitHub identity you control ([MECHANISMS.md](./MECHANISMS.md)).
3. **Swap the media types** in `serverCardMeta()` if your memory / identity
   artifacts aren't `.fafm` / `.fafa`. Drop the `iana` field for any that isn't
   a registered type.
4. `npm run catalog` to regenerate, `npm run demo` to confirm all three still
   round‑trip, `npm test` for the suite.

---
