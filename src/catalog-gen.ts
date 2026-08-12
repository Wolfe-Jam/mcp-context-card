/**
 * catalog-gen — generates .well-known/ai-catalog.json from the same three
 * source files (project.faf, project.fafm, .well-known/fafa) that back
 * the Server Card _meta trinity block. Same three artifacts, second proven
 * mechanism — matches the live pattern at faf.one/.well-known/ai-catalog.json.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const catalog = {
  specVersion: "1.0",
  host: {
    displayName: "faf-trinity",
    identifier: "https://github.com/Wolfe-Jam/faf-trinity",
  },
  entries: [
    {
      identifier: "urn:air:faf-trinity:context",
      displayName: "faf-trinity — Project Context (.faf)",
      type: "application/vnd.faf+yaml",
      description: "IANA-registered project context.",
      url: "./project.faf",
    },
    {
      identifier: "urn:air:faf-trinity:memory",
      displayName: "faf-trinity — Persistent Memory (.fafm)",
      type: "application/vnd.fafm+yaml",
      description: "IANA-registered memory — recall survives a process restart.",
      url: "./project.fafm",
    },
    {
      identifier: "urn:air:faf-trinity:agent",
      displayName: "faf-trinity — Agent Identity (.fafa)",
      type: "application/vnd.fafa+yaml",
      description: "IANA-registered agent identity card.",
      url: "./.well-known/fafa",
    },
  ],
};

const root = join(new URL("..", import.meta.url).pathname);
writeFileSync(join(root, ".well-known/ai-catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log("wrote .well-known/ai-catalog.json — 3 sibling entries");
