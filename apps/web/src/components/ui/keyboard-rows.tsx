"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Elements inside a row that do their own thing; a click on them never opens the row. */
const INTERACTIVE =
  "a, button, input, select, textarea, label, summary, [role=button], [role=checkbox], [role=menuitem], [data-no-row-click]";

const ROW = "[data-row]";
/** What takes Tab inside a row. These leave the tab order while their row is not the active one. */
const TABBABLE =
  'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
/** Marks a descendant whose own tabindex was parked: holds the value to restore ("" = it had none). */
const PARKED = "data-roving-tabindex";
/** Fired on the container when another row became the active one. */
const ACTIVE_EVENT = "keyboardrows:active";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));

/** Rows that can take focus right now (not inside a closed <details>, not hidden). */
function visibleRows(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(ROW)].filter(
    (row) => row.getClientRects().length > 0,
  );
}

/**
 * Opens `href` for a mouse click anywhere in a row or box (the whole box is the target, not only its title).
 * Ignores clicks on links/buttons inside it, clicks from portals (menus, popovers), text selections and
 * clicks another handler already took. Cmd/Ctrl-click opens a new tab like a real link.
 */
export function openOnRowClick(
  event: React.MouseEvent<HTMLElement>,
  href: string | undefined,
  push: (href: string) => void,
) {
  if (!href || event.defaultPrevented || event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (!event.currentTarget.contains(target)) return;
  if (target.closest(INTERACTIVE)) return;
  if (window.getSelection()?.toString()) return;
  event.preventDefault();
  if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
  else push(href);
}

/**
 * Moves focus to the row after `from` (the one before it when `from` is the last), for a row that is
 * about to leave the list: ticked off into a collapsed group, archived, … Without it the focused element
 * disappears, focus falls to <body> and the next J/K/E does nothing.
 */
export function focusNeighbourRow(from: HTMLElement | null): boolean {
  const row = from?.closest<HTMLElement>(ROW);
  const container = row?.closest<HTMLElement>("[data-keyboard-rows]");
  if (!row || !container) return false;
  const rows = visibleRows(container);
  const index = rows.indexOf(row);
  const next = rows[index + 1] ?? rows[index - 1];
  if (!next) return false;
  next.focus();
  return true;
}

/**
 * Keyboard support for list rows (UX concept §6): J/K or ↑/↓ move, Space opens the Vorschau,
 * Enter opens the record. Rows opt in with `data-row`, `data-href` and `data-peek`.
 * A mouse click anywhere in an element with `data-href` opens it, too (no `data-row` needed).
 *
 * The rows of one list are ONE tab stop (roving tabindex): only the active row (the one focused last,
 * else the first) is tabbable, together with the links and buttons inside it; the other rows and their
 * controls are reached with J/K. J/K with nothing focused start at the first row.
 */
export function KeyboardRows({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLElement | null>(null);

  // Roving tabindex. Rows come and go (filters, groups, optimistic updates), so this watches the container
  // instead of relying on the caller's render. Rows without a tabindex become focusable here, too.
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let scheduled = false;
    function apply() {
      scheduled = false;
      if (!container) return;
      const rows = [...container.querySelectorAll<HTMLElement>(ROW)];
      if (rows.length === 0) return;
      const current =
        active.current && rows.includes(active.current)
          ? active.current
          : (rows.find((row) => row.getClientRects().length > 0) ?? rows[0]);
      for (const row of rows) {
        const on = row === current;
        const want = on ? "0" : "-1";
        if (row.getAttribute("tabindex") !== want) row.setAttribute("tabindex", want);
        for (const el of row.querySelectorAll<HTMLElement>(on ? `[${PARKED}]` : TABBABLE)) {
          if (el.closest(ROW) !== row) continue; // belongs to a nested row
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
    container.addEventListener(ACTIVE_EVENT, schedule);
    return () => {
      observer.disconnect();
      container.removeEventListener(ACTIVE_EVENT, schedule);
    };
  }, []);

  // J/K with nothing focused: start at the first row (the page is a list the user is looking at).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const container = ref.current;
      if (!container || event.defaultPrevented) return;
      if (event.key !== "j" && event.key !== "k") return;
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      const focused = document.activeElement;
      if (focused && focused !== document.body && focused !== document.documentElement) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      const first = visibleRows(container)[0];
      if (!first) return;
      event.preventDefault();
      first.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onFocus(event: React.FocusEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>(ROW);
    if (!row || active.current === row) return;
    active.current = row;
    ref.current?.dispatchEvent(new Event(ACTIVE_EVENT));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>(ROW);
    if (!row || (event.target as HTMLElement) !== row) return;
    const rows = visibleRows(ref.current ?? document);
    const index = rows.indexOf(row);
    const key = event.key;
    if (key === "ArrowDown" || key === "j") {
      event.preventDefault();
      rows[Math.min(index + 1, rows.length - 1)]?.focus();
    } else if (key === "ArrowUp" || key === "k") {
      event.preventDefault();
      rows[Math.max(index - 1, 0)]?.focus();
    } else if (key === " " && row.dataset.peek) {
      event.preventDefault();
      router.replace(row.dataset.peek as never, { scroll: false });
    } else if (key === "Enter" && row.dataset.href) {
      event.preventDefault();
      router.push(row.dataset.href as never);
    }
  }

  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const box = (event.target as HTMLElement).closest<HTMLElement>("[data-href]");
    if (!box || !ref.current?.contains(box)) return;
    openOnRowClick(event, box.dataset.href, (href) =>
      // A drawer or Vorschau on this page keeps the scroll position; another page starts at the top.
      router.push(href as never, {
        scroll: new URL(href, window.location.href).pathname !== window.location.pathname,
      }),
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: delegates key and click handling for the rows inside
    <div
      ref={ref}
      data-keyboard-rows
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={onClick}
      className={className}
    >
      {children}
    </div>
  );
}
