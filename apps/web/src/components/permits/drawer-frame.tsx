"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { useDrawerFocus } from "@/components/ui/drawer";
import { Kbd } from "@/components/ui/kbd";

/**
 * Right-hand drawer for a record next to its list (UX concept §4): driven by the URL, so it can be
 * linked and survives a reload; the list stays visible and usable. Same contract as the shared `Drawer`
 * (UX-035): a non-modal dialog (`role="dialog"`, `aria-modal="false"`), Esc closes unless a menu, list
 * box or modal dialog has it, focus moves into it, and the tab title names the record while it is open.
 */
export function DrawerFrame({
  label,
  title,
  badges,
  closeHref,
  closeLabel,
  children,
}: {
  label: string;
  title: string;
  badges?: React.ReactNode;
  closeHref: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("permitDrawer");
  const router = useRouter();
  const closeRef = useRef<HTMLAnchorElement>(null);

  const titleId = useId();
  useDrawerFocus(closeRef, closeHref, title);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Esc inside an open list box, menu or modal dialog belongs to that.
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role=listbox]")) return;
      if (document.querySelector('[role="menu"], [role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      router.replace(closeHref as never, { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  // "<Genehmigung> · <page title>" while the drawer is open; the page title comes back on close.
  // Next sets the page's metadata title after navigating (opening the drawer is a navigation), so the
  // prefix is put back whenever the <title> changes while the drawer is open.
  useEffect(() => {
    const prefix = `${title} · `;
    let base = document.title;
    const apply = () => {
      if (document.title.startsWith(prefix)) return;
      base = document.title;
      document.title = `${prefix}${base}`;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (document.title.startsWith(prefix)) document.title = base;
    };
  }, [title]);

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="fixed inset-y-0 right-0 z-30 flex w-[min(480px,100%)] flex-col border-l bg-popover shadow-overlay"
    >
      <header className="flex flex-col gap-2 border-border-subtle border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-tiny">{label}</span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd>
            <Link
              ref={closeRef}
              href={closeHref as never}
              scroll={false}
              replace
              aria-label={closeLabel}
              title={t("closeKey")}
              className="grid size-7 place-items-center rounded-md hover:bg-hover"
            >
              <X aria-hidden className="size-4" />
            </Link>
          </span>
        </div>
        <h2 id={titleId} className="font-semibold text-[16px] leading-snug">
          {title}
        </h2>
        {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
      </header>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">{children}</div>
    </section>
  );
}
