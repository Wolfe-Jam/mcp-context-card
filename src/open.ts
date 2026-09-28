/**
 * Open a local file in the default browser — what `mcp-context-card card`
 * does at a terminal, and what save_context_card does when the server runs
 * locally over stdio. Fire and forget: no display (SSH, CI) just means
 * nothing opens, never an error.
 */
import { spawn } from "node:child_process";

export function openInBrowser(path: string): void {
  const [cmd, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [path]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", path]]
        : ["xdg-open", [path]];
  spawn(cmd, args, { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}
