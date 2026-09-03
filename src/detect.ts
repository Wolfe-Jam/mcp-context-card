/**
 * detect — read a repo's mechanical facts from its manifests and layout.
 *
 * Enough to seed a `project.faf` and author a BETTER-tier AGENTS.md when the
 * repo has no `.faf` yet. Node / Rust / Python / Go are recognised; anything
 * else still gets a layout + CI read and sensible "unknown" fields.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Detected {
  name?: string;
  description?: string;
  language?: string;
  /** best-guess project shape: cli · library · app · mcp · service */
  type?: string;
  runtime?: string;
  packageManager?: string;
  install?: string;
  build?: string;
  test?: string;
  /** workflow filenames under .github/workflows */
  ci: string[];
  /** top-level directories worth listing */
  layout: string[];
  monorepo: boolean;
  /** the manifest(s) that were read */
  from: string[];
}

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".github", "dist", "build", "target", ".venv", "venv",
  "__pycache__", ".next", ".turbo", "coverage", ".cache", "vendor", ".idea", ".vscode",
]);

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export function detect(root: string): Detected {
  const d: Detected = { ci: [], layout: [], monorepo: false, from: [] };
  const has = (f: string) => existsSync(join(root, f));

  // ── layout ──────────────────────────────────────────────────────────
  try {
    d.layout = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORE_DIRS.has(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    /* leave empty */
  }

  // ── CI ──────────────────────────────────────────────────────────────
  try {
    d.ci = readdirSync(join(root, ".github/workflows"))
      .filter((f) => /\.ya?ml$/.test(f))
      .sort();
  } catch {
    /* none */
  }

  // ── Node ────────────────────────────────────────────────────────────
  const pkg = has("package.json") ? readJson(join(root, "package.json")) : undefined;
  if (pkg) {
    d.from.push("package.json");
    d.language = "TypeScript" in (pkg.devDependencies ?? {}) || pkg.types || pkg.typings
      ? "TypeScript"
      : "JavaScript";
    if (pkg.devDependencies?.typescript) d.language = "TypeScript";
    d.name ??= pkg.name;
    d.description ??= pkg.description;
    d.runtime = pkg.engines?.node ? `Node ${pkg.engines.node}` : "Node.js";
    d.monorepo = Boolean(pkg.workspaces);
    d.build = pkg.scripts?.build ? "npm run build" : undefined;
    d.test = pkg.scripts?.test ? "npm test" : undefined;
    d.packageManager = has("pnpm-lock.yaml")
      ? "pnpm"
      : has("yarn.lock")
        ? "yarn"
        : has("bun.lockb")
          ? "bun"
          : "npm";
    d.install = { npm: "npm ci", pnpm: "pnpm install", yarn: "yarn install", bun: "bun install" }[d.packageManager];
    d.type = pkg.dependencies?.["@modelcontextprotocol/sdk"]
      ? "mcp"
      : pkg.bin
        ? "cli"
        : pkg.dependencies?.next || pkg.dependencies?.react || pkg.dependencies?.svelte || pkg.dependencies?.vue
          ? "app"
          : pkg.main || pkg.exports
            ? "library"
            : undefined;
  }

  // ── Rust ────────────────────────────────────────────────────────────
  if (has("Cargo.toml")) {
    const toml = readText(join(root, "Cargo.toml"));
    d.from.push("Cargo.toml");
    d.language ??= "Rust";
    d.name ??= toml.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
    d.description ??= toml.match(/^\s*description\s*=\s*"([^"]+)"/m)?.[1];
    d.runtime ??= "Rust (cargo)";
    d.install ??= "cargo build";
    d.build ??= "cargo build --release";
    d.test ??= "cargo test";
    if (/^\s*\[workspace\]/m.test(toml)) d.monorepo = true;
    d.type ??= /^\s*\[\[bin\]\]/m.test(toml) ? "cli" : "library";
  }

  // ── Python ──────────────────────────────────────────────────────────
  if (has("pyproject.toml") || has("setup.py") || has("requirements.txt")) {
    const py = readText(join(root, "pyproject.toml"));
    d.from.push(has("pyproject.toml") ? "pyproject.toml" : has("setup.py") ? "setup.py" : "requirements.txt");
    d.language ??= "Python";
    d.name ??= py.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
    d.description ??= py.match(/^\s*description\s*=\s*"([^"]+)"/m)?.[1];
    const pm = has("uv.lock") ? "uv" : has("poetry.lock") ? "poetry" : "pip";
    d.packageManager ??= pm;
    d.runtime ??= "Python 3";
    d.install ??= { uv: "uv sync", poetry: "poetry install", pip: "pip install -e ." }[pm];
    d.test ??= "pytest";
  }

  // ── Go ──────────────────────────────────────────────────────────────
  if (has("go.mod")) {
    d.from.push("go.mod");
    d.language ??= "Go";
    d.name ??= readText(join(root, "go.mod")).match(/^module\s+(\S+)/m)?.[1]?.split("/").pop();
    d.runtime ??= "Go";
    d.install ??= "go mod download";
    d.build ??= "go build ./...";
    d.test ??= "go test ./...";
  }

  return d;
}
