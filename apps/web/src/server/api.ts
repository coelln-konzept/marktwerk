import "server-only";
import { type Actor, getActor } from "./actor";
import { getCurrentUser } from "./session";

/**
 * Helpers for route handlers (/api/*): the proxy lets API routes through, so each handler signs the
 * caller in itself and answers with status codes instead of redirects.
 */

/** The signed-in actor, or a 401 response. */
export async function apiActor(): Promise<Actor | Response> {
  if (!(await getCurrentUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return getActor();
}

/**
 * Writing requests must come from our own pages: when the browser names an Origin, its host has to be
 * the host the request was sent to (belt and braces on top of the SameSite session cookie).
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return false;
  }
}

/** `forbidden()` from a service throws this digest. */
export function isForbiddenError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { digest?: unknown }).digest === "NEXT_HTTP_ERROR_FALLBACK;403"
  );
}

export const forbiddenResponse = () => Response.json({ error: "forbidden" }, { status: 403 });
