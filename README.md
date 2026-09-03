# mcp-trinity

[![CI](https://github.com/Wolfe-Jam/mcp-trinity/actions/workflows/ci.yml/badge.svg)](https://github.com/Wolfe-Jam/mcp-trinity/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Reference MCP server for the three things servers keep reinventing — **project
context**, **persistent memory**, and **agent identity** — exposed through the
two surfaces already in the ecosystem: the **Server Card `_meta`** block and
**`ai-catalog.json`** sibling entries.

Nothing here is new protocol. It is the minimal, legible, tested version of a
pattern already running in production, small enough to read in one sitting.

## The pattern

Every MCP server eventually wants to answer three questions:

| Question | Concern |
|---|---|
| *What project am I scoped to?* | **context** |
| *What did I learn last session?* | **memory** |
| *Who am I, as an agent?* | **identity** |

Most servers grow an ad-hoc shape for each. `mcp-trinity` implements all three
once and exposes them through mechanisms that already exist:

1. **Server Card `_meta`** ([SEP‑2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)) — one
   reverse‑DNS‑namespaced key per concern. Readable in‑band as an MCP resource
   (`mcp-trinity://server-card`) and out‑of‑band at
   `GET /.well-known/mcp/server-card`.
2. **`ai-catalog.json`** — sibling entries keyed by media type, one per concern,
   at `GET /.well-known/ai-catalog.json`.

The worked example uses three IANA‑registered formats — `.faf` (context),
`.fafm` (memory), `.fafa` (identity) — but the artifacts are swappable. The
mechanism is the contribution; the formats are one instantiation.

→ **[docs/MECHANISMS.md](./docs/MECHANISMS.md)** for the wire‑level detail.

## Run it

```bash
npx mcp-trinity                 # stdio — what an MCP host spawns
npx mcp-trinity --http          # stateless Streamable HTTP on :3000
PORT=8080 npx mcp-trinity       # HTTP on :8080 (a hosted deploy sets PORT)
```

Or as a dependency:

```bash
npm i mcp-trinity
```

### Claude Desktop / Cursor / any stdio host

```jsonc
{
  "mcpServers": {
    "trinity": { "command": "npx", "args": ["-y", "mcp-trinity"] }
  }
}
```

By default the server reads its own bundled `project.faf` / `project.fafm` /
`.well-known/fafa`. Point it at a real project with an env var:

```jsonc
{
  "mcpServers": {
    "trinity": {
      "command": "npx",
      "args": ["-y", "mcp-trinity"],
      "env": { "MCP_TRINITY_ROOT": "/path/to/your/project" }
    }
  }
}
```

More host wiring — including the host‑side context‑fill pattern — in
**[docs/WIRING.md](./docs/WIRING.md)**. Transport choice and the stateless
design in **[docs/TRANSPORT.md](./docs/TRANSPORT.md)**.

## The four tools

| Tool | Concern | Behaviour |
|---|---|---|
| `describe_project` | context | `project_name` is **required**. A plain call hits a wall; a host that read a `.faf` fills it. The deliberate minimal stand‑in for "context a host already has." |
| `remember` | memory | writes a fact to a `.fafm` file |
| `recall` | memory | reads a fact back — survives a full process restart, because only the file carries it |
| `whoami` | identity | returns this server's own `.fafa` as a one‑liner |

## Proven, not described

`npm run demo` runs all three, live:

1. **Context** — a plain `callTool()` hits *"project_name required"*; the same
   call routed through the host‑side fill gets it from `project.faf`.
2. **Memory** — `remember()` a fact on one server process, kill it entirely,
   spawn a fresh one, `recall()` the same fact. No in‑memory state survives
   that — only the file does.
3. **Identity** — `whoami()` reads the `.fafa`; the Server Card `_meta` block is
   read back from a live client, over stdio and stateless HTTP alike.

**64 tests** across Linux / macOS / Windows, coverage‑gated in CI — including a
real `child_process` spawn that proves memory across an actual process
boundary, and stdio/HTTP tool‑surface parity.

## Layout

| Path | What |
|---|---|
| `src/server.ts` | the MCP server — 4 tools + the Server Card resource |
| `src/context.ts` | the host‑side param‑fill, generalized from [`mcp-project-context`](https://github.com/Wolfe-Jam/mcp-project-context) |
| `src/memory.ts` | file‑backed `remember` / `recall` / `forget` against a `.fafm` |
| `src/identity.ts` | `whoami()` + the `_meta` trinity block |
| `src/catalog-gen.ts` | writes `ai-catalog.json` from the same three files |
| `src/transport/http.ts` | the stateless Streamable HTTP app (Hono) |
| `src/bin.ts` | dual‑transport entry point (`resolveLaunch`) |
| `src/faf/parse-*.ts` | real YAML parsers for `.faf` / `.fafm` / `.fafa` |

## Related

- [`mcp-project-context`](https://github.com/Wolfe-Jam/mcp-project-context) — the
  predecessor: one concern (context), not three.
- [Server Card SEP‑2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) · [ai-catalog](https://github.com/Agent-Card/ai-catalog)
- `application/vnd.faf+yaml`, `application/vnd.fafm+yaml`,
  `application/vnd.fafa+yaml` — IANA media‑type registrations.

## License & citation

MIT.

The three formats used as the worked example are specified in: Wolfe, J. —
[*.faf*](https://doi.org/10.5281/zenodo.18251362) (context),
[*.fafm*](https://doi.org/10.5281/zenodo.20348942) (memory),
[*.fafa*](https://doi.org/10.5281/zenodo.21951641) (identity), Zenodo, 2025–2026.
