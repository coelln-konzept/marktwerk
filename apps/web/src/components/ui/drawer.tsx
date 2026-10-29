"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { Kbd } from "./kbd";

/** Query pairs that are in the URL now but not in the close URL: the ones that opened this drawer. */
function openingPairs(closeHref: string): string[] {
  const now = new URLSearchParams(window.location.search);
  const closed = new URL(closeHref, window.location.href).searchParams;
  const pairs: string[] = [];
  for (const [key, value] of now) if (closed.get(key) !== value) pairs.push(`${key}=${value}`);
  return pairs;
}

/** The row or link that opens the record, for when the element focused at open time is gone. */
function findOpener(pairs: string[]): HTMLElement | null {
  for (const pair of pairs) {
    const escaped = pair.replace(/["\\]/g, "\\$&");
    const hit = document.querySelector<HTMLElement>(
      `[data-href*="${escaped}"], [data-peek*="${escaped}"], a[href*="${escaped}"]`,
    );
    if (hit) return hit.closest<HTMLElement>("[data-row]") ?? hit;
  }
  return null;
}

/**
 * Focus handling shared by every drawer: remembers the element that opened it, moves focus to the close
 * link once per opened record (`recordKey`) and, when the drawer goes away, hands focus back. If the
 * opener is gone (list re-rendered), the row or link for the same record takes it, then `#main`, so focus
 * never falls to <body>.
 */
export function useDrawerFocus(
  closeRef: React.RefObject<HTMLElement | null>,
  closeHref: string,
  recordKey?: string,
) {
  const hrefRef = useRef(closeHref);
  hrefRef.current = closeHref;

  // Declared first: the opener must be read before the close link takes focus.
  useEffect(() => {
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement &&
      active !== document.body &&
      !closeRef.current?.contains(active)
        ? active
        : null;
    const pairs = openingPairs(hrefRef.current);
    return () => {
      const target =
        (opener?.isConnected ? opener : null) ??
        findOpener(pairs) ??
        document.getElementById("main");
      target?.focus({ preventScroll: true });
    };
  }, [closeRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once per opened record
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [closeRef, recordKey]);
}

/**
 * Detail drawer (UX concept §4): real work on one record while the list stays visible. Slides in from
 * the right, full width below 1024 px. Addressed by the URL (`?aufgabe=<id>`), so a copied link
 * reopens it; Esc or × closes (the URL is replaced, no history entry piles up) and focus goes back to
 * where it came from. A non-modal dialog (`aria-modal="false"`, like the Vorschau): the board behind it
 * stays usable.
 */
export function Drawer({
  kind,
  title,
  titleExtra,
  badges,
  closeHref,
  children,
  header,
}: {
  kind: React.ReactNode;
  title: React.ReactNode;
  titleExtra?: React.ReactNode;
  badges?: React.ReactNode;
  closeHref: string;
  children: React.ReactNode;
  /** Extra controls under the title (status control). */
  header?: React.ReactNode;
}) {
  const t = useTranslations("drawer");
  const router = useRouter();
  const closeRef = useRef<HTMLAnchorElement>(null);
  const titleId = useId();
  // The close URL changes with the record the drawer shows, so focus returns to × for each one.
  useDrawerFocus(closeRef, closeHref, closeHref);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Esc inside an open dialog or menu belongs to that.
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role=listbox]")) return;
      if (document.querySelector('[role="menu"], [role="dialog"][aria-modal="true"]')) return;
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
      aria-labelledby={titleId}
      className="fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l bg-popover shadow-overlay sm:w-[min(540px,100%)]"
    >
      <header className="flex flex-col gap-2 border-border-subtle border-b px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground text-tiny">
            {kind}
          </span>
          <span className="flex items-center gap-1">
            <Kbd className="touch:hidden">Esc</Kbd>
            <Link
              ref={closeRef}
              href={closeHref as never}
              scroll={false}
              replace
              aria-label={t("close")}
              className="grid size-8 place-items-center rounded-md hover:bg-hover"
            >
              <X aria-hidden className="size-4" />
            </Link>
          </span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <h2 id={titleId} className="font-semibold text-lg leading-snug">
            {title}
          </h2>
          {titleExtra}
        </div>
        {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
        {header}
      </header>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">{children}</div>
    </section>
  );
}
