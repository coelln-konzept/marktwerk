"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Kalender keys (UX concept §6): T = heute, M = Monat, L = Liste. Ignored while typing. */
export function KalenderShortcuts({ hrefs }: { hrefs: { t: string; m: string; l: string } }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, select, textarea, [contenteditable]")) return;
      const href = ({ t: hrefs.t, m: hrefs.m, l: hrefs.l } as Record<string, string>)[
        event.key.toLowerCase()
      ];
      if (!href) return;
      event.preventDefault();
      router.push(href as never, { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hrefs.t, hrefs.m, hrefs.l, router]);
  return null;
}
