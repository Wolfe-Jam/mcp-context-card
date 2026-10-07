# Mechanisms

`mcp-context-card` exposes three concerns — context, memory, identity — through two
mechanisms that already exist in the MCP ecosystem. This is the wire‑level
detail.

The **context** concern points at `AGENTS.md` (`text/markdown`). Memory and
identity have no de‑facto standard, so this server points them at `.fafm` and
`.fafa`. Everything below is about the *shape* — swap the artifacts and the
mechanism is unchanged.

---

## Mechanism 1 — the Server Card `_meta` block

A **Server Card**
([SEP‑2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127))
describes a server. It is *not* a field on the `initialize` result — the SDK
client keeps only `serverInfo` / `capabilities` / `instructions` and discards a
top‑level `_meta`. So the card is served the two ways a client can consume it:

```
resources/read  mcp-context-card://server-card       # in band
GET /mcp/server-card                             # out of band (http transport; the 1.x
                                                 # /.well-known/mcp/server-card still answers)
```

Both return the card below (over HTTP it also carries `remotes`, the
Streamable HTTP endpoint at `<origin>/mcp` and its protocol versions):

```jsonc
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
  "name": "io.github.Wolfe-Jam/mcp-context-card",
  "version": "1.6.0",
  "title": "MCP Context Card",
  "description": "MCP server for a project's context (AGENTS.md), memory, and identity — base or drop-in extension.",
  "websiteUrl": "https://github.com/Wolfe-Jam/mcp-context-card",
  "repository": { "url": "https://github.com/Wolfe-Jam/mcp-context-card", "source": "github" },
  "_meta": {
    "io.github.Wolfe-Jam.mcp-context-card/context": {
      "source": "AGENTS.md",
      "mediaType": "text/markdown"
    },
    "io.github.Wolfe-Jam.mcp-context-card/memory": {
      "source": "project.fafm",
      "mediaType": "application/vnd.fafm+yaml",
      "iana": "https://www.iana.org/assignments/media-types/application/vnd.fafm+yaml",
      "note": "no de-facto standard for agent memory yet — this is one instantiation"
    },
    "io.github.Wolfe-Jam.mcp-context-card/identity": {
      "source": ".well-known/fafa",
      "mediaType": "application/vnd.fafa+yaml",
      "iana": "https://www.iana.org/assignments/media-types/application/vnd.fafa+yaml"
    }
  }
}
```

**Why it looks like this:**

- **`_meta` is the extension point.** SEP‑2127 defines it as
  `additionalProperties: {}`. A consumer that doesn't know a key ignores it.
- **Keys are reverse‑DNS‑namespaced to the publisher**
  (`io.github.Wolfe-Jam.mcp-context-card/context`, not `context`). No collisions, and
  the key's owner is unambiguous. Use a domain or GitHub identity you control.
- **One key per concern**, each self‑describing: the source file, its media
  type, and — where the media type is IANA‑registered — the anchor. `context`
  carries no `iana` field because `text/markdown` needs none.
- **`note` is honest.** There is no de‑facto memory format the way `AGENTS.md`
  is for instructions; the block says so rather than implying `.fafm` is a
  standard.

Built by `serverCardMeta()` in [`src/identity.ts`](../src/identity.ts).

---

## Mechanism 2 — `ai-catalog.json` sibling entries

