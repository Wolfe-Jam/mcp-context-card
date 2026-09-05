# Changelog

All notable changes to this project. Adheres to [Semantic Versioning](https://semver.org).

## 0.5.3

The README as a hero, not just a description. Everything visual this repo
claims is now backed by a real screenshot from the actual rendered card —
nothing hand-drawn, nothing mocked up.

- **The card leads the README** — a side-by-side "Light | Dark" table right
  at the top, instead of one fixed screenshot. Shows the real range to
  every viewer regardless of their own GitHub theme.
- **Each of the three concerns gets its own proof** — context, memory, and
  identity are each followed by a real crop from the card: the `AGENTS.md`
  section + the `read_agents_md` line, an actual tagged and verified
  memory fact, and the title + pills.
- **"Pick one"** — a table right after the hero: add an `AGENTS.md`,
  improve one to BEST, get a new MCP server base, or extend an MCP you
  already run. Replaces the old "Who it's for" table.
- The dark card no longer blends into GitHub's own dark mode — added a
  visible ring plus a soft accent-tinted glow so it reads as a distinct
  card regardless of backdrop.
- **GitHub Pages, live** — `wolfe-jam.github.io/mcp-context-card/` serves
  the card in auto/light/dark; the repo's homepage field points at it.
- "Vendor-free," not "Not tied to FAF" — dropped a defensive clause nobody
  needed, and reworded the vendor-boundary line to state the property
  without naming a vendor to disclaim against.

No functional change — README, docs, and card assets only. 102 tests,
typecheck/build/demo clean, `card:check` + `catalog:check` green.

## 0.5.2

The soak, closed out. Two Cursor host checks — a real bug found and fixed, a
real gap found and fixed, both confirmed against a real independent MCP host
on the current build.

- **`author_agents_md` now authors BEST, not just BETTER, when it can.**
  BETTER is the facts-only draft from `agents-md-facts` (build/test
  commands, entry points, conventions — nothing invented). **BEST** is that
  plus a `## Project` section ahead of it — goal, who it's for, why, and a
  "start here" file list — read straight from `project.faf` when one
  exists. This is the point of the app: give the best AGENTS.md the
  project has the material for, not a fixed floor. The tool's response
  names the tier it produced.
- **Fix:** `remember` on a project that had never had a `project.fafm`
  threw `ENOENT` instead of starting one — the single most common
  first-use case. `remember` now creates a fresh `.fafm` on first write;
  `forget` / `parseFafm` were already safe and are unchanged. A real
  child-process e2e test (a cold root, two separate OS processes) makes
  this a permanent regression guard, not just a fix.
- `docs/WIRING.md`: a note on hosts whose spawn `PATH` lacks `npx`
  (`spawn npx ENOENT`, observed in Cursor) — point `command` at `node` +
  the installed `dist/bin.js` instead.
- **The README / AGENTS.md / `project.faf` / manifest reframe** — dropped
  "Small, MIT…" / "a piece, not the toolbox" for the real positioning:
  essential context, memory, and identity components, usable as a base MCP
  on their own, or a drop-in extension for any existing MCP server.
- An accuracy pass across every shipped surface, caught by re-reading
  rather than by any check: stale test/tool counts (README, CHANGELOG,
  and `project.faf`'s own `human_context.what` — it undercounted its own
  tools), 3-release-old version strings sitting in two hand-shown examples
  (`examples/README.md`, `docs/MECHANISMS.md`), a pre-rename
  docker-compose service name (`trinity` → `context-card`), an internal
  function that still carried the pre-rename product name (`trinityMeta` →
  `serverCardMeta` — not a public export). `project.faf` itself rechecked
  against the current architecture (`tech_stack`, `key_files`, `cicd`).
- 102 tests, coverage gate held, `card:check` / `catalog:check` green,
  `faf-cli check`: ✪ Trophy 100%, 15/15 slots.

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
