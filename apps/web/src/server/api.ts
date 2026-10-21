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

/** `forbidden()` from a service throws this digest. */
export function isForbiddenError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { digest?: unknown }).digest === "NEXT_HTTP_ERROR_FALLBACK;403"
  );
}

export const forbiddenResponse = () => Response.json({ error: "forbidden" }, { status: 403 });
