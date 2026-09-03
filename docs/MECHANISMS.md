# Mechanisms

`mcp-trinity` exposes three concerns — context, memory, identity — through two
mechanisms that already exist in the MCP ecosystem. Neither is invented here.
This document is the wire‑level detail; [MECHANISMS](#the-invariant) closes with
the one invariant that ties them together.

The worked example points all keys at three IANA‑registered formats
(`.faf` / `.fafm` / `.fafa`). Everything below is about the *shape*, not the
formats — swap the artifacts and the mechanism is unchanged.

---

## Mechanism 1 — the Server Card `_meta` block

A **Server Card**
([SEP‑2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127))
is a document that describes a server. It is *not* a field on the `initialize`
result — the
SDK client keeps only `serverInfo` / `capabilities` / `instructions` from
`initialize` and discards a top‑level `_meta`. So the card is served the two
ways a client can actually consume it:

### In‑band — an MCP resource

```
resources/list  →  { uri: "mcp-trinity://server-card", mimeType: "application/json" }
resources/read  →  the card as a JSON document
```

### Out‑of‑band — a well‑known route (HTTP transport)

```
GET /.well-known/mcp/server-card   →   the same JSON document
```

### The card

```jsonc
{
  "name": "mcp-trinity",
  "version": "0.2.0",
  "_meta": {
    "one.faf/context": {
      "faf":       "./project.faf",
      "mediaType": "application/vnd.faf+yaml",
      "iana":      "https://www.iana.org/assignments/media-types/application/vnd.faf+yaml"
    },
    "one.faf/memory": {
      "fafm":      "./project.fafm",
      "mediaType": "application/vnd.fafm+yaml",
      "iana":      "https://www.iana.org/assignments/media-types/application/vnd.fafm+yaml"
    },
    "one.faf/agent": {
      "fafa":      "./.well-known/fafa",
      "mediaType": "application/vnd.fafa+yaml",
      "iana":      "https://www.iana.org/assignments/media-types/application/vnd.fafa+yaml"
    }
  }
}
```

**Why it looks like this:**

- **`_meta` is the extension point.** SEP‑2127 defines `_meta` as
  `additionalProperties: {}` — open for exactly this. A consumer that doesn't
  know a key ignores it; nothing breaks.
- **Keys are reverse‑DNS‑namespaced** (`one.faf/context`, not `context`). Two
  extensions can't collide, and a key's owner is unambiguous. Use a domain you
  control.
- **One key per concern**, each self‑describing: where the artifact is, its
  media type, and the IANA anchor for that media type. A consumer can resolve
  the artifact and know how to parse it without a prior agreement.

Built by `trinityMeta()` in [`src/identity.ts`](../src/identity.ts); assembled
into the card by `serverCard()` in [`src/server.ts`](../src/server.ts).

---

## Mechanism 2 — `ai-catalog.json` sibling entries

[ai-catalog](https://github.com/Agent-Card/ai-catalog) is a discovery format:
a publisher lists artifacts, each entry keyed by its **media type** (`type`).
`mcp-trinity` publishes one entry per concern — three siblings, one publisher.

```
GET /.well-known/ai-catalog.json
```

```jsonc
{
  "specVersion": "1.0",
  "host": {
    "displayName": "mcp-trinity",
    "identifier": "https://github.com/Wolfe-Jam/mcp-trinity"
  },
  "entries": [
    {
      "identifier":  "urn:air:mcp-trinity:context",
      "displayName": "mcp-trinity — project context (.faf)",
      "type":        "application/vnd.faf+yaml",
      "mediaType":   "application/vnd.faf+yaml",
      "description": "…derived from the real file…",
      "url":         "./project.faf",
      "_meta": { "one.faf/iana": "https://www.iana.org/assignments/media-types/application/vnd.faf+yaml" }
    },
    { "identifier": "urn:air:mcp-trinity:memory", "type": "application/vnd.fafm+yaml", "…": "…" },
    { "identifier": "urn:air:mcp-trinity:agent",  "type": "application/vnd.fafa+yaml", "…": "…" }
  ]
}
```

**Why it looks like this:**

- **`type` is the routing key.** A consumer scanning catalogs for
  `application/vnd.fafm+yaml` finds the memory entry without knowing anything
  about this publisher. `mediaType` mirrors `type` for consumers that read the
  longer field name.
- **`identifier` is a `urn:air:` URN**, scoped to the publisher
  (`urn:air:<host>:<concern>`). In ai-catalog's
  [trust‑manifest ADRs](https://github.com/Agent-Card/ai-catalog/tree/main/adr),
  `urn:air` identifiers are the ones expected to carry a publisher‑domain‑aligned
  trust manifest — the entries here align to `github.com/Wolfe-Jam/mcp-trinity`.
- **`description` is derived from the file's real content** — the authored goal,
  the live fact count, the agent's own description — not a hand‑written blurb
  that drifts. See `buildCatalog()` in
  [`src/catalog-gen.ts`](../src/catalog-gen.ts).
- **`url` is relative.** A fork serving these over HTTP resolves them against
  its own origin; a repo browser resolves them against the tree.

---

## The invariant

The same three files back **both** mechanisms:

```
project.faf   ─┐
project.fafm  ─┼─→  Server Card _meta   (one.faf/context · one.faf/memory · one.faf/agent)
.well-known/  ─┘ └─→ ai-catalog.json     (3 sibling entries, keyed by media type)
  fafa
```

`catalog-gen.ts` reads exactly the files `trinityMeta()` names, so the catalog
can't describe something the `_meta` block doesn't, or vice versa. The CI job
regenerates `ai-catalog.json` and fails on any drift
(`npm run catalog:check`). Change a source file, both surfaces move together.

That is the whole idea: **describe the artifacts once, expose them through
whatever mechanism the consumer speaks.**
