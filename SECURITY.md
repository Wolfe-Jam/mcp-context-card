# Security

## Scope

`mcp-context-card` reads and writes exactly three files, inside whatever
directory the host points it at (`MCP_CONTEXT_CARD_ROOT`): `AGENTS.md`
(read-only), `project.fafm` (memory — read/write), and `.well-known/fafa`
(identity — read-only). No general file access, no shell execution, no
search. Full scope is in the README's "A base MCP — or an extension for
any other" section.

Running with `--http` / `PORT` set exposes the MCP endpoint (`POST /mcp`)
and the `.well-known/*` discovery routes over the network — the same
three-file scope applies; nothing else on the host becomes reachable
through it.

## Reporting a vulnerability

Please report privately through GitHub's [Security
Advisories](https://github.com/Wolfe-Jam/mcp-context-card/security/advisories/new)
rather than a public issue, so a fix can land before the report does.

## Supported versions

The latest version published to npm. This project doesn't maintain
parallel release branches.
