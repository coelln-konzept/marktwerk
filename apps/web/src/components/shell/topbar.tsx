"use client";

import { Menu } from "@base-ui/react/menu";
import {
  CalendarPlus,
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
  "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-none data-[highlighted]:bg-hover";
const VENUE_PAGE = /^\/orte\/([0-9a-f-]{36})(?:\/|$)/i;
/** The boards (all events or one event) bring their own "C = Aufgabe anlegen". */
const BOARD_PAGE = /^(?:\/veranstaltungen\/[0-9a-f-]{36})?\/board(?:\/|$)/i;

/**
 * "+ Neu": what can be created from here, only what the person may create: events (from a template, or
 * a single one, pre-filled with the venue on a venue page), task, payment, permit, shift, defect. The
 * dialogs open on their page via `?neu=1`; on an event board the new task belongs to that event.
 * Opens with the key C (not while typing, while a dialog is open, or on a board, where C creates a task).
 */
function NewMenu() {
  const t = useTranslations("topbar");
  const pathname = usePathname();
  const { creatable } = useShell();
  const [open, setOpen] = useState(false);
  const venueId = VENUE_PAGE.exec(pathname)?.[1];
  const onBoard = BOARD_PAGE.test(pathname);
  const items: { kind: Creatable; href: string; label: string; icon: LucideIcon }[] = [
    {
      kind: "task",
      href: onBoard ? `${pathname}?neu=1` : "/board?neu=1",
      label: t("newTask"),
      icon: CircleCheck,
    },
    { kind: "payable", href: "/finanzen/neu", label: t("newPayable"), icon: Wallet },
    { kind: "permit", href: "/genehmigungen?neu=1", label: t("newPermit"), icon: ShieldCheck },
    { kind: "shift", href: "/team/schichten?neu=1", label: t("newShift"), icon: Clock },
    { kind: "issue", href: "/firma/maengel?neu=1", label: t("newIssue"), icon: TriangleAlert },
  ];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || event.repeat || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || onBoard) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable]")) return;
      // Not on top of a dialog (palette, forms, Vorschau) or an open menu.
      if (document.querySelector("[role=dialog], [role=alertdialog], [role=menu]")) return;
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
          <Menu.Popup className="flex min-w-[240px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-none">
            {creatable.includes("event") && (
              <>
                <Menu.LinkItem
                  render={<Link href={"/veranstaltungen?erzeugen=1" as never} />}
                  className={MENU_ITEM}
                >
                  <Copy aria-hidden className="size-4 text-muted-foreground" />
                  {t("newFromPreset")}
                </Menu.LinkItem>
                <Menu.LinkItem
                  render={
                    <Link
                      href={
                        (venueId
                          ? `/veranstaltungen/neu?ort=${venueId}`
                          : "/veranstaltungen/neu") as never
                      }
                    />
                  }
                  className={MENU_ITEM}
                >
                  <CalendarPlus aria-hidden className="size-4 text-muted-foreground" />
                  {t("newSingle")}
                </Menu.LinkItem>
              </>
            )}
            {items
              .filter((item) => creatable.includes(item.kind))
              .map((item) => (
                <Menu.LinkItem
                  key={item.kind}
                  render={<Link href={item.href as never} />}
                  className={MENU_ITEM}
                >
                  <item.icon aria-hidden className="size-4 text-muted-foreground" />
                  {item.label}
                </Menu.LinkItem>
              ))}
            <p className="mt-1 flex items-center gap-1.5 border-border-subtle border-t px-2 pt-2 pb-1 text-muted-foreground text-tiny">
              <Kbd>C</Kbd> {t("newKey")}
            </p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * Breadcrumb (only when there is a parent to show) · visible search field (opens the palette, Ctrl+K) ·
 * "+ Neu" · the notification bell when the page passes one.
 */
export function Topbar({ crumbs, bell }: { crumbs: Crumb[]; bell?: React.ReactNode }) {
  const t = useTranslations("topbar");
  const { setNavOpen, setPaletteOpen, creatable, sidebarHidden, setSidebarHidden } = useShell();
  useVisitedPages();
  // The nearest crumb above this page, for the back button when the page was opened directly.
  const parentHref = crumbs
    .slice(0, -1)
    .reverse()
    .find((crumb) => crumb.href)?.href;
  return (
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-3 border-b bg-card px-4 py-2 lg:px-7">
      <button
        type="button"
        className="grid size-8 place-items-center rounded-lg hover:bg-hover lg:hidden"
        aria-label={t("menu")}
        onClick={() => setNavOpen(true)}
      >
        <MenuIcon className="size-5" />
      </button>
      {sidebarHidden && (
        <button
          type="button"
          className="hidden size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-hover hover:text-foreground lg:grid"
          aria-label={t("showSidebar")}
          title={t("showSidebar")}
          onClick={() => setSidebarHidden(false)}
        >
          <PanelLeftOpen aria-hidden className="size-4" />
        </button>
      )}
      {crumbs.length > 1 ? (
        <nav aria-label={t("breadcrumb")} className="flex min-w-0 flex-1 items-center gap-1.5">
          {parentHref && <BackButton parentHref={parentHref} />}
          <ol className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li
                  key={`${crumb.href ?? ""}|${crumb.label}`}
                  className="flex min-w-0 items-center gap-1.5"
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
        <Search className="size-4" />
      </button>
      {creatable.length > 0 && <NewMenu />}
      {bell}
    </header>
  );
}
