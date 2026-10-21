"use client";

import { Menu } from "@base-ui/react/menu";
import {
  Bell,
  CalendarPlus,
  ChevronRight,
  Copy,
  Menu as MenuIcon,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { useShell } from "./shell-context";

export type Crumb = { label: string; href?: string };

const MENU_ITEM =
  "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-none data-[highlighted]:bg-hover";
const VENUE_PAGE = /^\/orte\/([0-9a-f-]{36})(?:\/|$)/i;

/**
 * "+ Neu": what can be created from here. Both entries create events; on a venue page the single event
 * is pre-filled with that venue. Opens with the key C (not while typing or while a dialog is open).
 */
function NewMenu() {
  const t = useTranslations("topbar");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const venueId = VENUE_PAGE.exec(pathname)?.[1];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || event.repeat || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable]")) return;
      // Not on top of a dialog (palette, forms, Vorschau) or an open menu.
      if (document.querySelector("[role=dialog], [role=alertdialog], [role=menu]")) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
            <p className="mt-1 flex items-center gap-1.5 border-border-subtle border-t px-2 pt-2 pb-1 text-muted-foreground text-tiny">
              <Kbd>C</Kbd> {t("newKey")}
            </p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Breadcrumb · visible search field (opens the palette, Ctrl+K) · "+ Neu" · notifications. */
export function Topbar({ crumbs }: { crumbs: Crumb[] }) {
  const t = useTranslations("topbar");
  const { setNavOpen, setPaletteOpen, canCreateEvents } = useShell();
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
      <nav aria-label={t("breadcrumb")} className="min-w-0 flex-1">
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
      {canCreateEvents && <NewMenu />}
      <Link
        href="/benachrichtigungen"
        aria-label={t("notifications")}
        className="relative grid size-8 place-items-center rounded-lg hover:bg-hover"
      >
        <Bell className="size-4" />
      </Link>
    </header>
  );
}
