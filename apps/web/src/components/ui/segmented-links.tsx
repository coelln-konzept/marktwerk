"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useTransition } from "react";
import { cn } from "@/lib/utils";

export type SegmentItem = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  /** Optional count shown after the label (e.g. open tasks). */
  count?: number;
};

/**
 * While a segment navigation is pending, the page content reads as busy (`aria-busy`, slightly
 * dimmed) so a slow server answer does not look like a dead click (A10-04). Restored on settle/unmount.
 */
function useBusyMain(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    const main = document.querySelector("main");
    if (!main) return;
    const before = { opacity: main.style.opacity, transition: main.style.transition };
    main.setAttribute("aria-busy", "true");
    main.style.transition = "opacity 150ms ease-out";
    main.style.opacity = "0.6";
    return () => {
      main.removeAttribute("aria-busy");
      main.style.opacity = before.opacity;
      main.style.transition = before.transition;
    };
  }, [pending]);
}

/**
 * The connected segments themselves (no group semantics); use inside a labelled group. The clicked
 * segment shows as selected immediately; the URL and the content follow when the server answers.
 */
export function Segments({ items }: { items: SegmentItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useOptimistic(items.find((item) => item.active)?.key);
  useBusyMain(pending);

  return (
    <div className="inline-flex max-w-full flex-wrap rounded-lg border border-input bg-sunken p-0.5">
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            href={item.href as never}
            scroll={false}
            aria-current={active ? "true" : undefined}
            onClick={(event) => {
              // New tab / window / download clicks keep the browser's behaviour.
              if (event.defaultPrevented || event.button !== 0) return;
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              startTransition(() => {
                setActiveKey(item.key);
                router.push(item.href as never, { scroll: false });
              });
            }}
            // One segmented style app-wide: a raised card pill. A near-white/near-black fill would
            // out-shout the primary button (V6); the outline keeps it visible in dark mode.
            className={cn(
              "inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium text-small focus-visible:outline-2 focus-visible:outline-ring",
              active
                ? "bg-card font-semibold text-foreground shadow-card ring-1 ring-input"
                : "text-foreground-2 hover:bg-hover",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  "tabular inline-grid h-5 min-w-5 place-items-center rounded-full px-1 font-semibold text-[11.5px]",
                  active
                    ? "bg-accent-soft text-accent-soft-foreground"
                    : "bg-status-neutral-bg text-foreground-2",
                )}
              >
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Segmented control whose choice lives in the URL (links with `aria-current`), e.g. Spalten · Nach Person.
 * Stand-alone: carries its own labelled group. Inside a `FilterGroup` use `Segments` instead.
 */
export function SegmentedLinks({ label, items }: { label: string; items: SegmentItem[] }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls
    <div role="group" aria-label={label} className="inline-flex max-w-full">
      <Segments items={items} />
    </div>
  );
}
