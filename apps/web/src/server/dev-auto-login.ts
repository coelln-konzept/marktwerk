/**
 * Local development convenience: skip the login page by signing in a configured account
 * automatically. Active only when ALL of these hold, so it can never switch on in a deployment:
 * - `NODE_ENV` is `development` (`next dev`; production builds always have `production`),
 * - `DEV_AUTO_LOGIN_EMAIL` and `DEV_AUTO_LOGIN_PASSWORD` are set (only in a local `.env`),
 * - the request's `Host` header is localhost (`next dev` also listens on the local network, and its
 *   `nextUrl.hostname` says "localhost" for every request, so the header is what counts).
 * The Host check is a light guard, not a security boundary (a client on the network can send any
 * Host header): the dev server already accepts the seeded dev passwords from the network, so this
 * adds no access beyond that. Never set these variables anywhere but a local `.env`.
 * It signs in through the normal email + password flow, so a wrong password simply shows the
 * login page. Signing out sets {@link DEV_AUTO_LOGIN_OPT_OUT} for the browser session, so other
 * accounts can still be tried.
 *
 * Reads `process.env` directly (not `env`) because `proxy.ts` imports it and must stay light.
 */

export const DEV_AUTO_LOGIN_PATH = "/api/dev/auto-login";
/** Session cookie set on sign-out in development; while present, no automatic sign-in happens. */
export const DEV_AUTO_LOGIN_OPT_OUT = "mw-dev-no-auto-login";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `host` is the request's `Host` header (with or without port). */
export function devAutoLoginAccount(
  host: string | null,
): { email: string; password: string } | null {
  if (process.env.NODE_ENV !== "development") return null;
  const hostname = host?.replace(/:\d+$/, "") ?? "";
  if (!LOCAL_HOSTS.has(hostname)) return null;
  const email = process.env.DEV_AUTO_LOGIN_EMAIL;
  const password = process.env.DEV_AUTO_LOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}

/** Only same-origin paths may be used as the target after signing in. */
export function safeNext(next: string | null | undefined): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}
