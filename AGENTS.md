# AGENTS.md

`mcp-context-card` is the essential MCP server for a project's **context**
(this file), **memory**, and **identity** — usable as your base MCP, or
dropped into any existing MCP server as an extension. Discoverable to any
MCP client through the two surfaces already in the ecosystem: the Server
Card `_meta` block and `ai-catalog.json` sibling entries.

`read_agents_md` serves this file, section by section, over the same MCP
connection.

## Setup

```bash
npm ci
```

Node 22 or newer. No other system dependencies.

## Build

```bash
npm run build       # tsc -p tsconfig.build.json  →  dist/
npm run typecheck   # tsc --noEmit over src/ + test/
```

## Test

```bash
npm test              # node:test — every test/*.test.ts
npm run test:coverage # + the coverage gate (lines 90 / funcs 85 / branches 80, src/ only)
npm run demo          # end to end: all tools over stdio, then over stateless HTTP
```

CI runs `typecheck → build → test:coverage → demo` on Linux, macOS, and
Windows for every push and PR to `main` (`.github/workflows/ci.yml`).

## Layout

| Path | What |
|---|---|
| `src/server.ts` | the MCP server — the nine tools + the Server Card resource |
| `src/agents-md.ts` | reads and section-splits this file |
| `src/author.ts` | `author_agents_md` — wraps `agents-md-facts` (the AGENTS.md authoring engine) |
| `src/md.ts` | a minimal dependency-free Markdown → HTML renderer |
| `src/render-card.ts` | the card — identity + this file + memory + discovery, as one HTML page |
| `src/memory.ts` → `src/faf/parse-fafm.ts` | file-backed `remember` / `recall` / `forget` |
| `src/identity.ts` | `whoami` (`.fafa` → `package.json` fallback) + the `_meta` context block |
| `src/catalog-gen.ts` | writes `.well-known/ai-catalog.json` from the same three sources |
| `src/transport/http.ts` | the stateless Streamable HTTP app (Hono) |
| `src/bin.ts` | the entry point (`resolveLaunch`) — `stdio` · `--http` · `card` · `--help` · `--version` |
| `src/faf/parse-fafm.ts` · `parse-fafa.ts` | the `.fafm` / `.fafa` parsers |

## Conventions

- TypeScript strict, ESM only (`"type": "module"`, `.js` import specifiers).
- Tests use `node:test` + `node:assert/strict` — no test framework.
- Every source file opens with a comment stating what it is and why.
- Conventional Commit messages (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).

## The invariant

`src/identity.ts`, `src/catalog-gen.ts`, and `src/render-card.ts` all describe
the **same three sources**: this file, `project.fafm`, `.well-known/fafa`.
Change what one exposes and you must change the others. `npm run catalog:check`
and `npm run card:check` enforce it in CI — each regenerates its surface and
fails on any diff.

## Safety

- Branch off `main`; CI must be green before merge.
- `npm run demo` writes a fact to `project.fafm` and restores the file on
  exit — don't kill it mid-run.
- No secrets live in this repo; never add any.

## Definition of done

`npm run typecheck && npm run build && npm test && npm run demo` all green,
plus `npm run catalog:check` and `npm run card:check` clean if you touched
`AGENTS.md`, `project.fafm`, or `.well-known/fafa`.

## Authoring this file

`AGENTS.md` here is maintained by hand. It can also be generated from the
repo's `project.faf` with `faf export --agents` — the server doesn't care how
the file was authored, only that it's valid Markdown.
