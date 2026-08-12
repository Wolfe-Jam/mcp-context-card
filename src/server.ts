/**
 * faf-trinity server — a minimal MCP server, domain-agnostic.
 *
 * Exposes:
 *   - describe_project  (context)  — requires project_name, fillable by the host
 *   - remember / recall (memory)   — file-backed against project.fafm
 *   - whoami             (identity) — reads this server's own .well-known/fafa
 *
 * No stub domain (unlike mcp-project-context's github-lite) — the pattern
 * itself is the product this time, not an example wrapped around one.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recall as recallFact, remember as rememberFact } from "./memory.js";
import { whoami } from "./identity.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fafmPath = join(root, "project.fafm");

const server = new Server(
  { name: "faf-trinity", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "describe_project",
      description: "Describe the current project.",
      inputSchema: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Project name" },
        },
        required: ["project_name"],
      },
    },
    {
      name: "remember",
      description: "Store a fact in persistent memory (project.fafm).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
        },
        required: ["id", "text"],
      },
    },
    {
      name: "recall",
      description: "Retrieve a fact from persistent memory (project.fafm).",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    {
      name: "whoami",
      description: "Return this server's own agent identity (.fafa).",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, string>;

  switch (req.params.name) {
    case "describe_project": {
      if (!args.project_name) {
        return {
          content: [
            {
              type: "text",
              text: "⛔ project_name is required — none supplied. A real agent now has to guess or ask.",
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: `✅ Scoped to project: ${args.project_name}` }],
      };
    }

    case "remember": {
      rememberFact(fafmPath, args.id, args.text);
      return { content: [{ type: "text", text: `remembered: ${args.id}` }] };
    }

    case "recall": {
      const text = recallFact(fafmPath, args.id);
      return {
        content: [{ type: "text", text: text ?? `(no memory for "${args.id}")` }],
      };
    }

    case "whoami": {
      return { content: [{ type: "text", text: whoami(root) }] };
    }

    default:
      throw new Error(`unknown tool: ${req.params.name}`);
  }
});

await server.connect(new StdioServerTransport());
