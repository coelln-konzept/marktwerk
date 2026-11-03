import type { DueItem } from "@/server/queries/due";

/**
 * Where an item of the Übersicht opens. Tasks open their drawer on the Übersicht itself
 * (`/?aufgabe=<id>`, like `/board?aufgabe=` on the board), so the lists stay in view and Esc returns to the
 * row; everything else (permits, instalments, …) goes to its own page.
 */
export function itemHref(item: Pick<DueItem, "kind" | "id" | "href">): string {
  return item.kind === "task" ? `/?aufgabe=${item.id}` : item.href;
}

/** Space on a focused row: only tasks have a drawer to peek into. */
export function itemPeek(item: Pick<DueItem, "kind" | "id">): string | undefined {
  return item.kind === "task" ? `/?aufgabe=${item.id}` : undefined;
}
