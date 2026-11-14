"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Clock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type HealthLevel, HealthShape } from "@/components/ui/health";
import { cn } from "@/lib/utils";

export type EventTab = {
  key: string;
  href: string;
  label: string;
  /**
   * Count such as "5/7" with an optional health shape or red `alert` text (clock icon); `short` and
   * `alertShort` replace the texts below the sm breakpoint, so the strip stays short on a phone.
   */
  count?: {
    text: string;
    short?: string;
    level?: HealthLevel;
    alert?: string;
    alertShort?: string;
    sr?: string;
  };
  /** Muted hint for tabs that arrive in a later milestone ("ab M2"). */
  hint?: { text: string; sr: string };
};

const tabClass = (active: boolean) =>
  cn(
    // 44 px touch targets on phones, the compact 40 px from sm on.
    "-mb-px flex min-h-11 cursor-pointer sm:min-h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-body hover:text-foreground focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
    active
      ? "border-primary font-semibold text-foreground"
      : "border-transparent text-foreground-2",
  );

function Count({ count }: { count: NonNullable<EventTab["count"]> }) {
  return (
    <span className="tabular inline-flex items-center gap-1 text-small text-foreground-2">
      {count.level && <HealthShape level={count.level} className="size-3" />}
      <span aria-hidden={count.sr ? true : undefined}>
        {count.short ? (
          <>
            <span className="sm:hidden">{count.short}</span>
            <span className="max-sm:hidden">{count.text}</span>
          </>
        ) : (
          count.text
        )}
      </span>
      {count.alert && (
        <span
          aria-hidden={count.sr ? true : undefined}
          className="inline-flex items-center gap-0.5 text-status-critical"
        >
          <span aria-hidden className="text-foreground-2">
            ·
          </span>
          <Clock aria-hidden className="size-3" />
          {count.alertShort ? (
            <>
              <span className="sm:hidden">{count.alertShort}</span>
              <span className="max-sm:hidden">{count.alert}</span>
            </>
          ) : (
            count.alert
          )}
        </span>
      )}
      {count.sr && <span className="sr-only">{count.sr}</span>}
    </span>
  );
}

/**
 * Tab bar of the event page: links to sub-routes, `aria-current="page"` and a teal underline on the
 * active one. The tabs in `more` (Notizen, Verlauf) sit in one "Mehr ▾" menu; each is still its own URL,
 * and the menu button is underlined while one of them is open.
 */
export function EventTabs({
  tabs,
  more = [],
  moreLabel = "",
  label,
}: {
  tabs: EventTab[];
  more?: EventTab[];
  moreLabel?: string;
  label: string;
}) {
  const pathname = usePathname();
  const base = tabs[0]?.href ?? "";
  const matches = (tab: EventTab) =>
    tab.href !== base && (pathname === tab.href || pathname.startsWith(`${tab.href}/`));
  const activeMore = more.find(matches);
  const activeKey = activeMore ? null : (tabs.find(matches)?.key ?? tabs[0]?.key);
  const nav = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // A fade on each cut-off edge shows there is more to scroll to (UX-039).
  useEffect(() => {
    const bar = nav.current;
    if (!bar) return;
    const measure = () => {
      const max = bar.scrollWidth - bar.clientWidth;
      setEdges({ start: bar.scrollLeft > 1, end: max > 1 && bar.scrollLeft < max - 1 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    bar.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      bar.removeEventListener("scroll", measure);
    };
  }, []);

  // On a phone the bar scrolls sideways: bring the open tab (or "Mehr") into view, so one always reads as
  // active. Measured on screen and clamped to the scroll range, so the first tab is never cut off.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the open tab changes
  useEffect(() => {
    const bar = nav.current;
    const current = bar?.querySelector<HTMLElement>("[aria-current=page]");
    if (!bar || !current) return;
    const barBox = bar.getBoundingClientRect();
    const box = current.getBoundingClientRect();
    const left = bar.scrollLeft + box.left - barBox.left - (barBox.width - box.width) / 2;
    const max = bar.scrollWidth - bar.clientWidth;
    bar.scrollTo({ left: Math.min(max, Math.max(0, left)) });
  }, [pathname]);

  return (
    <div className="relative -mx-4 lg:-mx-7">
      {edges.start && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent"
        />
      )}
      {edges.end && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent"
        />
      )}
      <nav ref={nav} aria-label={label} className="overflow-x-auto border-b px-4 lg:px-7">
        <ul className="flex min-w-max gap-1">
          {tabs.map((tab) => {
            const active = tab.key === activeKey;
            return (
              <li key={tab.key}>
                <Link
                  href={tab.href as never}
                  aria-current={active ? "page" : undefined}
                  className={tabClass(active)}
                >
                  {tab.label}
                  {tab.count && <Count count={tab.count} />}
                  {tab.hint && (
                    <span className="text-faint-foreground text-tiny">
                      <span aria-hidden>{tab.hint.text}</span>
                      <span className="sr-only">{tab.hint.sr}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          {more.length > 0 && (
            <li>
              <Menu.Root>
                <Menu.Trigger
                  aria-current={activeMore ? "page" : undefined}
                  className={cn(tabClass(activeMore !== undefined), "bg-transparent")}
                >
                  {/* The open sub-page names the button, so it is clear which of the three you are on. */}
                  {activeMore ? (
                    <>
                      <span className="sr-only">{moreLabel}: </span>
                      {activeMore.label}
                    </>
                  ) : (
                    moreLabel
                  )}
                  <ChevronDown aria-hidden className="-ml-1 size-4 text-muted-foreground" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
                    <Menu.Popup className="flex min-w-[180px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
                      {more.map((tab) => {
                        const active = activeMore?.key === tab.key;
                        return (
                          <Menu.LinkItem
                            key={tab.key}
                            render={<Link href={tab.href as never} />}
                            aria-current={active ? "page" : undefined}
                            className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[highlighted]:bg-hover"
                          >
                            <span className="grid size-4 place-items-center">
                              {active && <Check aria-hidden className="size-4" />}
                            </span>
                            <span className={cn(active && "font-semibold")}>{tab.label}</span>
                            {tab.count && <Count count={tab.count} />}
                          </Menu.LinkItem>
                        );
                      })}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
