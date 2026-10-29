"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll box of the Matrix: scrolls both ways inside a height limit, so the header row and the market column
 * (sticky inside it) stay visible. While there is more to the right it fades the cut-off edge and says so in
 * a line of text (nothing shows when the table fits). Keyboard users can scroll it, so it is a named region.
 */
export function MatrixScroll({
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
        {/* biome-ignore lint/a11y/useSemanticElements: a scrollable region, named and reachable by keyboard */}
        <div
          ref={ref}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users scroll the table with the arrow keys
          tabIndex={0}
          role="region"
          aria-label={label}
          className="max-h-[calc(100dvh-12rem)] min-h-64 overflow-auto"
        >
          {children}
        </div>
        {overflow && !atEnd && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-[3] w-10 bg-gradient-to-l from-card to-transparent"
          />
        )}
      </div>
      {overflow && (
        <p className="m-0 border-t px-4 py-1.5 text-muted-foreground text-tiny">{hint}</p>
      )}
    </div>
  );
}
