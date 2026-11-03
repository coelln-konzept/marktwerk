"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const SELECT_CLASS = "min-h-(--control-h) rounded-lg border border-input bg-card px-3 py-1";

/**
 * The Markt filter of the notification center. Changing it replaces the URL on the client instead of
 * reloading the page, so the select keeps its focus (A1-11).
 */
export function MarketFilter({
  id,
  label,
  allLabel,
  value,
  markets,
}: {
  /** Two copies exist (desktop bar, phone disclosure), so the id is passed in. */
  id: string;
  label: string;
  allLabel: string;
  value: string;
  markets: { presetId: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);
  useEffect(() => setCurrent(value), [value]);

  function change(next: string) {
    setCurrent(next);
    const params = new URLSearchParams(search.toString());
    if (next) params.set("markt", next);
    else params.delete("markt");
    const query = params.toString();
    startTransition(() => {
      router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false });
    });
  }

  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name="markt"
        value={current}
        onChange={(event) => change(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{allLabel}</option>
        {markets.map((m) => (
          <option key={m.presetId} value={m.presetId}>
            {m.name}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * When the task drawer closes and focus has fallen to the page, it goes back to the row the drawer was
 * opened from (Esc returns to the list, not to the top of the page).
 */
export function DrawerFocusReturn({ taskId }: { taskId: string }) {
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        document
          .querySelector<HTMLElement>(`[data-row][data-task="${CSS.escape(taskId)}"]`)
          ?.focus({ preventScroll: true });
      });
    },
    [taskId],
  );
  return null;
}
