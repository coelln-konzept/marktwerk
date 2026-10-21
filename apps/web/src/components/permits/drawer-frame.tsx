"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Kbd } from "@/components/ui/kbd";

/**
 * Right-hand drawer for a record next to its list (UX concept §4): driven by the URL, so it can be
 * linked and survives a reload; the list stays visible and usable. Esc closes, focus moves into it.
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once per opened record (title changes with it)
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [title]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Dialogs and menus inside the drawer handle Escape themselves first.
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        router.replace(closeHref as never, { scroll: false });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  return (
    <aside
      aria-labelledby="drawer-title"
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
        <h2 id="drawer-title" className="font-semibold text-[16px] leading-snug">
          {title}
        </h2>
        {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
      </header>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">{children}</div>
    </aside>
  );
}
