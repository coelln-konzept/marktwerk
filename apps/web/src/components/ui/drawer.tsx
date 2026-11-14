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
function findOpener(pairs: string[], near: HTMLElement | null): HTMLElement | null {
  for (const pair of pairs) {
    const escaped = pair.replace(/["\\]/g, "\\$&");
    const selector = `[data-href*="${escaped}"], [data-peek*="${escaped}"], a[href*="${escaped}"]`;
    // The one next to the last click first (the card that was clicked, not a link to the same record in
    // another list higher up the page), then the first visible one.
    const hits = [...document.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => el.getClientRects().length > 0,
    );
    const hit =
      (near && hits.find((el) => el.contains(near) || near.contains(el))) ??
      (near && hits.find((el) => el.closest("[data-row], [data-card], li")?.contains(near))) ??
      hits[0];
    if (hit) return hit.closest<HTMLElement>("[data-row]") ?? hit;
  }
  return null;
}

/**
 * The element last pressed with a pointer, for drawers opened by a click on something that does not take
 * focus (a card, a row): `document.activeElement` is then <body> and says nothing.
 */
let lastPress: { el: HTMLElement; at: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof HTMLElement) lastPress = { el: event.target, at: Date.now() };
    },
    true,
  );
}
const recentPress = () =>
  lastPress?.el.isConnected && Date.now() - lastPress.at < 10_000 ? lastPress.el : null;

const FOCUSABLE = 'a[href], button, [data-row], [tabindex]:not([tabindex="-1"])';

/**
 * Should this Escape close a drawer or Vorschau (UX-035, UX-053: Esc is handled once)? Not when something
 * else already took it, when it comes from a toast (Esc there closes the toast), a listbox, a field with
 * unsaved typing (`data-editing`), or while a menu or a modal dialog is open.
 */
export function escapeClosesOverlay(event: KeyboardEvent): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest('[role=listbox], [role=status], [role=alert], [data-editing="true"]'))
    return false;
  // base-ui dialogs carry no aria-modal, so any dialog counts unless it says it is not modal (drawer, Vorschau).
  return !document.querySelector(
    '[role="menu"], [role="alertdialog"], [role="dialog"]:not([aria-modal="false"])',
  );
}

/**
 * While a drawer is open the tab says which record it shows (UX-035): "<Name> · <page title>". Reads the
 * drawer's heading, so it follows a rename; the page title comes back when the drawer closes.
 */
export function useDrawerTitle(titleRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const heading = titleRef.current;
    if (!heading) return;
    // Next.js may write the page title after the drawer opened (streamed metadata of the navigation that
    // opened it), so the page title is never cached: it is the current title without our prefix.
    let prefix = "";
    const pageTitle = () =>
      prefix && document.title.startsWith(prefix)
        ? document.title.slice(prefix.length)
        : document.title;
    const apply = () => {
      const page = pageTitle();
      const name = heading.textContent?.trim();
      prefix = name ? `${name} · ` : "";
      const next = `${prefix}${page}`;
      if (page && document.title !== next) document.title = next;
    };
    apply();
    const observer = new MutationObserver(apply);
    const watch = { childList: true, subtree: true, characterData: true };
    observer.observe(heading, watch);
    observer.observe(document.head, watch);
    return () => {
      observer.disconnect();
      const page = pageTitle();
      if (page !== document.title) document.title = page;
    };
  }, [titleRef]);
}

/**
 * Focus handling shared by every drawer: remembers the element that opened it, moves focus to the close
 * link once per opened record (`recordKey`) and, when the drawer goes away, hands focus back. If the
 * opener is gone (list re-rendered, record archived), the row or link for the same record takes it (the one
 * next to the last click first), then `#main`, so focus never falls to <body>. A drawer opened by a click
 * on a card or row that takes no focus returns focus to that card's link or row.
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
    const pressed = recentPress();
    const opener =
      active instanceof HTMLElement &&
      active !== document.body &&
      !closeRef.current?.contains(active)
        ? active
        : (pressed?.closest<HTMLElement>(FOCUSABLE) ?? null);
    const pairs = openingPairs(hrefRef.current);
    return () => {
      const target =
        (opener?.isConnected && !opener.closest("[inert]") ? opener : null) ??
        findOpener(pairs, pressed?.isConnected ? pressed : null) ??
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
 * where it came from (see `useDrawerFocus`); the tab title names the record. A non-modal dialog (`aria-modal="false"`, like the Vorschau): the board behind it
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  useDrawerTitle(titleRef);
  // The close URL changes with the record the drawer shows, so focus returns to × for each one.
  useDrawerFocus(closeRef, closeHref, closeHref);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!escapeClosesOverlay(event)) return;
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
              className="grid size-8 place-items-center rounded-md hover:bg-hover tap:size-11"
            >
              <X aria-hidden className="size-4" />
            </Link>
          </span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <h2 ref={titleRef} id={titleId} className="font-semibold text-lg leading-snug">
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
