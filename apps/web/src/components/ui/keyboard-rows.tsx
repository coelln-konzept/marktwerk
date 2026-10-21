"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

/**
 * Keyboard support for list rows (UX concept §6): J/K or ↑/↓ move, Space opens the Vorschau,
 * Enter opens the record. Rows opt in with `data-row`, `data-href` and `data-peek`.
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

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: delegates key handling for focusable rows inside
    <div ref={ref} onKeyDown={onKeyDown} className={className}>
      {children}
    </div>
  );
}
