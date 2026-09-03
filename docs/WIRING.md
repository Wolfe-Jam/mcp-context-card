# Wiring

Two audiences:

1. **[Running it in a host](#1-running-it-in-a-host)** — Claude Desktop, Cursor,
   or any MCP client.
2. **[The host‑side context‑fill](#2-the-host-side-context-fill)** — the pattern
   `src/context.ts` demonstrates, for anyone building the *host*.
3. **[Adapting it for your own artifacts](#3-adapting-it)** — forking the
   reference.

---

## 1. Running it in a host

### stdio (local)

```jsonc
// claude_desktop_config.json  ·  ~/.cursor/mcp.json  ·  etc.
{
  "mcpServers": {
    "trinity": {
      "command": "npx",
      "args": ["-y", "mcp-trinity"],
      "env": { "MCP_TRINITY_ROOT": "/abs/path/to/your/project" }
    }
  }
}
```

- **`MCP_TRINITY_ROOT`** — directory holding `project.faf`, `project.fafm`, and
  `.well-known/fafa`. Omit it and the server uses its own bundled copies (fine
  for a first look, not for real use).
- `stdout` is the JSON‑RPC wire; all logging is on `stderr`.

### Streamable HTTP (remote)

```bash
PORT=8080 npx mcp-trinity        # or:  npx mcp-trinity --http
```

```jsonc
{
  "mcpServers": {
    "trinity": { "url": "https://your-host.example/mcp" }
  }
}
```

Stateless — any replica serves any request, no session store. Rationale and the
"when you'd want stateful" case: [TRANSPORT.md](./TRANSPORT.md).

### What the host gets

| | |
|---|---|
| `tools/list` | `describe_project`, `remember`, `recall`, `whoami` |
| `resources/read mcp-trinity://server-card` | the Server Card + `_meta` trinity block |
| `GET /.well-known/mcp/server-card` | same card, out of band (HTTP only) |
| `GET /.well-known/ai-catalog.json` | three sibling entries (HTTP only) |

---

## 2. The host‑side context‑fill

`describe_project` **requires** `project_name`. A plain call fails:

```ts
await client.callTool({ name: "describe_project", arguments: {} });
// ⛔ project_name is required — none supplied. A real agent now has to guess or ask.
```

A host usually *already knows* the project name — it's sitting in a `.faf`, a
`package.json`, an env var. The fix is not a server change; it's the host
filling known parameters before dispatch, using the tool's **own** input
schema.

```ts
import { callToolWithContext, contextFieldsFromProjectFaf }
  from "mcp-trinity/context";           // or copy src/context.ts — it's ~50 lines

// flat, tool-schema-keyed fields read from a .faf:
//   { project_name: "acme-api", main_language: "TypeScript", who: "...", ... }
const fields = contextFieldsFromProjectFaf("/abs/path/to/project.faf");

const { result, filled } = await callToolWithContext(
  client,
  "describe_project",
  {},           // caller-supplied args win; nothing here is overridden
  fields,
);
// filled → ["project_name"]
// result → ✅ Scoped to project: acme-api
```

### How `callToolWithContext` works

1. `client.listTools()` — the host reads the target tool's declared
   `inputSchema.properties`. No server cooperation needed.
2. For each property the caller **didn't** supply and the context **does**
   know, fill it.
3. Dispatch the merged arguments; report which keys were filled.

It never overrides an explicit argument, and it only fills properties the tool
actually declares. A tool with no matching property is called unchanged.

This is [`mcp-project-context`](https://github.com/Wolfe-Jam/mcp-project-context)
generalized: that server special‑cased one field (`repository` → `owner`/`repo`);
this fills whichever flat scalar fields the project context exposes into
whichever tool declares them.

---

## 3. Adapting it

To serve *your* artifacts instead of the reference `.faf` / `.fafm` / `.fafa`:

1. **Replace the three files** — `project.faf`, `project.fafm`,
   `.well-known/fafa` — with your own, or point `MCP_TRINITY_ROOT` at a
   directory that has them.
2. **Rename the namespace.** `trinityMeta()` in `src/identity.ts` and
   `buildCatalog()` in `src/catalog-gen.ts` use `one.faf/*` keys and a
   `urn:air:mcp-trinity:*` identifier scheme. Change both to a domain / name you
   control — `_meta` keys must be reverse‑DNS‑namespaced to their owner, and the
   `urn:air` identifiers must align with your publisher domain
   ([MECHANISMS.md](./MECHANISMS.md)).
3. **Swap the media types** if your artifacts aren't the FAF formats. The IANA
   anchors in `trinityMeta()` should point at *your* registered types (or drop
   the `iana` field if they aren't registered).
4. `npm run catalog` to regenerate `ai-catalog.json`, `npm run demo` to confirm
   all three still round‑trip, `npm test` for the suite.

The tool surface, the transport, and the `catalog‑gen ↔ _meta` invariant are
unchanged — only the artifacts and the names move.
