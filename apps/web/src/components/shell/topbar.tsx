"use client";

import { Menu } from "@base-ui/react/menu";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Copy,
  type LucideIcon,
  Menu as MenuIcon,
  PanelLeftOpen,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import type { Creatable } from "@/lib/creatable";
import { BackButton, useVisitedPages } from "./back-button";
import { useShell } from "./shell-context";

export type Crumb = { label: string; href?: string };

const MENU_ITEM =
  "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[highlighted]:bg-hover";
const VENUE_PAGE = /^\/orte\/([0-9a-f-]{36})(?:\/|$)/i;
const EVENT_PAGE = /^\/veranstaltungen\/([0-9a-f-]{36})(?:\/|$)/i;
/** The boards (all events or one event) bring their own "C = Aufgabe anlegen". */
const BOARD_PAGE = /^(?:\/veranstaltungen\/[0-9a-f-]{36})?\/board(?:\/|$)/i;

/** What "+ Neu" offers first on this page: the thing people most likely came here to add. */
function leadFor(pathname: string, eventId: string | undefined): "event" | Creatable {
  if (eventId || /^\/board(?:\/|$)/.test(pathname)) return "task";
  if (/^\/genehmigungen(?:\/|$)/.test(pathname) || /^\/orte\/[^/]+\/genehmigungen/.test(pathname))
    return "permit";
  if (/^\/finanzen(?:\/|$)/.test(pathname)) return "payable";
  if (/^\/team(?:\/|$)/.test(pathname)) return "shift";
  if (/^\/firma\/maengel(?:\/|$)/.test(pathname)) return "issue";
  return "event";
}

/**
 * "+ Neu": what can be created from here, only what the person may create: events (from a template, or
 * a single one, pre-filled with the venue on a venue page), task, payment, permit, shift, defect. The
 * dialogs open on their page via `?neu=1`; on an event page the new task belongs to that event (it opens
 * on the event's board, whose dialog has the event fixed). The entry that fits the current page comes
 * first. Opens with the key C (not while typing, while a dialog is open, or on a board, where C creates
 * a task).
 */
function NewMenu() {
  const t = useTranslations("topbar");
  const pathname = usePathname();
  const { creatable } = useShell();
  const [open, setOpen] = useState(false);
  const venueId = VENUE_PAGE.exec(pathname)?.[1];
  const eventId = EVENT_PAGE.exec(pathname)?.[1];
  const onBoard = BOARD_PAGE.test(pathname);
  const taskHref = onBoard
    ? `${pathname}?neu=1`
    : eventId
      ? `/veranstaltungen/${eventId}/board?neu=1`
      : "/board?neu=1";
  const entries: {
    id: string;
    group: "event" | Creatable;
    href: string;
    label: string;
    icon: LucideIcon;
  }[] = [
    {
      id: "preset",
      group: "event",
      href: "/veranstaltungen?erzeugen=1",
      label: t("newFromPreset"),
      icon: Copy,
    },
    {
      id: "single",
      group: "event",
      href: venueId ? `/veranstaltungen/neu?ort=${venueId}` : "/veranstaltungen/neu",
      label: t("newSingle"),
      icon: CalendarPlus,
    },
    { id: "task", group: "task", href: taskHref, label: t("newTask"), icon: CircleCheck },
    {
      id: "payable",
      group: "payable",
      href: "/finanzen/neu",
      label: t("newPayable"),
      icon: Wallet,
    },
    {
      id: "permit",
      group: "permit",
      href: "/genehmigungen?neu=1",
      label: t("newPermit"),
      icon: ShieldCheck,
    },
    {
      id: "shift",
      group: "shift",
      href: "/team/schichten?neu=1",
      label: t("newShift"),
      icon: Clock,
    },
    {
      id: "issue",
      group: "issue",
      href: "/firma/maengel?neu=1",
      label: t("newIssue"),
      icon: TriangleAlert,
    },
  ];
  const lead = leadFor(pathname, eventId);
  const shown = entries
    .filter((entry) => creatable.includes(entry.group))
    // Stable: the page's own entries first, the rest in the usual order.
    .sort((a, b) => Number(b.group === lead) - Number(a.group === lead));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || event.repeat || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || onBoard) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable]")) return;
      // Not on top of a modal dialog (palette, forms) or an open menu; a Vorschau is not modal.
      if (
        document.querySelector(
          "[role=menu], [role=alertdialog], [role=dialog]:not([aria-modal=false])",
        )
      )
        return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBoard]);

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        aria-keyshortcuts="C"
        className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover data-[popup-open]:bg-hover"
      >
        <Plus aria-hidden className="size-4" />
        <span className="max-sm:sr-only">{t("new")}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup className="flex min-w-[240px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
            {shown.map((entry) => (
              <Menu.LinkItem
                key={entry.id}
                render={<Link href={entry.href as never} />}
                className={MENU_ITEM}
              >
                <entry.icon aria-hidden className="size-4 text-muted-foreground" />
                {entry.label}
              </Menu.LinkItem>
            ))}
            <p className="mt-1 flex items-center gap-1.5 border-border-subtle border-t px-2 pt-2 pb-1 text-muted-foreground text-tiny touch:hidden">
              <Kbd>C</Kbd> {t("newKey")}
            </p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * Banner of every page: breadcrumb (only when there is a parent to show; on a phone just "‹ Parent" and
 * the current title) · visible search field (opens the palette, Ctrl+K) · "+ Neu" · the notification
 * bell when the page passes one.
 */