[ai-catalog](https://github.com/Agent-Card/ai-catalog) is a discovery format: a
publisher lists artifacts, each entry keyed by its **media type** (`type`).
`mcp-context-card` publishes one entry per concern.

```
GET /.well-known/ai-catalog.json
```

Served from `https://ctx.example.com` (1.6.0, this repo's own files):

```jsonc
{
  "specVersion": "1.0",
  "host": { "displayName": "mcp-context-card", "identifier": "https://github.com/Wolfe-Jam/mcp-context-card" },
  "entries": [
    { "identifier": "urn:air:faf.one:mcp:mcp-context-card", "type": "application/mcp-server-card+json",
      "url": "https://ctx.example.com/mcp/server-card" },
    { "identifier": "urn:air:faf.one:context:mcp-context-card", "type": "text/markdown",
      "displayName": "mcp-context-card — project context (AGENTS.md)",
      "description": "Agent instructions for this project — 9 section(s): Setup, Build, Test, …",
      "url": "https://ctx.example.com/AGENTS.md" },
    { "identifier": "urn:air:faf.one:identity:mcp-context-card", "type": "application/vnd.fafa+yaml",
      "url": "https://ctx.example.com/.well-known/fafa",
      "extensions": { "io.github.Wolfe-Jam.mcp-context-card": { "iana": "https://www.iana.org/assignments/media-types/application/vnd.fafa+yaml" } },
      "…": "…" }
  ]
}
```

The static `.well-known/ai-catalog.json` is the same, with relative URLs and the
Server Card inline as `data`. Memory (`application/vnd.fafm+yaml`) is listed only
with `MCP_CONTEXT_CARD_PUBLISH_MEMORY=1`.

**Why it looks like this:**

- **The Server Card comes first** (`application/mcp-server-card+json`). It
  carries its own name, description and version, so the entry repeats none.
- **`type` is the routing key.** A consumer scanning catalogs for
  `text/markdown` context, or `application/vnd.fafm+yaml` memory, finds the
  entry without knowing this publisher.
- **`identifier` is a `urn:air:` URN** scoped to the publisher
  (`urn:air:{domain}:{namespace}:{name}`). The domain is the one your `.fafa`
  declares (`faf card init` writes it into `agent.id`); `faf.one` above is this
  repo's. With no `.fafa` domain, the served catalog uses the serving host and
  the static file uses plain IDs. No domain is ever invented. In ai-catalog's
  [trust‑manifest ADRs](https://github.com/Agent-Card/ai-catalog/tree/main/adr),
  `urn:air` identifiers carry a publisher‑domain‑aligned trust manifest, so the
  domain in the identifier is the one a publisher would sign with.
- **`description` is derived from real content** — the live AGENTS.md heading
  list, the current fact count, the agent's own description — not a blurb that
  drifts. See `buildCatalog()` in [`src/catalog-gen.ts`](../src/catalog-gen.ts).
- **`url` is absolute when served** (against the request's origin, honouring a
  reverse proxy's forwarded headers) and relative in the static file, so it also
  resolves in a repo browser.

---

## The invariant

The same three sources also render as **the card** — `GET /card` /
`render_context_card` / `docs/card.html` — the human view of exactly what a
machine reads below. Hosts that support MCP Apps show it inline from the
`ui://mcp-context-card/card.html` resource; elsewhere `save_context_card`
writes it to `context-card.html` and returns it as Markdown.

The same three sources back **both** discovery mechanisms:

```
AGENTS.md      ─┐
project.fafm   ─┼─→  Server Card _meta   (context · memory · identity)
.well-known/   ─┘ └─→ ai-catalog.json     (3 sibling entries, keyed by media type)
  fafa
```

`catalog-gen.ts` reads exactly the files `serverCardMeta()` names. The CI job
`npm run catalog:check` regenerates `ai-catalog.json` and fails on any drift —
change a source, both surfaces move together.

**Describe the artifacts once; expose them through whatever mechanism the
consumer speaks.**

---

## Server Card, and A2A

**Server Card** is what this server has: `AGENTS.md`, a memory file, an
identity block — read in-band as an MCP resource, or out-of-band at
`GET /.well-known/mcp/server-card`.

**A2A's [AgentCard](https://a2a-protocol.org/latest/specification/)** is
different: a live agent you can hand a task to — an endpoint, `capabilities`,
`skills`, authentication.

`.fafa` is the identity source behind the Server Card. We're ready for A2A:
the day a project here is reachable over A2A, the same source publishes a
real AgentCard alongside it — one more mechanism, same invariant, a real
endpoint and real skills, not a reshape of `.fafa`.
