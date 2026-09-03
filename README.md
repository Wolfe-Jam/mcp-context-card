# mcp-context-card

[![CI](https://github.com/Wolfe-Jam/mcp-context-card/actions/workflows/ci.yml/badge.svg)](https://github.com/Wolfe-Jam/mcp-context-card/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

An MCP server that makes a project's **context**, **memory**, and **identity**
discoverable to any MCP client — through the two surfaces already in the
ecosystem: the **Server Card `_meta`** block and **`ai-catalog.json`** sibling
entries.

- **context** — the project's `AGENTS.md`, served whole or one section at a time
- **memory** — facts that persist across sessions, in a file
- **identity** — what this server *is*, from its own agent card

## Why

`AGENTS.md` is the de-facto standard for telling a coding agent how to work in a
repo. But a client has to *know the file exists* and read the whole thing into
context. There is no standard way for a server to say "here is my AGENTS.md,
here is what I remember, here is who I am" — so every server that wants this
grows its own shape.

`mcp-context-card` answers all three through mechanisms that already exist:

1. **Server Card `_meta`** ([SEP‑2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)) —
   one reverse‑DNS‑namespaced key per concern, readable in‑band as an MCP
   resource and at `GET /.well-known/mcp/server-card`.
2. **`ai-catalog.json`** — sibling entries keyed by media type, at
   `GET /.well-known/ai-catalog.json`.

The context concern points at `AGENTS.md` (`text/markdown`). Memory and identity
have no de‑facto standard yet, so the reference points them at
[`.fafm`](https://doi.org/10.5281/zenodo.20348942) and
[`.fafa`](https://doi.org/10.5281/zenodo.21951641) as one instantiation each —
swap in your own.

→ **[docs/MECHANISMS.md](./docs/MECHANISMS.md)** for the wire‑level detail.

## Run it

```bash
npx mcp-context-card                 # stdio — what an MCP host spawns
npx mcp-context-card --http          # stateless Streamable HTTP on :3000
PORT=8080 npx mcp-context-card       # HTTP on :8080 (a hosted deploy sets PORT)
```

### Point it at your project

```jsonc
// claude_desktop_config.json  ·  ~/.cursor/mcp.json  ·  any stdio host
{
  "mcpServers": {
    "trinity": {
      "command": "npx",
      "args": ["-y", "mcp-context-card"],
      "env": { "MCP_CONTEXT_CARD_ROOT": "/path/to/your/project" }
    }
  }
}
```

`MCP_CONTEXT_CARD_ROOT` is the directory holding `AGENTS.md`, `project.fafm`, and
`.well-known/fafa`. Omit it to run against the server's own bundled files.

Full host wiring in **[docs/WIRING.md](./docs/WIRING.md)**; transport choice in
**[docs/TRANSPORT.md](./docs/TRANSPORT.md)**.

## Tools

| Tool | What it's for |
|---|---|
| `read_agents_md` | return the project's `AGENTS.md` — whole, or one section by heading |
| `list_agents_md_sections` | the headings, so a client pulls one section instead of the whole file |
| `remember` | write a fact that will still be there next session |
| `recall` | read a fact stored in a previous session |
| `forget` | drop or correct a stale fact |
| `whoami` | this server's name, vendor, version, status, license |
| `list_context_sources` | what this project publishes, in what media types, via which surface |

## Proven live

`npm run demo` runs every tool over both transports:

1. **Context** — list the `AGENTS.md` sections, then pull just `## Test`.
2. **Memory** — `remember()` a fact, kill the server process, spawn a new one,
   `recall()` the same fact. Only the file crosses that boundary.
3. **Identity** — `whoami()`, and the Server Card `_meta` block read back from a
   live client.
4. **Discovery** — `list_context_sources()`, then the same server over stateless
   HTTP with its `.well-known` routes.

**71 tests** across Linux / macOS / Windows, coverage‑gated in CI — including a
real `child_process` spawn that proves memory across a genuine process boundary,
and stdio/HTTP tool‑surface parity.

## Layout

| Path | What |
|---|---|
| `src/server.ts` | the seven tools + the Server Card resource |
| `src/agents-md.ts` | reads and section‑splits `AGENTS.md` |
| `src/memory.ts` | file‑backed `remember` / `recall` / `forget` |
| `src/identity.ts` | `whoami` + the `_meta` context block |
| `src/catalog-gen.ts` | writes `ai-catalog.json` from the same three sources |
| `src/transport/http.ts` | the stateless Streamable HTTP app (Hono) |
| `src/bin.ts` | dual‑transport entry point |

## Related

- [Server Card SEP‑2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) · [ai-catalog](https://github.com/Agent-Card/ai-catalog) · [AGENTS.md](https://agents.md)
- [`mcp-project-context`](https://github.com/Wolfe-Jam/mcp-project-context) — an earlier take on the context concern alone
- `text/markdown` (AGENTS.md) · `application/vnd.fafm+yaml` · `application/vnd.fafa+yaml`

## License

MIT. This repo's own `AGENTS.md` is maintained by hand; it can also be generated
from `project.faf` with [`faf export --agents`](https://github.com/Wolfe-Jam/faf-cli) —
the server doesn't care how the file was authored, only that it's valid Markdown.
