"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Form controls a dialog starts on (UX-030: "dialogs focus the first field"). */
const FIELD =
  'input:not([type="hidden"]):not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([aria-disabled="true"])';
const TABBABLE =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const visible = (el: HTMLElement) => el.getClientRects().length > 0 && el.tabIndex >= 0;

/** The first field, else the first control that is not the close button, else the dialog itself. */
function firstFocus(popup: HTMLElement): HTMLElement {
  const field = [...popup.querySelectorAll<HTMLElement>(FIELD)].find(visible);
  if (field) return field;
  const control = [...popup.querySelectorAll<HTMLElement>(TABBABLE)].find(
    (el) => visible(el) && !el.closest("[data-modal-close]"),
  );
  return control ?? popup;
}

/**
 * The last pointer press. Our modals are opened through `open` (not a `Dialog.Trigger`), so base-ui does
 * not always know that a finger opened them; a touch press just before the open counts as well.
 */
let lastPointer = { type: "", at: 0 };
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      lastPointer = { type: event.pointerType, at: Date.now() };
    },
    true,
  );
}
const openedByTouch = (type: string) =>
  type === "touch" || (lastPointer.type === "touch" && Date.now() - lastPointer.at < 1500);

/** How many open modals made an element inert; the attribute goes once the last one closes. */
const inertCount = new WeakMap<Element, number>();

/** Is this body-level element the toast region (`ToastRegion`: live regions as direct children)? */
const isToastRegion = (el: Element) =>
  el.querySelector(':scope > [role="status"], :scope > [role="alert"]') !== null;

/**
 * Makes everything outside `popup` inert (UX-053): Tab cannot leave the dialog, the page behind it can't be
 * clicked or read. Works on the children of <body> (the app, other portals); the toast region stays live
 * so an undo can still be reached. Nested modals stack: the outer dialog turns inert under the inner one.
 */
function useInertOutside(popup: HTMLElement | null) {
  useEffect(() => {
    if (!popup) return;
    const marked: Element[] = [];
    for (const el of document.body.children) {
      if (el.contains(popup) || el.tagName === "SCRIPT" || isToastRegion(el)) continue;
      inertCount.set(el, (inertCount.get(el) ?? 0) + 1);
      el.setAttribute("inert", "");
      marked.push(el);
    }
    return () => {
      for (const el of marked) {
        const left = (inertCount.get(el) ?? 1) - 1;
        inertCount.set(el, left);
        if (left === 0) el.removeAttribute("inert");
      }
    };
  }, [popup]);
}

/**
 * Centred modal for short forms (UX concept §4: ≤ 8 fields): title, optional description, close button.
 * Same look as the cancel dialog of "Status ändern".
 *
 * Focus contract (UX-030, UX-053): opens on the first field (else the first control that is not ×; on
 * touch the dialog itself, so no keyboard pops up), everything behind it is inert, Esc closes only this
 * dialog, and on close focus returns to what had it before (else to `#main`, never to <body>).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  closeLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  // Remember the opener when the dialog opens, while it still has focus (before the dialog takes it).
  if (open !== wasOpen.current) {
    wasOpen.current = open;
    if (open && typeof document !== "undefined") {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
  }

  useInertOutside(open ? popup : null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* forceRender: a nested modal (e.g. QuickCreateDialog) dims the dialog underneath too. */}
        <Dialog.Backdrop forceRender className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Popup
          ref={(el) => {
            popupRef.current = el;
            setPopup(el);
          }}
          initialFocus={(type) => {
            const el = popupRef.current;
            if (!el) return true;
            // Touch: the dialog itself, so no on-screen keyboard covers it.
            return openedByTouch(type) ? el : firstFocus(el);
          }}
          onKeyDown={(event) => {
            // Tab wraps inside the dialog (base-ui's focus guards alone let it reach <body> once).
            if (event.key !== "Tab" || event.defaultPrevented) return;
            const popupEl = event.currentTarget as HTMLElement;
            const all = [...popupEl.querySelectorAll<HTMLElement>(TABBABLE)].filter(visible);
            const first = all[0];
            const last = all.at(-1);
            if (!first || !last) return;
            if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            } else if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            }
          }}
          finalFocus={() => {
            const back = opener.current;
            if (back?.isConnected && !back.closest("[inert]")) return back;
            return document.getElementById("main") ?? true;
          }}
          className={cn(
            "-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-40 flex max-h-[calc(100dvh-2rem)] w-[min(480px,calc(100%-2rem))] flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-overlay outline-hidden",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-semibold text-lg">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={closeLabel}
              data-modal-close
              className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover tap:size-11"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="text-muted-foreground text-small">
              {description}
            </Dialog.Description>
          )}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
