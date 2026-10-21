"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type HealthLevel, HealthShape } from "@/components/ui/health";
import { cn } from "@/lib/utils";

export type EventTab = {
  key: string;
  href: string;
  label: string;
  /** Count such as "5/7" with an optional health shape. */
  count?: { text: string; level?: HealthLevel; sr?: string };
  /** Muted hint for tabs that arrive in a later milestone ("ab M2"). */
  hint?: { text: string; sr: string };
};

/** Tab bar of the event page: links to sub-routes, `aria-current="page"` and a teal underline on the active one. */
export function EventTabs({ tabs, label }: { tabs: EventTab[]; label: string }) {
  const pathname = usePathname();
  const base = tabs[0]?.href ?? "";
  const activeKey =
    tabs.find(
      (tab) => tab.href !== base && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)),
    )?.key ?? tabs[0]?.key;
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b px-4 lg:-mx-7 lg:px-7">
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href as never}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-body outline-none hover:text-foreground focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
                  active
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-foreground-2",
                )}
              >
                {tab.label}
                {tab.count && (
                  <span className="tabular inline-flex items-center gap-1 text-small text-foreground-2">
                    {tab.count.level && <HealthShape level={tab.count.level} className="size-3" />}
                    <span aria-hidden={tab.count.sr ? true : undefined}>{tab.count.text}</span>
                    {tab.count.sr && <span className="sr-only">{tab.count.sr}</span>}
                  </span>
                )}
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
      </ul>
    </nav>
  );
}
