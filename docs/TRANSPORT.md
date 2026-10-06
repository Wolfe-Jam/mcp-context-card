# Transport

`mcp-context-card` runs the same server over two transports. The tool surface,
the Server Card `_meta` block, and the memory file are identical either way
— only the wire changes.

```
mcp-context-card              → stdio                 (default; an MCP host spawns this)
mcp-context-card --http       → Streamable HTTP 127.0.0.1:3000 (this machine only)
PORT=8080 mcp-context-card    → Streamable HTTP 127.0.0.1:8080
HOST=0.0.0.0 PORT=8080 …      → exposed beyond this machine (a hosted deploy or container)
mcp-context-card --stdio      → force stdio even when PORT is set
```

## stdio

`StdioServerTransport` — one process, one client, JSON-RPC over stdin/stdout.
This is what Claude Desktop, Cursor, and `npx`-style hosts use. `stdout` is
the wire, so all logging goes to `stderr`.

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "context-card": { "command": "npx", "args": ["-y", "mcp-context-card"] }
  }
}
```

## Streamable HTTP — stateless

`POST /mcp` is the MCP endpoint. It runs **stateless**:

- `sessionIdGenerator: undefined` — no session IDs issued, no session
  validation, no `Mcp-Session-Id` header.
- `enableJsonResponse: true` — every response is a complete JSON body. No
  SSE stream is opened, so there is nothing to hold open and nothing to
  leak.
- A **fresh `Server` + transport per request**. Two concurrent requests
  never share state or collide on JSON-RPC ids.

```
GET  /                          → index (endpoints)
POST /mcp                       → MCP (initialize, tools/list, tools/call, …)
GET  /.well-known/mcp/server-card   → the Server Card + _meta block
GET  /.well-known/ai-catalog.json   → the three sibling entries
GET  /.well-known/fafa              → the agent identity card
```

```jsonc
{
  "mcpServers": {
    "context-card": { "url": "https://your-host.example/mcp" }
  }
}
```

### Why stateless

The default should be the one that scales and can't rot. Stateless
Streamable HTTP:

- **scales horizontally** — any replica can serve any request; no sticky
  sessions, no shared session store.
- **has no per-connection state** to grow unbounded or leak on a dropped
  client.
- **is trivial to reason about** — request in, response out.

### When you'd want stateful instead

Set a `sessionIdGenerator` and keep transports in a `Map<sessionId, …>`
when the server needs to:

- **push** server-initiated notifications to a specific client mid-session
  (`notifications/*` over a held-open SSE stream), or
- support **resumability** — a client reconnecting with `Last-Event-ID` to
  replay missed events (needs an `EventStore`).

`mcp-context-card` needs neither: its tools are request/response, and its
"memory" is a file on disk, not a live subscription. A fork that adds
streaming tools would flip this. See `src/transport/http.ts`.

### Security: local by default

The MCP transports spec (Streamable HTTP, Security Warning) asks three things
of a server, and this one does them as follows:

| Spec | Here |
|---|---|
| MUST validate `Origin`; refuse an invalid one with 403 | `originGuard` on every route except the public discovery documents: a request with no `Origin` (a non-browser client), from a page on this machine, from an allowlisted origin, or from the server's own origin passes; any other gets 403 with a JSON-RPC error (`id: null`) |
| SHOULD bind only to localhost when running locally | binds `127.0.0.1` unless `HOST` says otherwise; the startup line says which |
| SHOULD authenticate every connection | not built in: keep it local, or put it behind your own auth |

A local server also checks the `Host` header (`hostGuard`, the SDK's Express
`hostHeaderValidation` semantics for Hono): only loopback names are served, so a
DNS name rebound to 127.0.0.1 is refused, including on plain GETs, which often
carry no `Origin`.

The discovery documents (`/mcp/server-card`, `/.well-known/ai-catalog.json`,
`/.well-known/fafa`) stay readable from any origin with
`Access-Control-Allow-Origin: *`, because the Server Card spec requires it and
they carry no private data.

| Setting | Effect |
|---|---|
| `HOST=0.0.0.0` | expose the server (containers, hosted deploys); the Host check is then off unless names are listed below |
| `MCP_CONTEXT_CARD_ALLOWED_HOSTS=ctx.example.com` | extra Host names to accept, e.g. a reverse proxy's public name in front of a local bind |
| `MCP_CONTEXT_CARD_ALLOWED_ORIGINS=https://app.example.com` | browser origins allowed to call the server |
| `MCP_CONTEXT_CARD_PUBLISH_MEMORY=1` | serve `project.fafm`, list it in the AI Catalog, and show memory facts on an exposed `/card` |

### Where memory shows

| Surface | Reader | Memory facts |
|---|---|---|
| `mcp-context-card card`, the MCP App panel, `render_context_card`, `save_context_card` | you and your agent | shown |
| `GET /card`, local server | a browser on this machine | shown |
| `GET /card`, exposed server | anyone who can reach it | the count only, unless `MCP_CONTEXT_CARD_PUBLISH_MEMORY=1` |
| `GET /project.fafm`, the AI Catalog | anyone, and crawlers | not served or listed, unless `MCP_CONTEXT_CARD_PUBLISH_MEMORY=1` |
