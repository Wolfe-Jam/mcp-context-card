# Changelog

All notable changes to this project. Adheres to [Semantic Versioning](https://semver.org).

## 0.5.1

First-hour ergonomics and wording, from the 0.5.0 soak.

- `--help` / `-h` and `--version` / `-V` (and the `help` / `version` subcommands)
  — a bare `mcp-context-card` is a stdio server that waits on stdin, so at a
  terminal it looked idle with no way to ask what it was.
- stdio mode now prints one line to **stderr** on start
  (`… · stdio · waiting for an MCP host on stdin`) — mirrors what `--http`
  already did. stdout stays clean for the JSON-RPC wire.
- The npm and `server.json` descriptions no longer open with "Reference MCP
  server" — they now match the README ("An MCP server that makes a project's
  context, memory, and identity discoverable…"). Same in `.well-known/fafa`;
  the three `project.fafm` facts are `type: fact`. `package.json` `author` set
  to the LICENSE holder.
- `.well-known/fafa` — `vendor: io.github.wolfe-jam`, `status: published`
  (were both `reference`). Shows in `whoami` and as the card's pills.
- **Fix:** `remember` on a project that has never had a `project.fafm` threw
  `ENOENT` instead of starting one — the single most common first-use case.
  Found by a real host check (Cursor, 2026-09-04). `remember` now creates a
  fresh `.fafm` on first write; `forget` and `parseFafm` were already safe on
  a missing file and are unchanged in behaviour.
- `docs/WIRING.md`: a note on hosts whose spawn `PATH` lacks `npx`
  (`spawn npx ENOENT`, observed in Cursor) — point `command` at `node` +
  the installed `dist/bin.js` instead.

## 0.5.0

The first public release — installable, and settling in the open before a
`1.0.0` cut. `faf-trinity` v0.1.0 was a private demo; this is the versioned,
tested server.

### The tools

- **context** — `read_agents_md` (whole file or one section by heading),
  `list_agents_md_sections`, and `author_agents_md` (draft one when there
  isn't one, via `agents-md-facts`). The register the other two serve is
  `AGENTS.md`.
- **memory** — `remember`, `recall`, `forget`. File-backed against a `.fafm`;
  a fact survives a full server-process restart.
- **identity** — `whoami`. From the server's `.well-known/fafa`, or
  `package.json` when there isn't one.
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

- 90 tests across Linux / macOS / Windows, coverage-gated
  (lines 90 / funcs 85 / branches 80, `src/` only). A real `child_process`
  spawn proves memory across a genuine process boundary; stdio/HTTP
  tool-surface parity is asserted.
- Build emits `dist/` (`tsconfig.build.json`); `exports` map, shipped type
  declarations. `docs/MECHANISMS.md`, `docs/WIRING.md`, `docs/TRANSPORT.md`;
  `examples/` (Dockerfile, compose, client configs). `server.json` registry
  manifest.
- `author_agents_md` wraps [`agents-md-facts`](https://github.com/Wolfe-Jam/agents-md-facts)
  — a published, standalone AGENTS.md authoring engine (real commands / entry
  points / conventions, nothing invented; `--check` keeps it true).
- `whoami` falls back to `package.json` when a project has no `.well-known/fafa`.

### Since v0.1.0

- Renamed `faf-trinity` → `mcp-context-card`.
- Context concern now leads with `AGENTS.md`, not a FAF format; the FAF formats
  are the worked examples for memory and identity, where no standard exists.
- The `_meta` block and `catalog-gen` carry real data, not a `console.log` and
  a hardcoded object.

## v0.1.0 (2026-08-12)

- Initial private implementation (as `faf-trinity`): project context,
  persistent memory, and agent identity in one MCP server, through two
  mechanisms already live in production. `demo.ts` proved all three.
