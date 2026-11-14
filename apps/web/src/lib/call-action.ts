/** What `callAction` returns when the call itself failed: no answer (offline) or a broken one (5xx). */
export type NetworkFailure = { ok: false; error: "network" | "server" };

/** Error code of a call that never got an answer; messages: `errors.network` (shell.json). */
export const NETWORK_ERROR = "network";
/** Error code of a call the server answered with an error of its own (5xx, a deploy while the tab was open). */
export const SERVER_ERROR = "server";

/**
 * Why a call threw: `network` when the browser is offline or the request never got through (fetch
 * rejects with a TypeError), otherwise `server` (the server answered, but not with a result). The
 * person gets different words for the two (UX-007): "keine Verbindung" is wrong for a 500.
 */
export function failureCode(
  error: unknown,
  online: boolean = typeof navigator === "undefined" ? true : navigator.onLine,
): "network" | "server" {
  if (!online || error instanceof TypeError) return NETWORK_ERROR;
  return SERVER_ERROR;
}

/** Fired on `window` while a server action runs (the shell's pending bar listens, UX-063). */
export const ACTION_EVENTS = {
  start: "marktwerk:action-start",
  end: "marktwerk:action-end",
} as const;

function signal(name: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

/** Runs `call` and tells the shell's pending bar while it runs; errors pass through. */
export async function trackPending<T>(call: () => Promise<T>): Promise<T> {
  signal(ACTION_EVENTS.start);
  try {
    return await call();
  } finally {
    signal(ACTION_EVENTS.end);
  }
}

/**
 * Runs a server action and turns a thrown error into a result. Actions answer with
 * `{ ok: true | false }`; what escapes that is the network or the framework, and inside a transition
 * such an error would reach the nearest error boundary and replace the page (A10-01). Callers handle
 * `error === "network"` like any other failure: error toast, optimistic change reverted. A code the
 * caller does not know (`server`) falls back to its generic error text.
 */
export async function callAction<R extends { ok: boolean }>(
  call: () => Promise<R>,
): Promise<R | NetworkFailure> {
  try {
    return await trackPending(call);
  } catch (error) {
    // The cause is only useful in the console; the person gets the network or server message.
    console.warn("Server action failed", error);
    return { ok: false, error: failureCode(error) };
  }
}
