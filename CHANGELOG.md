# Changelog

## v0.1.0 (2026-08-12)

- Initial reference implementation: context, memory, and agent identity
  proven in one MCP server, using the three IANA-registered FAF formats
  (`.faf`, `.fafm`, `.fafa`) through two mechanisms already live in
  production (Server Card `_meta`, `ai-catalog.json`).
- `demo.ts` proves all three, not just describes them — memory genuinely
  crosses a process boundary.
