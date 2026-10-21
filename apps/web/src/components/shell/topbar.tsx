"use client";

import { Bell, ChevronRight, Menu as MenuIcon, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Kbd } from "@/components/ui/kbd";
import { useShell } from "./shell-context";

export type Crumb = { label: string; href?: string };

/** Breadcrumb · visible search field (opens the palette, Ctrl+K) · "+ Neu" · notifications. */
export function Topbar({ crumbs }: { crumbs: Crumb[] }) {
  const t = useTranslations("topbar");
  const { setNavOpen, setPaletteOpen } = useShell();
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
      <Link
        href="/veranstaltungen?erzeugen=1"
        className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
      >
        <Plus aria-hidden className="size-4" />
        <span className="max-sm:sr-only">{t("new")}</span>
      </Link>
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
