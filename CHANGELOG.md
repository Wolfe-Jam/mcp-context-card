# Changelog

All notable changes to this project. Adheres to [Semantic Versioning](https://semver.org).

## [Unreleased]

The first published release. `faf-trinity` v0.1.0 was a private demo; this is
the versioned, tested, installable reference.

### Added

- Dual transport — stdio (default) and stateless Streamable HTTP (`--http` /
  `PORT`); `src/bin.ts` `resolveLaunch()` selects the mode.
- HTTP discovery routes: `GET /.well-known/mcp/server-card`,
  `GET /.well-known/ai-catalog.json`, `GET /.well-known/fafa`.
- `mcp-trinity://server-card` MCP resource carrying the `_meta` trinity block
  (in-band; the `.well-known` route is the out-of-band twin).
- Real YAML parsers for `.faf` / `.fafm` / `.fafa` (`src/faf/`), replacing the
  line-adjacency string matching.
- `catalog-gen` derives `ai-catalog.json` from the three source files; the CI
  job fails on any drift (`npm run catalog:check`).
- `MCP_TRINITY_ROOT` — point the server at any project directory.
- 64 tests across Linux / macOS / Windows, coverage-gated
  (lines 90 / funcs 85 / branches 80). Includes a real `child_process` spawn
  that proves memory survives an actual process boundary, and stdio/HTTP
  tool-surface parity.
- `docs/MECHANISMS.md`, `docs/WIRING.md`, `docs/TRANSPORT.md`; `examples/`
  (Dockerfile, compose, client configs).
- `server.json` — MCP registry manifest.
- Build now emits `dist/` (`tsconfig.build.json`); package is installable with
  an `exports` map and shipped type declarations.

### Changed

- Renamed `faf-trinity` → `mcp-trinity`. FAF is the worked example, not the
  framing — every surface leads with the MCP pattern.
- The Server Card `_meta` block and `catalog-gen` now carry real data, not a
  `console.log` and a hardcoded object.
- Positioned as an installable reference, not a "fork it and own it" template.
- Trimmed the three-DOI citation block to one line.

## v0.1.0 (2026-08-12)

- Initial private reference implementation (as `faf-trinity`): project context,
  persistent memory, and agent identity in one MCP server, through two
  mechanisms already live in production. `demo.ts` proved all three — memory
  genuinely crossing a process boundary.
