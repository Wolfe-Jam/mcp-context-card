# Wiring

1. [Running it in a host](#1-running-it-in-a-host)
2. [The tools in practice](#2-the-tools-in-practice)
3. [Adapting it for your own artifacts](#3-adapting-it)
4. [Also: host-side context-fill](#4-also-host-side-context-fill)

---

## 1. Running it in a host

### stdio (local)

```jsonc
// claude_desktop_config.json  ·  ~/.cursor/mcp.json  ·  etc.
{
  "mcpServers": {
    "trinity": {
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

### Streamable HTTP (remote)

```bash
PORT=8080 npx mcp-context-card        # or:  npx mcp-context-card --http
```

```jsonc
{ "mcpServers": { "trinity": { "url": "https://your-host.example/mcp" } } }
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
//     surfaces: { serverCard: [...], aiCatalog: [...] } }
```

---

## 3. Adapting it

To serve *your* artifacts:

1. **Replace the three files** — `AGENTS.md`, `project.fafm`, `.well-known/fafa`
   — with your own, or point `MCP_CONTEXT_CARD_ROOT` at a directory that has them.
   `AGENTS.md` is the one with a real standard; the other two are swappable.
2. **Rename the namespace.** `trinityMeta()` in `src/identity.ts` uses
   `io.github.wolfe-jam.mcp-context-card/*` keys, and `buildCatalog()` in
   `src/catalog-gen.ts` uses `urn:air:mcp-context-card:*` identifiers. Change both to
   a domain or GitHub identity you control ([MECHANISMS.md](./MECHANISMS.md)).
3. **Swap the media types** in `trinityMeta()` if your memory / identity
   artifacts aren't `.fafm` / `.fafa`. Drop the `iana` field for any that isn't
   a registered type.
4. `npm run catalog` to regenerate, `npm run demo` to confirm all three still
   round‑trip, `npm test` for the suite.

---

## 4. Also: host-side context-fill

`src/context.ts` (`callToolWithContext`) is a small, standalone helper — not
part of the server. It wraps `client.callTool`: before dispatching, it reads the
target tool's **own** `inputSchema` and fills any declared parameter the caller
left out that the project context already knows.

```ts
import { callToolWithContext, contextFieldsFromProjectFaf } from "mcp-context-card/context";

const fields = contextFieldsFromProjectFaf("/abs/path/to/project.faf");
// { project_name: "acme-api", main_language: "TypeScript", … }

const { result, filled } = await callToolWithContext(client, "some_tool", {}, fields);
// filled → ["project_name"]   (only schema-declared, never overrides an explicit arg)
```

This is [`mcp-project-context`](https://github.com/Wolfe-Jam/mcp-project-context)
generalized — that server special‑cased one field; this fills whichever flat
scalar fields the context exposes into whichever tool declares them. The field
source shown here is a `.faf`; any `Record<string,string>` works.

**Who calls it, and when.** The *host* calls it, in host code — not the model,
not the server, not a config flag. It's safe to route *every* `client.callTool`
through it: it only fills a parameter the target tool **declares** and the
caller **left out**, and it never overrides an explicit argument. So the
decision is made once ("this is my `callTool`"), not per call. `npm run demo`
step 5 runs it against a throwaway `deploy` tool, filling `project_name` and
`main_language` from `project.faf` when the model supplied only `target`.
