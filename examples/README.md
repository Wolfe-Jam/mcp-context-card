# Examples

| File | For |
|---|---|
| `claude_desktop_config.json` | stdio — Claude Desktop, Cursor, any stdio host |
| `http-client-config.json` | a client pointing at a remote HTTP deployment |
| `Dockerfile` | containerised stateless Streamable HTTP |
| `compose.yaml` | the same, via `docker compose` |

## stdio

Copy `claude_desktop_config.json` into your host's config, set
`MCP_CONTEXT_CARD_ROOT` to a project directory (one holding `AGENTS.md`,
`project.fafm`, `.well-known/fafa`), and restart the host. Drop the `env`
block to run against the server's own bundled files.

## HTTP

```bash
docker build -f examples/Dockerfile -t mcp-context-card .
docker run -p 3000:3000 mcp-context-card
```

The three discovery routes need no MCP handshake:

```console
$ curl -s localhost:3000/.well-known/mcp/server-card
{
  "name": "mcp-context-card",
  "version": "0.5.3",
  "_meta": {
    "io.github.wolfe-jam.mcp-context-card/context":  { "source": "AGENTS.md",          "mediaType": "text/markdown" },
    "io.github.wolfe-jam.mcp-context-card/memory":   { "source": "project.fafm",       "mediaType": "application/vnd.fafm+yaml", "iana": "…", "note": "no de-facto standard for agent memory yet — this is one instantiation" },
    "io.github.wolfe-jam.mcp-context-card/identity": { "source": ".well-known/fafa",   "mediaType": "application/vnd.fafa+yaml", "iana": "…" }
  }
}

$ curl -s localhost:3000/.well-known/ai-catalog.json | jq '.entries[].type'
"text/markdown"
"application/vnd.fafm+yaml"
"application/vnd.fafa+yaml"
```

The MCP endpoint is `POST /mcp` (`initialize` → `tools/list` → `tools/call`, …).
A real client does the handshake for you — see `npm run demo`, or point any MCP
client at `http://localhost:3000/mcp` with `http-client-config.json`.

Mount a real project instead of the bundled files:

```bash
docker run -p 3000:3000 -v "$PWD:/project:ro" -e MCP_CONTEXT_CARD_ROOT=/project mcp-context-card
```
