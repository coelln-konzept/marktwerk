"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";

export type NavEntry = { href: string; label: string; icon: React.ReactNode; badge?: number };
export type UpcomingEntry = { key: string; label: string; icon: React.ReactNode };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Labelled module navigation (nothing hidden). Fixed 232 px column from 1024 px; below that it
 * slides in over the page from the top bar's menu button.
 */
export function SidebarNav({
  brand,
  items,
  upcoming,
  upcomingTitle,
  phaseLabel,
  navLabel,
  closeLabel,
  footer,
}: {
  brand: string;
  items: NavEntry[];
  upcoming: UpcomingEntry[];
  upcomingTitle: string;
  phaseLabel: string;
  navLabel: string;
  closeLabel: string;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const { navOpen, setNavOpen } = useShell();

  // Close the mobile navigation after navigating.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on route change only
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <>
      {navOpen && (
        <button
          type="button"
          aria-label={closeLabel}
          className="fixed inset-0 z-30 bg-scrim lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col gap-0.5 border-sidebar-border border-r bg-sidebar px-2 py-3 text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:h-svh lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2 px-2 pt-1 pb-4 font-bold text-[15px] tracking-tight"
        >
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M2.5 6.5 8 2.5l5.5 4v7h-11z" />
              <path d="M6 13.5V9.5h4v4" />
            </svg>
          </span>
          {brand}
        </Link>
        <nav aria-label={navLabel} className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href as never}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-8 items-center gap-3 rounded-lg px-2 py-1 font-medium text-foreground-2 hover:bg-hover [&_svg]:size-4 [&_svg]:text-muted-foreground",
                  active &&
                    "bg-card font-semibold text-foreground shadow-[0_0_0_1px_var(--border)] [&_svg]:text-accent-soft-foreground",
                )}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span className="tabular ml-auto inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-critical-dot px-1.5 font-bold text-[11px] text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
          <div className="px-2 pt-3 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
            {upcomingTitle}
          </div>
          {upcoming.map((item) => (
            <span
              key={item.key}
              aria-disabled="true"
              className="flex min-h-8 cursor-not-allowed items-center gap-3 px-2 py-1 font-medium text-faint-foreground [&_svg]:size-4"
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
              <span className="ml-auto rounded-md bg-status-neutral-bg px-1.5 font-semibold text-[10.5px] text-foreground-2 leading-[18px]">
                {phaseLabel}
              </span>
            </span>
          ))}
        </nav>
        <div className="border-sidebar-border border-t pt-2">{footer}</div>
      </aside>
    </>
  );
}
