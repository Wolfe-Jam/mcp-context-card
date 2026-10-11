# mcp-context-card

[![npm](https://img.shields.io/npm/v/mcp-context-card.svg)](https://www.npmjs.com/package/mcp-context-card)
[![CI](https://github.com/Wolfe-Jam/mcp-context-card/actions/workflows/ci.yml/badge.svg)](https://github.com/Wolfe-Jam/mcp-context-card/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![mcp-context-card MCP server](https://glama.ai/mcp/servers/Wolfe-Jam/mcp-context-card/badges/score.svg)](https://glama.ai/mcp/servers/Wolfe-Jam/mcp-context-card)

**Get one. Or add it to yours.** The essential MCP server for a project's
context, memory, and identity — discoverable to any MCP client, and
rendered as one card you can read.

| Light | Dark |
|---|---|
| ![the business card front, light theme: name, title, one-liner](./docs/img/card-light.png) | ![the business card front, dark theme](./docs/img/card-dark.png) |

**See your own project's business card** — run this in its folder. It writes
`context-card.html` and opens it in your browser. The front is the card: name,
title, one-liner. Flip it for the back: About, Context, Memory, Discovery.

```
npx mcp-context-card card
```

**context** — the project's `AGENTS.md`, served whole or one section at a time.

![the back's Context tab — AGENTS.md, section nav, read_agents_md](./docs/img/card-context.png)

**memory** — facts that persist across sessions, in a file.

![the back's Memory tab — real, tagged, verified facts](./docs/img/card-memory.png)

**identity** — what this server is, from its own `.fafa` (`agent.fafa`, else `.well-known/fafa`).

![the back's About tab — the identity in full](./docs/img/card-identity.png)

Discovery goes through two surfaces already in the ecosystem: the Server Card
`_meta` block and `ai-catalog.json` sibling entries.

## Pick one

| You want to… | |
|---|---|
| **Add an `AGENTS.md`** — you don't have one | `author_agents_md` drafts one from your repo's real facts |
| **Improve an `AGENTS.md`** — you have one, make it the best it can be | the same tool, automatically — drop in a `project.faf` and it upgrades to BEST: goal, who it's for, why |
| **Get a new MCP server base** — context, memory, identity, wired | stand this up as-is; a host has all three before you write a tool of your own |
| **Improve your MCP with context, memory, ID** — you already run one | run it alongside your existing server; nothing to migrate, it composes |

## A base MCP — or an extension for any other

Context, memory, and identity are essential — every MCP host needs an agent
that knows a project's instructions, remembers facts across sessions, and can
say what it is. `mcp-context-card` is those three, done once:

- **Stand it up as your base MCP.** Point a host at it and an agent already
  has `AGENTS.md` served section‑by‑section, `remember` / `recall` / `forget`
  memory that survives a restart, and a `whoami` identity — before a single
  tool of your own is written.
- **Or extend any existing MCP with it.** Run it alongside a server you
  already have — filesystem, git, a database, your own — and that agent
  gains context, memory, and identity discovery it didn't have. Nothing to
  migrate; it composes.

Ten tools, two discovery surfaces already in the ecosystem (Server Card
`_meta`, `ai-catalog.json`), and a rendered [card](#the-card). MIT, on npm.

It composes:

- **serve · discover · render** — this server
- **author BETTER, keep true** — [`agents-md-facts`](https://github.com/Wolfe-Jam/agents-md-facts) (`author_agents_md` wraps it for the facts layer; adds a BEST layer of its own from `project.faf` when one exists)
- **files · shell · git** — [`server-filesystem`](https://github.com/modelcontextprotocol/servers), [`server-git`](https://github.com/modelcontextprotocol/servers) / github‑mcp‑server, your test runner's MCP

Vendor-free — context is plain Markdown (`AGENTS.md`); the memory and
identity formats are swappable examples. It reads and writes only its own
three files (`AGENTS.md`, `project.fafm`, and `agent.fafa` or `.well-known/fafa`), plus the
`context-card.html` it saves on request — no general file access, no shell,
no search.

## The card

The screenshot at the top of this page is exactly this: the same sources
rendered as a **business card** in one self‑contained HTML page. The view for
people: read it, screenshot it, drop it in a PR, put it on a status page.

- **Front:** the name, a title (what it is and its version: "MCP server", "A2A
  agent", from where the project's `.fafa` says it runs) and a one-liner (the
  start of its description).
- **Back (Flip):** tabs for **About** (the identity in full),
  **Skills** (when the `.fafa` lists capabilities), **Context** (`AGENTS.md`),
  **Memory** and **Discovery**. Long content scrolls inside the card.
- **Landscape or portrait:** the ▭ ▯ button switches the view; `--portrait` /
  `?layout=portrait` sets it.
- **Light or dark card:** the card's colour is its own, like a printed card.
  `--theme` / `?theme=` sets it (default: follow your OS), and ◐ switches it.
  The page around it always follows your OS.

Flip, tabs and the view switch are plain CSS, so they work with scripts off.
The one small inline script adds Expand all, opens a `#section` link on the
back, and opens every section for printing. `--expanded` / `?expand=all`
renders both faces flat, every section open, for a screenshot or print.

```
npx mcp-context-card card            # at a terminal: writes context-card.html and opens it
npx mcp-context-card card --portrait # the tall view
npx mcp-context-card card --expanded # both faces flat, every section open
npx mcp-context-card card > x.html   # piped/redirected: raw HTML to stdout
GET /card                            # live, on the HTTP transport
GET /card?layout=portrait&theme=light&accent=%230066cc
```

In a chat, hosts that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps)
show the card inline when `render_context_card` runs; the model gets a short
summary instead of the page. Everywhere else, `save_context_card` writes
`context-card.html` into the project, opens it in your browser when the
server runs locally, and replies with the card as Markdown (identity, the
`AGENTS.md` sections, memory, discovery), a link to the full card, and its
address to copy. The Markdown is a tl;dr by default: five facts, each cut to
its first sentence as stored, so it stays small however much a project
remembers. `detail: "full"` lists every fact whole. The server's
instructions tell the model to show that rather than paste the HTML into
the chat.

Light, dark, or auto. The colour is the owner's: set it in the project's
`.fafa` (`metadata.cards.accent: "#0066cc"`), or pass any hex with `--accent`
or `?accent`. With none, the card is drawn in ink, black or white; no colour
is guessed.
This repo's own card, live: [auto](https://wolfe-jam.github.io/mcp-context-card/) ·
[light](https://wolfe-jam.github.io/mcp-context-card/card-light.html) ·
[dark](https://wolfe-jam.github.io/mcp-context-card/card-dark.html)
(in the AAIF orange its `.fafa` declares).

## Add it to your setup

### No `AGENTS.md` yet?

The `author_agents_md` tool authors one — **BETTER** from your repo's real
facts (build/test commands, entry points, toolchain conventions, via
[`agents-md-facts`](https://github.com/Wolfe-Jam/agents-md-facts)), or
**BEST** when a `project.faf` exists: the same facts, plus its structured
goal, who it's for, and why, as a section ahead of them. Nothing to
configure — the tier follows what's actually there.
([The ladder this follows.](https://github.com/Wolfe-Jam/agents-md-facts/blob/main/docs/BETTER-BEST.md))

To author or keep the facts layer true outside a session:

```bash
npx agents-md-facts          # author / refresh AGENTS.md
npx agents-md-facts --check  # fail if missing or stale (CI, pre-commit)
```

### See the card

One command, no host, no config — from your project directory:

```bash
npx mcp-context-card card
```

At a terminal it writes `context-card.html` and opens it in your browser. Piped
or redirected (`> card.html`, a script, CI) it writes raw HTML to stdout instead;
`--stdout` forces that from a terminal too. `--expanded` opens every section.

### Wire it into a host

goose, Claude Desktop, Cursor, or any stdio host:

```jsonc
{
  "mcpServers": {
    "context-card": {
      "command": "npx",
      "args": ["-y", "mcp-context-card"]
    }
  }
}
```

No path to configure: the server asks the host which project you're in (MCP
roots — goose sends its session's working directory), then falls back to the
directory it was started in if that has an `AGENTS.md`. `list_context_sources`
reports which project it picked and how. To pin one project instead, set
`"env": { "MCP_CONTEXT_CARD_ROOT": "/abs/path/to/your/project" }`; that always
wins. Identity is optional. Over HTTP instead:
`PORT=8080 npx mcp-context-card`. Requires Node ≥22.

HTTP mode is local by default, as the MCP transports spec asks: it binds
`127.0.0.1`, refuses foreign browser origins with 403, and refuses DNS names
rebound to this machine. `HOST=0.0.0.0` exposes it (a container or hosted
deploy). There is no authentication or rate limiting, so put an exposed server
behind your own.
Memory is session data: an exposed server shows only its count on `/card`, and
never serves or lists `project.fafm`, unless you set
`MCP_CONTEXT_CARD_PUBLISH_MEMORY=1`. Details:
[docs/TRANSPORT.md](./docs/TRANSPORT.md#security-local-by-default).

If `command: "npx"` fails to spawn (`spawn npx ENOENT` — seen on Cursor, whose
host process doesn't inherit a shell `PATH`), point `command` at `node` and
the installed `dist/bin.js` instead — see
[docs/WIRING.md](./docs/WIRING.md#1-running-it-in-a-host). Transport choice is
in [docs/TRANSPORT.md](./docs/TRANSPORT.md).

Extending an MCP you already run: most hosts accept more than one
`mcpServers` entry — add `context-card` alongside `server-filesystem`,
`server-git`, or your own, and every agent in that host gains context,
memory, and identity discovery without anything else changing.

### Your identifiers

The AI Catalog names each entry `urn:air:{domain}:{namespace}:{name}`, and
the domain is yours. It comes from your project's `.fafa`: run
`npx faf-cli card init` (or `--domain example.com`), and it writes
`agent.id: urn:air:example.com:agent:<short-name>`. Your catalog then publishes
`urn:air:example.com:context:<short-name>` and so on, with no code to change.
This repo's own `.fafa` says `faf.one`; that's our example, and yours says yours.

With no `.fafa`, no domain is invented: the served catalog uses the host it's
served from (`localhost` when you run it locally), and the static
`.well-known/ai-catalog.json` uses plain `<short-name>:<namespace>` IDs.

## Why

`AGENTS.md` is the de-facto standard for telling a coding agent how to work in a
repo. But a client has to *know the file exists* and read the whole thing into
context. There is no standard way for a server to say "here is my AGENTS.md,
here is what I remember, here is who I am" — so every server that wants this
grows its own shape.

`mcp-context-card` answers all three through mechanisms that already exist:

1. **Server Card `_meta`** ([SEP‑2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)) —
   one reverse‑DNS‑namespaced key per concern, readable in‑band as an MCP
   resource and at `GET /mcp/server-card` (the 1.x `/.well-known/mcp/server-card`
   still answers).
2. **`ai-catalog.json`** — the Server Card plus sibling entries keyed by media
   type, at `GET /.well-known/ai-catalog.json`.

The context concern points at `AGENTS.md` (`text/markdown`). Memory and identity
have no de‑facto standard yet, so the examples here use
[`.fafm`](https://doi.org/10.5281/zenodo.20348942) and
[`.fafa`](https://doi.org/10.5281/zenodo.21951641) — one instantiation each,
swap in your own.

The wire‑level detail is in [docs/MECHANISMS.md](./docs/MECHANISMS.md).

## Tools

| Tool | What it's for |
|---|---|
| `author_agents_md` | draft an `AGENTS.md` — BETTER from the repo's facts (via `agents-md-facts`), BEST when a `project.faf` exists — ready to drop in |
| `read_agents_md` | return the project's `AGENTS.md` — whole, or one section by heading |
| `list_agents_md_sections` | the headings, so a client pulls one section instead of the whole file |
| `remember` | write a fact that will still be there next session |
| `recall` | read a fact stored in a previous session |
| `forget` | drop or correct a stale fact |
| `whoami` | this server's name, vendor, version, status, license |
| `list_context_sources` | what this project publishes, in what media types, via which surface |
| `render_context_card` | the whole card as one self‑contained HTML page (also `GET /card`); hosts that support MCP Apps show it inline |
| `save_context_card` | write the card to `context-card.html` in the project and open it in your browser; returns the card as Markdown plus a link to the full version |

Seven tools only read. `remember` and `forget` write the memory file, and
`save_context_card` writes `context-card.html`, so those three are marked
destructive and a host can ask before running them. Every tool carries a
title and MCP tool annotations.

## The demo

`npm run demo` walks through context, memory, identity and discovery, live,
over both transports:

1. **Context** — list the `AGENTS.md` sections, then pull just `## Test`.
2. **Memory** — `remember()` a fact, stop the server process, start a new one,
   `recall()` the same fact. Only the file carries it across.
3. **Identity** — `whoami()`, and the Server Card `_meta` block read back from a
   live client.
4. **Discovery** — `list_context_sources()`, then the same server over stateless
   HTTP with its `.well-known` routes and `GET /card`.

210 tests on Linux, macOS, and Windows, coverage‑gated in CI.
`npm run wjttc` runs the WJTTC certification suite (seven tiers, from protocol
and Server Card conformance to stdio/HTTP parity and the shipped package). Two spawn a real
child process and check a remembered fact survives the restart — one against
an existing `project.fafm`, one starting from a project that has never had
one; another checks the stdio and HTTP tool surfaces match, and another checks
every tool's title and behaviour hints against what it actually does.
`src/conformance/discovery.ts` checks any server's Server Card, AI Catalog and
transport security against the specs, one MUST or SHOULD at a time.

## Layout

| Path | What |
|---|---|
| `src/server.ts` | the ten tools + the Server Card and card resources |
| `src/agents-md.ts` | reads and section‑splits `AGENTS.md` |
| `src/author.ts` | `author_agents_md` — BETTER via [`agents-md-facts`](https://github.com/Wolfe-Jam/agents-md-facts), BEST when `project.faf` exists |
| `src/md.ts` | a minimal dependency‑free Markdown → HTML renderer |
| `src/render-card.ts` | the card — reads identity + `AGENTS.md` + memory + discovery into a card; [`agent-business-card`](https://github.com/Wolfe-Jam/agent-business-card) draws it as one HTML page |
| `src/memory.ts` | file‑backed `remember` / `recall` / `forget` |
| `src/identity.ts` | `whoami` (`.fafa` → `package.json` fallback) + the `_meta` block |
| `src/server-card.ts` | the MCP Server Card (SEP-2127, schema v1) |
| `src/catalog-gen.ts` | writes `ai-catalog.json`: the Server Card + its sibling entries |
| `src/transport/http.ts` | the stateless Streamable HTTP app (Hono) |
| `src/transport/guard.ts` | Origin and Host checks (DNS-rebinding protection) |
| `src/conformance/discovery.ts` | a portable Server Card / AI Catalog / transport checker |
| `src/bin.ts` | the entry point — `stdio` · `--http` · `card` · `--help` · `--version` |

## Related

- [Server Card SEP‑2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) · [ai-catalog](https://github.com/Agent-Card/ai-catalog) · [AGENTS.md](https://agents.md)
- [`mcp-project-context`](https://github.com/Wolfe-Jam/mcp-project-context) — an earlier take on the context concern alone
- `text/markdown` (AGENTS.md) · `application/vnd.fafm+yaml` · `application/vnd.fafa+yaml`

## License

MIT.

This repo dogfoods what it serves — its `AGENTS.md` is a real, current file, and
it ships a `project.faf` as the structured source behind it.
