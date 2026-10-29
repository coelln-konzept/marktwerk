"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Kbd } from "./kbd";

/**
 * "Vorschau": a small card top-right that previews a record without leaving the list (UX concept §4).
 * Driven by the URL (`?vorschau=<id>`), so it survives reloads and can be linked. Esc closes, Enter opens;
 * focus goes into the card and, when it closes, back to the row it came from.
 */
export function Vorschau({
  kind,
  title,
  badges,
  closeHref,
  openHref,
  children,
}: {
  kind: string;
  title: string;
  badges?: React.ReactNode;
  closeHref: string;
  openHref?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("vorschau");
  const router = useRouter();
  const openRef = useRef<HTMLAnchorElement>(null);
  const closeRef = useRef<HTMLAnchorElement>(null);

  // Remember the row that had focus, move into the card, and hand focus back when the card goes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (openRef.current ?? closeRef.current)?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Esc inside a menu or a modal dialog belongs to that.
      if (document.querySelector("[role=menu], [role=dialog]:not([aria-modal=false])")) return;
      event.preventDefault();
      router.replace(closeHref as never, { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="vorschau-title"
      className="fixed top-[72px] right-4 z-30 flex max-h-[calc(100svh-96px)] w-[min(380px,calc(100%-32px))] flex-col rounded-xl border bg-popover shadow-overlay"
    >
      <header className="flex flex-col gap-2 border-border-subtle border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-tiny">
            {t("label")} · {kind}
          </span>
          <span className="flex items-center gap-1">
            <Kbd className="touch:hidden">Esc</Kbd>
            <Link
              ref={closeRef}
              href={closeHref as never}
              scroll={false}
              replace
              aria-label={t("close")}
              className="grid size-7 place-items-center rounded-md hover:bg-hover"
            >
              <X className="size-4" />
            </Link>
          </span>
        </div>
        <h2 id="vorschau-title" className="font-semibold text-[15px]">
          {title}
        </h2>
        {badges && <div className="flex flex-wrap gap-1.5">{badges}</div>}
      </header>
      <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3">{children}</div>
      {openHref && (
        <footer className="flex items-center justify-between gap-2 border-border-subtle border-t px-4 py-3">
          <span className="text-muted-foreground text-tiny touch:hidden">{t("keys")}</span>
          <Link
            ref={openRef}
            href={openHref as never}
            className="ml-auto inline-flex min-h-8 items-center rounded-lg bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover"
          >
            {t("open")}
          </Link>
        </footer>
      )}
    </section>
  );
}

/** Definition list used in previews and detail pages. */
export function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="m-0 grid grid-cols-[132px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground text-small">{item.label}</dt>
          <dd className="m-0">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
