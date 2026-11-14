"use client";

import { ExternalLink, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Looks up similar records while a form is typed (UX-028): waits until typing pauses, then calls `load`.
 * `key` describes the typed values; null (nothing worth comparing) clears the result. A failed lookup
 * just shows nothing: the hint is a courtesy, never a gate.
 */
export function useSimilar<R>(key: string | null, load: () => Promise<R[]>, delayMs = 400): R[] {
  const [found, setFound] = useState<R[]>([]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (key === null) {
      setFound([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      loadRef.current().then(
        (rows) => {
          if (!cancelled) setFound(rows);
        },
        () => {
          if (!cancelled) setFound([]);
        },
      );
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, delayMs]);
  return found;
}

/**
 * "Ähnlicher Kontakt: … – trotzdem anlegen" (UX-028): a warning in the warn colour with icon and text,
 * each existing record as a link that opens in a new tab, so nothing typed here is lost. Saving is never
 * blocked; `note` says so.
 */
export function SimilarHint({
  id,
  title,
  note,
  items,
  className,
}: {
  id?: string;
  title: string;
  note: string;
  items: { id: string; href: string; label: string; reason: string }[];
  className?: string;
}) {
  // Always rendered so screen readers announce the hint when it appears; while empty it is sr-only, so
  // it takes no room (and no grid gap) in the form.
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className={items.length > 0 ? className : "sr-only"}
    >
      {items.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-status-warn bg-status-warn-bg px-3 py-2 text-small">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-status-warn" />
          <div className="min-w-0">
            <p className="font-medium text-status-warn">{title}</p>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {items.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 font-semibold text-accent-soft-foreground hover:underline"
                  >
                    {item.label}
                    <ExternalLink aria-hidden className="size-3.5" />
                  </a>{" "}
                  <span className="text-muted-foreground">{item.reason}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">{note}</p>
          </div>
        </div>
      )}
    </div>
  );
}
