# Transport

`mcp-context-card` runs the same server over two transports. The tool surface,
the Server Card `_meta` block, and the memory file are identical either way
— only the wire changes.

```
mcp-context-card              → stdio                 (default; an MCP host spawns this)
mcp-context-card --http       → Streamable HTTP :3000
PORT=8080 mcp-context-card    → Streamable HTTP :8080 (a hosted deploy sets PORT)
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
GET  /.well-known/mcp/server-card   → the Server Card + _meta trinity block
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

### DNS-rebinding protection

Off by default (the server should run anywhere with no config). For a real
deployment, pass `allowedHosts` / `allowedOrigins` to the transport and set
`enableDnsRebindingProtection: true`.
