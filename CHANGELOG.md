# Changelog

All notable changes to this project. Adheres to [Semantic Versioning](https://semver.org).

## [Unreleased]

The first published release. `faf-trinity` v0.1.0 was a private demo; this is
the versioned, tested, installable server.

### The tools

- **context** — `read_agents_md` (whole file or one section by heading),
  `list_agents_md_sections`. Serves the project's `AGENTS.md` — the file a
  client otherwise has to know to look for and read wholesale.
- **memory** — `remember`, `recall`, `forget`. File-backed against a `.fafm`;
  a fact survives a full server-process restart.
- **identity** — `whoami`. The server's own name / vendor / version / status /
  license from its `.fafa`.
- **discovery** — `list_context_sources`. What the project publishes, in what
  media types, through which surface.
- **the card** — `render_context_card`, `GET /card`, and `npx mcp-context-card
  card` (renders the current directory's card to stdout — no host, no config).
  Identity + `AGENTS.md` + memory + discovery as one self-contained HTML page
  (inline CSS, no JS, no external anything). Light / dark / auto; the accent
  defaults to the AAIF palette and takes any hex. `npm run card` writes
  `docs/card.html`; `card:check` fails on drift, in CI. Rendered by `src/md.ts`
  — a ~200-line dependency-free Markdown renderer.

### Exposure

- Server Card `_meta` block — publisher-namespaced keys
  (`io.github.wolfe-jam.mcp-context-card/{context,memory,identity}`), one per
  concern. `context` points at `AGENTS.md` / `text/markdown`.
- `mcp-context-card://server-card` MCP resource (in-band) +
  `GET /.well-known/mcp/server-card` (out-of-band, HTTP transport).
- `GET /.well-known/ai-catalog.json` — three sibling entries, keyed by media
  type, derived from the same three sources. `npm run catalog:check` fails on
  drift, in CI.

### Transport

- stdio (default) and stateless Streamable HTTP (`--http` / `PORT`);
  `src/bin.ts` `resolveLaunch()` selects the mode. `MCP_CONTEXT_CARD_ROOT` points
  the server at any project.

### Engineering

- 91 tests across Linux / macOS / Windows, coverage-gated
  (lines 90 / funcs 85 / branches 80, `src/` only). A real `child_process`
  spawn proves memory across a genuine process boundary; stdio/HTTP
  tool-surface parity is asserted.
- Build emits `dist/` (`tsconfig.build.json`); `exports` map, shipped type
  declarations. `docs/MECHANISMS.md`, `docs/WIRING.md`, `docs/TRANSPORT.md`;
  `examples/` (Dockerfile, compose, client configs). `server.json` registry
  manifest.
- `src/context.ts` — a standalone host-side param-fill helper
  (`mcp-project-context` generalized), documented in WIRING.

### Since v0.1.0

- Renamed `faf-trinity` → `mcp-context-card`.
- Context concern now leads with `AGENTS.md`, not a FAF format; the FAF formats
  are the worked examples for memory and identity, where no standard exists.
- The `_meta` block and `catalog-gen` carry real data, not a `console.log` and
  a hardcoded object.

## v0.1.0 (2026-08-12)

- Initial private reference implementation (as `faf-trinity`): project context,
  persistent memory, and agent identity in one MCP server, through two
  mechanisms already live in production. `demo.ts` proved all three.
