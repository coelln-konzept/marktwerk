"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Hrefs = { t: string; m: string; l: string; prev: string; next: string };

/**
 * Kalender keys (UX concept §6): T = heute, M = Monat, L = Liste, ← / → = zurück / weiter (previous or
 * next month, or the previous or next six weeks in Liste). Ignored while typing and while a popover,
 * menu or dialog has the focus (the arrows belong to it then).
 */
export function KalenderShortcuts({ hrefs }: { hrefs: Hrefs }) {
  const router = useRouter();
  useEffect(() => {
    const keys: Record<string, string> = {
      t: hrefs.t,
      m: hrefs.m,
      l: hrefs.l,
      arrowleft: hrefs.prev,
      arrowright: hrefs.next,
    };
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, select, textarea, [contenteditable]")) return;
      const key = event.key.toLowerCase();
      const isArrow = key.startsWith("arrow");
      if (
        isArrow &&
        (event.shiftKey || target.closest("[role=dialog], [role=menu], [role=listbox]"))
      )
        return;
      const href = keys[key];
      if (!href) return;
      event.preventDefault();
      router.push(href as never, { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hrefs.t, hrefs.m, hrefs.l, hrefs.prev, hrefs.next, router]);
  return null;
}
