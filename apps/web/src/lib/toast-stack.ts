/** What the stack needs to know about a toast to decide what it replaces. */
export type StackToast = { message: string; tone?: "success" | "error" | "info"; key?: string };

/**
 * Adds a toast to the stack (oldest first) and keeps at most `max`. A toast replaces an earlier one
 * about the same thing (UX-031): the same `key` (the object it is about, e.g. `task:<id>`), or the
 * same words in the same tone (two identical toasts can't be told apart anyway). The replaced one's
 * undo stays in the undo history (top bar, Strg+Z).
 */
export function pushToast<E extends { id: number; toast: StackToast }>(
  stack: readonly E[],
  entry: E,
  max: number,
): E[] {
  const { toast } = entry;
  const tone = (t: StackToast) => t.tone ?? "success";
  const rest = stack.filter(
    (e) =>
      !(
        (toast.key !== undefined && e.toast.key === toast.key) ||
        (e.toast.message === toast.message && tone(e.toast) === tone(toast))
      ),
  );
  return [...rest, entry].slice(-max);
}
