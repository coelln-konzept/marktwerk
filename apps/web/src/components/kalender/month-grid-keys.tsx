"use client";

import { addDays, mondayOf } from "@marktwerk/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const CELL = "[data-day]";
/** What takes Tab inside a day. It leaves the tab order while its day is not the active one. */
const TABBABLE =
  'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
/** Marks a descendant whose own tabindex was parked: holds the value to restore ("" = it had none). */
const PARKED = "data-roving-tabindex";

const cellOf = (container: HTMLElement, day: string) =>
  container.querySelector<HTMLElement>(`[data-day="${day}"]`);

/**
 * Keyboard model of the Kalender month grid (UX-036, the KeyboardRows roving model on a grid): the whole
 * grid is ONE tab stop, the active day (focused last, else `initial`: today, or the 1st of the month).
 * ← → ↑ ↓ move a day or a week, Pos1/Ende go to Monday/Sunday, Enter goes to the day's first entry, N
 * opens "Besprechung anlegen" for that day (`data-add-href`). Only the active day's entries take Tab, so
 * the 42 days and their "+" links no longer sit between the toolbar and the first entry.
 */
export function MonthGridKeys({
  initial,
  children,
}: {
  /** The day that takes Tab until another one was focused. */
  initial: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<string | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let scheduled = false;
    function apply() {
      scheduled = false;
      if (!container) return;
      const cells = [...container.querySelectorAll<HTMLElement>(CELL)];
      if (cells.length === 0) return;
      const current =
        cells.find((c) => c.dataset.day === active.current) ??
        cells.find((c) => c.dataset.day === initial) ??
        (cells[0] as HTMLElement);
      for (const cell of cells) {
        const on = cell === current;
        const want = on ? "0" : "-1";
        if (cell.getAttribute("tabindex") !== want) cell.setAttribute("tabindex", want);
        for (const el of cell.querySelectorAll<HTMLElement>(on ? `[${PARKED}]` : TABBABLE)) {
          if (on) {
            const before = el.getAttribute(PARKED);
            if (before === null) continue;
            if (before === "") el.removeAttribute("tabindex");
            else el.setAttribute("tabindex", before);
            el.removeAttribute(PARKED);
          } else if (!el.hasAttribute(PARKED)) {
            el.setAttribute(PARKED, el.getAttribute("tabindex") ?? "");
            el.setAttribute("tabindex", "-1");
          }
        }
      }
    }
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(apply);
    };
    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(container, { childList: true, subtree: true });
    container.addEventListener("monthgrid:active", schedule);
    return () => {
      observer.disconnect();
      container.removeEventListener("monthgrid:active", schedule);
    };
  }, [initial]);

  function onFocus(event: React.FocusEvent<HTMLDivElement>) {
    const cell = (event.target as HTMLElement).closest<HTMLElement>(CELL);
    const day = cell?.dataset.day;
    if (!day || active.current === day) return;
    active.current = day;
    ref.current?.dispatchEvent(new Event("monthgrid:active"));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const cell = event.target as HTMLElement;
    const day = cell.dataset.day;
    const container = ref.current;
    if (!day || !container || !cell.matches(CELL)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const monday = mondayOf(day);
    const target: Record<string, string> = {
      ArrowLeft: addDays(day, -1),
      ArrowRight: addDays(day, 1),
      ArrowUp: addDays(day, -7),
      ArrowDown: addDays(day, 7),
      Home: monday,
      End: addDays(monday, 6),
    };
    const next = target[event.key];
    if (next) {
      // Also at the edge of the grid: the arrows belong to the grid here, not to month paging.
      event.preventDefault();
      cellOf(container, next)?.focus();
      return;
    }
    if (event.key === "Enter") {
      // The first entry that is on screen (the phone layout shows the day's summary button instead).
      const entry = [...cell.querySelectorAll<HTMLElement>(TABBABLE)].find(
        (el) => el.getClientRects().length > 0 && !el.hasAttribute("data-add"),
      );
      if (entry) {
        event.preventDefault();
        entry.focus();
      }
      return;
    }
    if ((event.key === "n" || event.key === "N") && cell.dataset.addHref) {
      event.preventDefault();
      router.push(cell.dataset.addHref as never, { scroll: false });
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: delegates key handling for the day cells inside
    <div ref={ref} onFocus={onFocus} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
