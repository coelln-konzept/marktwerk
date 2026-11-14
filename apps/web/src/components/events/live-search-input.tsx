"use client";

import { useEffect, useRef } from "react";

/** How long typing has to pause before the list follows (UX-038). */
const DEBOUNCE_MS = 300;

/**
 * The search box of a filter form that applies while typing: 300 ms after the last key it submits its
 * GET form, so `?q=` is in the URL (linkable, survives reload and ←). Enter applies at once. The form
 * needs an `AutoSubmitSelect`, which turns the submit into a client-side `router.replace` (focus and
 * scroll stay, the box keeps what is being typed).
 */
export function LiveSearchInput({
  defaultValue,
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "defaultValue"> & { defaultValue?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sent = useRef((defaultValue ?? "").trim());
  useEffect(() => () => clearTimeout(timer.current), []);
  // The URL changed from elsewhere (reset link, chip): that is what the list shows now.
  useEffect(() => {
    sent.current = (defaultValue ?? "").trim();
  }, [defaultValue]);

  return (
    <input
      {...props}
      type="search"
      defaultValue={defaultValue}
      onInput={(event) => {
        const input = event.currentTarget;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const value = input.value.trim();
          if (value === sent.current || !input.form) return;
          sent.current = value;
          input.form.requestSubmit();
        }, DEBOUNCE_MS);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          clearTimeout(timer.current);
          sent.current = event.currentTarget.value.trim();
        }
        onKeyDown?.(event);
      }}
    />
  );
}
