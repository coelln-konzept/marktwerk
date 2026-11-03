/** What `callAction` returns when the call itself failed (offline, 5xx, a deploy while the tab was open). */
export type NetworkFailure = { ok: false; error: "network" };

/** Error code of a call that never got an answer; messages: `errors.network` (shell.json). */
export const NETWORK_ERROR = "network";

/**
 * Runs a server action and turns a thrown error into a result. Actions answer with
 * `{ ok: true | false }`; what escapes that is the network or the framework, and inside a transition
 * such an error would reach the nearest error boundary and replace the page (A10-01). Callers handle
 * `error === "network"` like any other failure: error toast, optimistic change reverted.
 */
export async function callAction<R extends { ok: boolean }>(
  call: () => Promise<R>,
): Promise<R | NetworkFailure> {
  try {
    return await call();
  } catch (error) {
    // The cause is only useful in the console; the person gets the generic network message.
    console.warn("Server action failed", error);
    return { ok: false, error: NETWORK_ERROR };
  }
}
