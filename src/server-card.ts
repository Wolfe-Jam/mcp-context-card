/**
 * server-card — this server's MCP Server Card (SEP-2127, Final; schema v1).
 *
 * Required: `$schema`, `name` (reverse-DNS), `version`, `description`.
 * Optional fields carried here: `title`, `websiteUrl`, `repository`, `remotes`
 * (only when the caller knows the public origin, i.e. served over HTTP) and the
 * namespaced `_meta` context block. No tools, resources or prompts: a card
 * describes identity and connectivity, and primitives stay runtime-listed.
 *
 * `name`, `title` and `version` are the same values the live connection reports
 * in `serverInfo`, so the card never contradicts runtime.
 */
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import {
  DESCRIPTION,
  MCP_PATH,
  REGISTRY_NAME,
  REPOSITORY_URL,
  SERVER_CARD_SCHEMA,
  TITLE,
  VERSION,
} from "./constants.js";
import { serverCardMeta } from "./identity.js";

export interface ServerCardOptions {
  /** Public origin this server is reached at (e.g. `https://ctx.example.com`).
   *  When set, the card advertises the streamable-HTTP endpoint at `<origin>/mcp`. */
  origin?: string;
}

export function serverCard(opts: ServerCardOptions = {}) {
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: REGISTRY_NAME,
    version: VERSION,
    title: TITLE,
    description: DESCRIPTION,
    websiteUrl: REPOSITORY_URL,
    repository: { url: REPOSITORY_URL, source: "github" },
    ...(opts.origin
      ? {
          remotes: [
            {
              type: "streamable-http" as const,
              url: `${opts.origin}${MCP_PATH}`,
              supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
            },
          ],
        }
      : {}),
    _meta: serverCardMeta(),
  };
}
