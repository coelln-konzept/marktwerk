"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/**
 * "50 von 180 Terminen · 50 weitere Termine anzeigen" below the Veranstaltungen list. It stays once every
 * row is shown (with `allText` instead of the link), and when the last click loaded the rest the focus
 * moves from the vanished link to that text, so keyboard users do not land on <body>.
 */
export function PagingMore({
  shownText,
  allText,
  moreText,
  moreHref,
}: {
  shownText: string;
  allText: string;
  moreText: string;
  /** The link to the next page of rows; null when every row is shown. */
  moreHref: string | null;
}) {
  const linkFocused = useRef(false);
  const status = useRef<HTMLSpanElement>(null);
  const hasMore = moreHref !== null;

  useEffect(() => {
    if (hasMore || !linkFocused.current) return;
    linkFocused.current = false;
    status.current?.focus();
  }, [hasMore]);

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-small">
      <span ref={status} tabIndex={-1} role="status" className="tabular outline-none">
        {hasMore ? shownText : allText}
      </span>
      {moreHref && (
        <Link
          href={moreHref as never}
          scroll={false}
          onFocus={() => {
            linkFocused.current = true;
          }}
          onBlur={(e) => {
            // Unmounting does not blur; a real move elsewhere does.
            if (e.relatedTarget) linkFocused.current = false;
          }}
          className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium text-foreground hover:bg-hover"
        >
          {moreText}
        </Link>
      )}
    </p>
  );
}
