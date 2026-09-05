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
GET /.well-known/mcp/server-card                 # out of band (http transport)
```

Both return:

```jsonc
{
  "name": "mcp-context-card",
  "version": "0.5.3",
  "_meta": {
    "io.github.wolfe-jam.mcp-context-card/context": {
      "source": "AGENTS.md",
      "mediaType": "text/markdown"
    },
    "io.github.wolfe-jam.mcp-context-card/memory": {
      "source": "project.fafm",
      "mediaType": "application/vnd.fafm+yaml",
      "iana": "https://www.iana.org/assignments/media-types/application/vnd.fafm+yaml",
      "note": "no de-facto standard for agent memory yet — this is one instantiation"
    },
    "io.github.wolfe-jam.mcp-context-card/identity": {
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
  (`io.github.wolfe-jam.mcp-context-card/context`, not `context`). No collisions, and
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

```jsonc
{
  "specVersion": "1.0",
  "host": { "displayName": "mcp-context-card", "identifier": "https://github.com/Wolfe-Jam/mcp-context-card" },
  "entries": [
    {
      "identifier": "urn:air:mcp-context-card:context",
      "type": "text/markdown",
      "mediaType": "text/markdown",
      "description": "…derived from the real AGENTS.md — section count + headings…",
      "url": "./AGENTS.md"
    },
    { "identifier": "urn:air:mcp-context-card:memory",   "type": "application/vnd.fafm+yaml", "…": "…" },
    { "identifier": "urn:air:mcp-context-card:identity", "type": "application/vnd.fafa+yaml", "…": "…" }
  ]
}
```

**Why it looks like this:**

- **`type` is the routing key.** A consumer scanning catalogs for
  `text/markdown` context, or `application/vnd.fafm+yaml` memory, finds the
  entry without knowing this publisher.
- **`identifier` is a `urn:air:` URN** scoped to the publisher
  (`urn:air:<host>:<concern>`). In ai-catalog's
  [trust‑manifest ADRs](https://github.com/Agent-Card/ai-catalog/tree/main/adr),
  `urn:air` identifiers carry a publisher‑domain‑aligned trust manifest — the
  entries here align to `github.com/Wolfe-Jam/mcp-context-card`.
- **`description` is derived from real content** — the live AGENTS.md heading
  list, the current fact count, the agent's own description — not a blurb that
  drifts. See `buildCatalog()` in [`src/catalog-gen.ts`](../src/catalog-gen.ts).
- **`url` is relative.** Served over HTTP it resolves against the origin; in a
  repo browser, against the tree.

---

## The invariant

The same three sources also render as **the card** — `GET /card` /
`render_context_card` / `docs/card.html` — the human view of exactly what a
machine reads below.

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
