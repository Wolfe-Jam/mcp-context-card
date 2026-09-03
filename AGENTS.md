# AGENTS.md

`mcp-context-card` is an MCP server that makes a project's **context**
(this file), **memory**, and **identity** discoverable to any MCP client —
through the two surfaces already in the ecosystem: the Server Card `_meta`
block and `ai-catalog.json` sibling entries.

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
| `src/server.ts` | the MCP server — the seven tools + the Server Card resource |
| `src/agents-md.ts` | reads and section-splits this file |
| `src/memory.ts` → `src/faf/parse-fafm.ts` | file-backed `remember` / `recall` / `forget` |
| `src/identity.ts` | `whoami` + the `_meta` context block |
| `src/catalog-gen.ts` | writes `.well-known/ai-catalog.json` from the same three sources |
| `src/transport/http.ts` | the stateless Streamable HTTP app (Hono) |
| `src/bin.ts` | dual-transport entry point (`resolveLaunch`) |
| `src/faf/parse-*.ts` | parsers for the worked-example artifacts |

## Conventions

- TypeScript strict, ESM only (`"type": "module"`, `.js` import specifiers).
- Tests use `node:test` + `node:assert/strict` — no test framework.
- Every source file opens with a comment stating what it is and why.
- Conventional Commit messages (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).

## The invariant

`src/identity.ts` and `src/catalog-gen.ts` describe the **same three
sources**: this file, `project.fafm`, `.well-known/fafa`. Change what one
exposes and you must change the other. `npm run catalog:check` enforces it in
CI — it regenerates `ai-catalog.json` and fails on any diff.

## Safety

- Branch off `main`; CI must be green before merge.
- `npm run demo` writes a fact to `project.fafm` and restores the file on
  exit — don't kill it mid-run.
- No secrets live in this repo; never add any.

## Definition of done

`npm run typecheck && npm run build && npm test && npm run demo` all green,
plus `npm run catalog:check` clean if you touched `AGENTS.md`,
`project.fafm`, or `.well-known/fafa`.

## Authoring this file

`AGENTS.md` here is maintained by hand. It can also be generated from the
repo's `project.faf` with `faf export --agents` — the server doesn't care how
the file was authored, only that it's valid Markdown.
