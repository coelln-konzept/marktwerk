"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Horizontal scroll container for wide tables that makes the overflow visible: a fade on the cut-off
 * edge and a line of text ("seitlich scrollen") while there is more to the right. Nothing shows when
 * the content fits.
 */
export function ScrollX({
  hint,
  label,
  children,
}: {
  hint: string;
  /** Accessible name of the scrollable region. */
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setOverflow(el.scrollWidth > el.clientWidth + 1);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    <div>
      <div className="relative">
        <div
          ref={ref}
          // Keyboard users scroll the table sideways, so a scrollable region is focusable and named.
          {...(overflow ? { tabIndex: 0, role: "region", "aria-label": label } : {})}
          className="overflow-x-auto"
        >
          {children}
        </div>
        {overflow && !atEnd && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent"
          />
        )}
      </div>
      {overflow && (
        <p className="m-0 border-t px-4 py-1.5 text-muted-foreground text-tiny">{hint}</p>
      )}
    </div>
  );
}
