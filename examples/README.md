# Examples

| File | For |
|---|---|
| `claude_desktop_config.json` | stdio — Claude Desktop, Cursor, any stdio host |
| `http-client-config.json` | a client pointing at a remote HTTP deployment |
| `Dockerfile` | containerised stateless Streamable HTTP |
| `compose.yaml` | the same, via `docker compose` |

## stdio

Copy `claude_desktop_config.json` into your host's config, set
`MCP_TRINITY_ROOT` to a project directory (one holding `project.faf`,
`project.fafm`, `.well-known/fafa`), and restart the host. Drop the `env`
block entirely to run against the server's own bundled reference files.

## HTTP

```bash
docker build -f examples/Dockerfile -t mcp-trinity .
docker run -p 3000:3000 mcp-trinity
```

The three discovery routes need no MCP handshake:

```console
$ curl -s localhost:3000/.well-known/mcp/server-card
{
  "name": "mcp-trinity",
  "version": "0.2.0",
  "_meta": {
    "one.faf/context": { "faf": "./project.faf",        "mediaType": "application/vnd.faf+yaml",  "iana": "https://www.iana.org/assignments/media-types/application/vnd.faf+yaml" },
    "one.faf/memory":  { "fafm": "./project.fafm",       "mediaType": "application/vnd.fafm+yaml", "iana": "https://www.iana.org/assignments/media-types/application/vnd.fafm+yaml" },
    "one.faf/agent":   { "fafa": "./.well-known/fafa",   "mediaType": "application/vnd.fafa+yaml", "iana": "https://www.iana.org/assignments/media-types/application/vnd.fafa+yaml" }
  }
}

$ curl -s localhost:3000/.well-known/ai-catalog.json | jq '.entries[].type'
"application/vnd.faf+yaml"
"application/vnd.fafm+yaml"
"application/vnd.fafa+yaml"
```

The MCP endpoint is `POST /mcp` (`initialize` → `tools/list` → `tools/call`, …).
A real client does the handshake for you — see `npm run demo`, or point any MCP
client at `http://localhost:3000/mcp` with `http-client-config.json`.

Mount a real project instead of the bundled reference files:

```bash
docker run -p 3000:3000 -v "$PWD:/project:ro" -e MCP_TRINITY_ROOT=/project mcp-trinity
```
