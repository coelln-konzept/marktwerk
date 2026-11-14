"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { cn } from "@/lib/utils";

/** How long typing pauses before the list follows. */
const DEBOUNCE_MS = 300;

/**
 * Search box of a list whose filters live in the URL: the list follows while typing (300 ms after the last
 * key) and the text is written to `?q=` with `replace`, so it survives a reload, can be linked and the
 * back button does not step through every letter. Enter applies at once. Other parameters stay; the ones in
 * `resetKeys` (the page number, an open Vorschau) are dropped, since a new search starts on page 1.
 *
 * Uncontrolled: when the URL's value changes from elsewhere ("Filter zurücksetzen"), the box takes it over
 * unless it has focus.
 */
export function LiveSearch({
  name = "q",
  defaultValue,
  resetKeys = ["seite", "vorschau"],
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "defaultValue" | "type"> & {
  name?: string;
  defaultValue?: string;
  resetKeys?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const input = ref.current;
    if (input && document.activeElement !== input) input.value = defaultValue ?? "";
  }, [defaultValue]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function apply(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const params = new URLSearchParams(window.location.search);
    const trimmed = value.trim();
    if ((params.get(name) ?? "") === trimmed) return;
    if (trimmed === "") params.delete(name);
    else params.set(name, trimmed);
    for (const key of resetKeys) params.delete(key);
    const query = params.toString();
    startTransition(() =>
      router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false }),
    );
  }

  return (
    <input
      {...props}
      ref={ref}
      type="search"
      name={name}
      defaultValue={defaultValue}
      aria-busy={pending || undefined}
      autoComplete="off"
      onChange={(event) => {
        const value = event.currentTarget.value;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => apply(value), DEBOUNCE_MS);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        // The surrounding GET form would reload the page; apply the text client-side instead.
        event.preventDefault();
        apply(event.currentTarget.value);
      }}
      className={cn(
        "min-h-(--control-h) rounded-lg border border-input bg-card px-3 placeholder:text-faint-foreground",
        className,
      )}
    />
  );
}
