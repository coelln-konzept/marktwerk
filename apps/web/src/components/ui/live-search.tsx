"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * The search field of a register list (Kontakte, Orte; UX-038). It searches while typing: 300 ms
 * after the last key the URL's `?q=` is replaced (no new history entry per letter), so the search
 * survives reload and Back and can be linked. Enter searches at once. Other params stay; `drop` lists
 * params that a new search resets (e.g. an open Vorschau). It is a GET form, so it also works before
 * the JavaScript has loaded.
 */
export function LiveSearch({
  label,
  placeholder,
  hidden = {},
  drop = ["vorschau"],
  className,
}: {
  label: string;
  placeholder: string;
  /** Params the plain GET form must keep (the client path keeps all params anyway). */
  hidden?: Record<string, string | undefined>;
  drop?: string[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  // The debounced call must see the URL as it is then, not as it was when the key was pressed.
  const latest = useRef(params);
  latest.current = params;

  // The URL changed from elsewhere ("Suche zurücksetzen", Back): show its search, unless the person is
  // typing in the field right now.
  useEffect(() => {
    if (document.activeElement !== input.current) setValue(urlQuery);
  }, [urlQuery]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function apply(text: string) {
    window.clearTimeout(timer.current);
    const current = latest.current;
    const next = new URLSearchParams(current.toString());
    const q = text.trim().slice(0, 100);
    if (q === (current.get("q") ?? "")) return;
    if (q) next.set("q", q);
    else next.delete("q");
    for (const key of drop) next.delete(key);
    const query = next.toString();
    startTransition(() =>
      router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false }),
    );
  }

  return (
    <form
      method="get"
      action={pathname}
      aria-busy={pending || undefined}
      className={className ?? "flex flex-wrap items-center gap-2"}
      onSubmit={(e) => {
        e.preventDefault();
        apply(value);
      }}
    >
      {Object.entries(hidden).map(([name, v]) =>
        v ? <input key={name} type="hidden" name={name} value={v} /> : null,
      )}
      <label className="sr-only" htmlFor="q">
        {label}
      </label>
      <input
        ref={input}
        id="q"
        name="q"
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          const text = e.target.value;
          setValue(text);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => apply(text), 300);
        }}
        className="min-h-(--control-h) w-72 max-w-full rounded-lg border border-input bg-card px-3"
      />
    </form>
  );
}
