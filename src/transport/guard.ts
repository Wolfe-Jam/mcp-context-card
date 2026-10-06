/**
 * guard — DNS-rebinding and cross-origin protection for the HTTP transport.
 *
 * The MCP transports spec (Streamable HTTP, Security Warning):
 *   1. Servers MUST validate the `Origin` header on all incoming connections;
 *      a present, invalid `Origin` gets 403 Forbidden.
 *   2. When running locally, servers SHOULD bind only to localhost.
 *   3. Servers SHOULD authenticate all connections (left to the deployer; see
 *      the README).
 *
 * `hostGuard` mirrors the SDK's Express `hostHeaderValidation` (hostname only,
 * any port; 403 with a JSON-RPC error and `id: null`) for Hono. A local server
 * accepts loopback Host names only, which is what stops a rebound DNS name
 * from reaching it: plain GETs often carry no `Origin`, but always a `Host`.
 *
 * `originGuard` passes requests without an `Origin` (non-browser clients) and
 * browser requests from loopback pages, an allowlisted origin, or the server's
 * own origin. Everything else is refused before any route runs.
 */
import type { Context, MiddlewareHandler } from "hono";

/** Loopback host names, as a URL parser reports them (IPv6 in brackets). */
export const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"] as const;

export const isLoopbackHostname = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  return (LOOPBACK_HOSTNAMES as readonly string[]).includes(h) || /^127(\.\d{1,3}){3}$/.test(h);
};

/** A bind address that keeps the server on this machine. */
export const isLoopbackBind = (address: string): boolean =>
  isLoopbackHostname(address.startsWith("[") || !address.includes(":") ? address : `[${address}]`);

/** Comma-separated env value → trimmed, non-empty entries. */
export const listFromEnv = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function forbidden(c: Context, message: string): Response {
  return c.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, 403);
}

function hostnameOf(hostHeader: string): string | null {
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Refuse any request whose Host name is not loopback or in `allowed`. */
export function hostGuard(allowed: readonly string[] = []): MiddlewareHandler {
  const extra = allowed.map((h) => h.toLowerCase());
  return async (c, next) => {
    // Real HTTP always carries Host; an in-process request falls back to its URL.
    const host = c.req.header("host") ?? new URL(c.req.url).host;
    if (!host) return forbidden(c, "Missing Host header");
    const hostname = hostnameOf(host);
    if (!hostname) return forbidden(c, `Invalid Host header: ${host}`);
    if (!isLoopbackHostname(hostname) && !extra.includes(hostname)) return forbidden(c, `Invalid Host: ${hostname}`);
    await next();
  };
}

/**
 * Refuse a request whose `Origin` is present and not loopback, allowlisted or
 * this server's own. `exempt(path)` skips paths that the Server Card spec
 * requires to be readable from any origin (`Access-Control-Allow-Origin: *`).
 */
export function originGuard(
  allowedOrigins: readonly string[] = [],
  exempt: (path: string) => boolean = () => false,
): MiddlewareHandler {
  const allowed = new Set(allowedOrigins.map((o) => o.replace(/\/+$/, "").toLowerCase()));
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin === undefined || exempt(c.req.path)) return next();
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return forbidden(c, `Invalid Origin: ${origin}`);
    }
    const ok =
      isLoopbackHostname(url.hostname) ||
      allowed.has(url.origin.toLowerCase()) ||
      url.host.toLowerCase() === (c.req.header("host") ?? new URL(c.req.url).host).toLowerCase();
    if (!ok) return forbidden(c, `Invalid Origin: ${origin}`);
    await next();
  };
}
