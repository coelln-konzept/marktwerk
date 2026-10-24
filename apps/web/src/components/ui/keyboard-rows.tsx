"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

/** Elements inside a row that do their own thing; a click on them never opens the row. */
const INTERACTIVE =
  "a, button, input, select, textarea, label, summary, [role=button], [role=checkbox], [role=menuitem], [data-no-row-click]";

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
 * Keyboard support for list rows (UX concept §6): J/K or ↑/↓ move, Space opens the Vorschau,
 * Enter opens the record. Rows opt in with `data-row`, `data-href` and `data-peek`.
 * A mouse click anywhere in an element with `data-href` opens it, too (no `data-row` needed).
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

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-row]");
    if (!row || (event.target as HTMLElement) !== row) return;
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
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
    <div ref={ref} onKeyDown={onKeyDown} onClick={onClick} className={className}>
      {children}
    </div>
  );
}