export function Topbar({ crumbs, bell }: { crumbs: Crumb[]; bell?: React.ReactNode }) {
  const t = useTranslations("topbar");
  const { setNavOpen, setPaletteOpen, creatable, sidebarHidden, setSidebarHidden } = useShell();
  useVisitedPages();
  // The nearest crumb above this page, for the back button when the page was opened directly.
  const parent = crumbs
    .slice(0, -1)
    .reverse()
    .find((crumb) => crumb.href);
  const parentHref = parent?.href;
  const current = crumbs.at(-1);
  return (
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-3 border-b bg-card px-4 py-2 lg:px-7">
      <button
        type="button"
        className="grid size-8 place-items-center rounded-lg hover:bg-hover lg:hidden"
        aria-label={t("menu")}
        onClick={() => setNavOpen(true)}
      >
        <MenuIcon aria-hidden className="size-5" />
      </button>
      {sidebarHidden && (
        <button
          type="button"
          data-sidebar-show
          className="hidden size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-hover hover:text-foreground lg:grid"
          aria-label={t("showSidebar")}
          title={t("showSidebar")}
          onClick={() => {
            setSidebarHidden(false);
            // This button disappears with the click: focus goes to the sidebar's own hide button.
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>("[data-sidebar-hide]")?.focus(),
            );
          }}
        >
          <PanelLeftOpen aria-hidden className="size-4" />
        </button>
      )}
      {crumbs.length > 1 ? (
        <nav aria-label={t("breadcrumb")} className="flex min-w-0 flex-1 items-center gap-1.5">
          {parentHref && (
            <span className="max-sm:hidden">
              <BackButton parentHref={parentHref} />
            </span>
          )}
          {/* Phone: the way up and where you are, nothing squeezed in between. */}
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground sm:hidden">
            {parent?.href && (
              <Link
                href={parent.href as never}
                className="flex min-h-8 shrink-0 items-center gap-0.5 hover:text-foreground"
              >
                <ChevronLeft aria-hidden className="size-4" />
                <span className="max-w-[9rem] truncate">{parent.label}</span>
              </Link>
            )}
            <span aria-current="page" className="min-w-0 truncate font-semibold text-foreground">
              {current?.label}
            </span>
          </div>
          <ol className="flex min-w-0 items-center gap-1.5 text-muted-foreground max-sm:hidden">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li
                  key={`${crumb.href ?? ""}|${crumb.label}`}
                  className={
                    last
                      ? "flex min-w-0 items-center gap-1.5"
                      : "flex max-w-[16rem] shrink-0 items-center gap-1.5"
                  }
                >
                  {index > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
                  {crumb.href && !last ? (
                    <Link href={crumb.href as never} className="truncate hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={last ? "page" : undefined}
                      className={
                        last && index > 0 ? "truncate font-semibold text-foreground" : "truncate"
                      }
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : (
        <div className="flex-1" />
      )}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex min-h-9 flex-[0_1_420px] cursor-text items-center gap-2 rounded-lg border border-input bg-surface-2 pr-2 pl-3 text-left text-muted-foreground hover:border-faint-foreground max-md:hidden"
      >
        <Search aria-hidden className="size-4" />
        <span className="flex-1 truncate">{t("search")}</span>
        <Kbd>{t("shortcut")}</Kbd>
      </button>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label={t("search")}
        className="grid size-8 place-items-center rounded-lg hover:bg-hover md:hidden"
      >
        <Search aria-hidden className="size-4" />
      </button>
      {creatable.length > 0 && <NewMenu />}
      {bell}
    </header>
  );
}
