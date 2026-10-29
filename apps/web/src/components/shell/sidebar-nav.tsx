"use client";

import { ChevronRight, PanelLeftClose } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { UI_STATE_COOKIES, writeUiState } from "@/lib/ui-state";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";

export type NavEntry = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  /** Spoken explanation of the badge (what the number counts). */
  badgeLabel?: string;
};

/** A collapsible group of less frequent entries (Stammdaten). */
export type NavGroup = {
  label: string;
  items: NavEntry[];
  defaultOpen: boolean;
  /** Spoken on the collapsed group when the current page is inside it. */
  activeLabel: string;
};

const DESKTOP = "(min-width: 1024px)";

/** From 1024 px the sidebar is a fixed column; below that it is a panel over the page. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

/** Focusable, visible controls of the panel, for the focus trap. */
function tabStops(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter(
    (el) => el.getClientRects().length > 0 && el.tabIndex >= 0,
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The icon of a link; it pulses while the page behind the link loads (so it must sit inside the Link). */
function NavIcon({ icon }: { icon: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      data-pending={pending ? "" : undefined}
      className={cn("inline-grid place-items-center", pending && "animate-pulse")}
    >
      {icon}
    </span>
  );
}

function NavLink({ item, pathname }: { item: NavEntry; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href as never}
      aria-current={active ? "page" : undefined}
      title={item.badge && item.badgeLabel ? `${item.label}: ${item.badgeLabel}` : undefined}
      className={cn(
        "flex min-h-8 items-center gap-3 rounded-lg px-2 py-1 font-medium text-foreground-2 hover:bg-hover has-data-[pending]:bg-hover [&_svg]:size-4 [&_svg]:text-muted-foreground",
        active &&
          "bg-card font-semibold text-foreground shadow-[0_0_0_1px_var(--border)] [&_svg]:text-accent-soft-foreground",
      )}
    >
      <NavIcon icon={item.icon} />
      <span className="truncate">{item.label}</span>
      {item.badge ? (
        <span className="tabular ml-auto inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-critical-dot px-1.5 font-bold text-[11px] text-on-critical">
          {item.badge}
          {item.badgeLabel && <span className="sr-only"> {item.badgeLabel}</span>}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Labelled module navigation. Fixed 232 px column from 1024 px; below that it slides in over the page
 * from the top bar's menu button (a dialog while open: focus moves in and stays, Esc closes and hands
 * focus back; inert while closed). Five daily entries, then one collapsible group (Stammdaten) whose
 * state is remembered; it opens by itself when the current page is inside it.
 */
export function SidebarNav({
  brand,
  items,
  group,
  navLabel,
  closeLabel,
  hideLabel,
  footer,
}: {
  brand: string;
  items: NavEntry[];
  group: NavGroup | null;
  navLabel: string;
  closeLabel: string;
  /** The button at the top right: hides the sidebar on wide screens, closes it on phones. */
  hideLabel: string;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const { navOpen, setNavOpen, sidebarHidden, setSidebarHidden } = useShell();
  const groupId = useId();
  const inGroup = group?.items.some((i) => isActive(pathname, i.href)) ?? false;
  const [groupOpen, setGroupOpen] = useState(group?.defaultOpen ?? false);
  // The group is collapsed but the page you are on is inside it: the group row says so.
  const collapsedActive = inGroup && !groupOpen;
  const isDesktop = useIsDesktop();
  const mobileOpen = navOpen && !isDesktop;
  const panelRef = useRef<HTMLDivElement>(null);

  // Close the mobile navigation after navigating.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on route change only
  useEffect(() => setNavOpen(false), [pathname]);
  // Arriving on a page of the group (link, palette, back button) shows where you are.
  useEffect(() => {
    if (inGroup) setGroupOpen(true);
  }, [inGroup]);

  // Opening the panel moves focus in and keeps it there; Esc or closing hands it back to the menu button.
  useEffect(() => {
    if (!mobileOpen) return;
    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (panel?.querySelector<HTMLElement>("nav a") ?? panel)?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      // An open menu (profile) and a key it already used are not ours.
      if (event.defaultPrevented || document.querySelector("[role=menu]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setNavOpen(false);
      } else if (event.key === "Tab" && panel) {
        const stops = tabStops(panel);
        const first = stops[0];
        const last = stops.at(-1);
        const inside = panel.contains(document.activeElement);
        if (event.shiftKey && (document.activeElement === first || !inside)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [mobileOpen, setNavOpen]);

  function toggleGroup() {
    const next = !groupOpen;
    setGroupOpen(next);
    writeUiState(UI_STATE_COOKIES.navMasterData, next);
  }

  return (
    <>
      {navOpen && (
        <button
          type="button"
          aria-label={closeLabel}
          tabIndex={-1}
          className="fixed inset-0 z-30 bg-scrim lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      {/* Not an <aside>: the navigation inside is labelled, the page's landmarks stay banner + main. */}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: a dialog only while the phone panel is open */}
      <div
        ref={panelRef}
        tabIndex={-1}
        inert={!isDesktop && !navOpen}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? navLabel : undefined}
        data-closed={navOpen ? undefined : ""}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col gap-0.5 border-sidebar-border border-r bg-sidebar px-2 py-3 text-sidebar-foreground transition-[transform,visibility] focus:outline-none max-lg:data-[closed]:invisible lg:sticky lg:top-0 lg:h-svh lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
          sidebarHidden && "lg:hidden",
        )}
      >
        <div className="flex items-start justify-between gap-2">
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
          <button
            type="button"
            aria-label={hideLabel}
            title={hideLabel}
            data-sidebar-hide
            onClick={() => {
              if (window.matchMedia(DESKTOP).matches) {
                setSidebarHidden(true);
                // The button disappears with the sidebar: focus goes to its counterpart in the top bar.
                requestAnimationFrame(() =>
                  document.querySelector<HTMLElement>("[data-sidebar-show]")?.focus(),
                );
              } else setNavOpen(false);
            }}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <PanelLeftClose aria-hidden className="size-4" />
          </button>
        </div>
        <nav aria-label={navLabel} className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          {group && group.items.length > 0 && (
            <div className="mt-3 flex flex-col gap-0.5 border-sidebar-border border-t pt-2">
              <button
                type="button"
                onClick={toggleGroup}
                aria-expanded={groupOpen}
                aria-controls={groupId}
                className={cn(
                  "flex min-h-8 w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-left font-medium text-foreground-2 hover:bg-hover",
                  collapsedActive &&
                    "bg-card font-semibold text-foreground shadow-[0_0_0_1px_var(--border)]",
                )}
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    groupOpen && "rotate-90",
                  )}
                />
                <span className="truncate">{group.label}</span>
                {collapsedActive && (
                  <>
                    <span
                      aria-hidden
                      className="ml-auto size-1.5 shrink-0 rounded-full bg-accent-soft-foreground"
                    />
                    <span className="sr-only">{group.activeLabel}</span>
                  </>
                )}
              </button>
              <div id={groupId} className={cn("flex-col gap-0.5", groupOpen ? "flex" : "hidden")}>
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            </div>
          )}
        </nav>
        <div className="border-sidebar-border border-t pt-2">{footer}</div>
      </div>
    </>
  );
}
