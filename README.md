# faf-trinity

**faf-trinity — the chassis for context, memory & agent in MCP**

This reference implementation shows an MCP server exposing all three IANA-registered FAF formats — `.faf` (context), `.fafm` (memory), `.fafa` (agent identity) — through two mechanisms already proven live in production, not invented for this repo.

⭐ Bookmarks it for you, helps other devs find it too.

## Problem

MCP servers today have no standard way to answer "who am I, what do I remember, what's my project." Every server that wants this invents its own ad-hoc shape.

## Solution

The same three files back both exposure mechanisms:

```
project.faf ──┐
project.fafm ─┼──►  Server Card _meta   (one.faf/context, one.faf/memory, one.faf/agent)
.fafa ────────┘  └► ai-catalog.json     (3 sibling entries, same 3 files)
```

Neither mechanism is new protocol surface — both are already running in production at `faf.one` and `context.faf.one`, months before this repo existed. This extracts the minimal, forkable pattern from a full production app down to something you can read in one sitting.

## What's actually proven, not just described

`npm run demo` runs all three, live:

1. **Context** — the same BEFORE/AFTER pattern as [mcp-project-context](https://github.com/Wolfe-Jam/mcp-project-context): a plain `callTool()` hits a "required, none supplied" wall, then the same call routed through `callToolWithContext()` gets filled from `project.faf`.
2. **Memory** — `remember()` a fact on one server process, kill that process entirely, spawn a fresh one, `recall()` the same fact. No in-memory state survives that — only the file does. That's the actual claim `.fafm` makes ("memory that survives across sessions"), proven by genuinely crossing a process boundary, not simulated.
3. **Identity** — `whoami()` reads this server's own `.well-known/fafa`, and the same three files are shown as a Server Card `_meta` block — the second proven exposure mechanism.

## Render project.faf

```bash
npx faf-cli show
```

Renders `project.faf` as an HTML card. This is what `faf show` does today — `.faf` only. `.fafm`/`.fafa` rendering isn't part of `faf-cli` yet; if that ever ships, it's a bonus, not something this repo is waiting on.

## Demo

```bash
npm install && npm run demo
```

## Generate the catalog

```bash
npm run catalog
```

Writes `.well-known/ai-catalog.json` from the same three source files (`project.faf`, `project.fafm`, `.well-known/fafa`). Generated, gitignored — run it yourself rather than trust a committed copy that could go stale.

## Core logic

- `src/context.ts` — the param-fill mechanism, generalized from `mcp-project-context` (no domain stub this time)
- `src/memory.ts` — real, file-backed remember/recall against `project.fafm` itself
- `src/identity.ts` — `whoami()` + the Server Card `_meta` trinity block
- `src/catalog-gen.ts` — generates the `ai-catalog.json` sibling entries
- `src/server.ts` — wires all three into one MCP server

## What this is

A reference implementation of context + memory + agent identity, together, for discussion.

## What this is not

- Not a library or package intended for installation
- Not an npm package — GitHub template distribution, fork it and own it
- Not a framework — no plugin system, no API-stability promise
- Not a full project-context system

## Related

- [mcp-project-context](https://github.com/Wolfe-Jam/mcp-project-context) — the direct predecessor, one format (context) instead of three
- [SEP-2577 (Roots deprecation)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2577)
- `application/vnd.faf+yaml`, `application/vnd.fafm+yaml`, `application/vnd.fafa+yaml` — IANA media type registrations

MIT
