"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";

/** Fired by the profile menu ("Tastenkürzel") to open the overview without a key. */
export const SHORTCUTS_EVENT = "marktwerk:shortcuts";

/**
 * The keyboard map of UX concept §6, only keys that exist in the app. Each row lists the keys that do
 * the same thing ("mod+K" = Strg+K, ⌘K on a Mac) and the message key of what they do.
 */
const GROUPS = [
  {
    id: "everywhere",
    rows: [
      { keys: ["mod+K"], what: "search" },
      { keys: ["C"], what: "create" },
      { keys: ["?"], what: "overview" },
      { keys: ["mod+Z"], what: "undo" },
      { keys: ["Esc"], what: "close" },
    ],
  },
  {
    id: "lists",
    rows: [
      { keys: ["J", "K", "↑", "↓"], what: "move" },
      { keys: ["Space"], what: "peek" },
      { keys: ["Enter"], what: "open" },
    ],
  },
  {
    id: "board",
    rows: [
      { keys: ["E"], what: "done" },
      { keys: ["A"], what: "assign" },
    ],
  },
  {
    id: "calendar",
    rows: [
      { keys: ["T"], what: "today" },
      { keys: ["M"], what: "month" },
      { keys: ["L"], what: "list" },
    ],
  },
] as const;

/** `?` (Shift+ß on a German keyboard) opens the overview of keyboard shortcuts. */
export function ShortcutsDialog() {
  const t = useTranslations("shortcuts");
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function show() {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable]")) return;
      // Not on top of another dialog or an open menu (a Vorschau is not modal and does not count).
      if (
        document.querySelector(
          "[role=menu], [role=alertdialog], [role=dialog]:not([aria-modal=false])",
        )
      )
        return;
      event.preventDefault();
      show();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHORTCUTS_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHORTCUTS_EVENT, show);
    };
  }, []);

  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const label = (key: string) => {
    if (key.startsWith("mod+")) return `${mac ? "⌘" : t("ctrl")} ${key.slice(4)}`;
    return key === "Space" ? t("space") : key;
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim" />
        <Dialog.Popup
          finalFocus={() => (openerRef.current?.isConnected ? openerRef.current : true)}
          className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(520px,calc(100%-2rem))] flex-col gap-4 overflow-y-auto rounded-xl border bg-popover p-5 text-popover-foreground shadow-overlay outline-hidden"
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-semibold text-lg">{t("title")}</Dialog.Title>
            <Dialog.Close
              aria-label={t("close")}
              className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-muted-foreground text-small">
            {t("hint")}
          </Dialog.Description>
          {GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`shortcuts-${group.id}`}>
              <h3
                id={`shortcuts-${group.id}`}
                className="pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider"
              >
                {t(`groups.${group.id}`)}
              </h3>
              <dl className="m-0 divide-y divide-border-subtle">
                {group.rows.map((row) => (
                  <div key={row.what} className="flex items-baseline gap-3 py-1.5">
                    <dt className="flex w-36 shrink-0 flex-wrap gap-1">
                      {row.keys.map((key) => (
                        <Kbd key={key}>{label(key)}</Kbd>
                      ))}
                    </dt>
                    <dd className="m-0 min-w-0 flex-1">{t(`what.${row.what}`)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
