"use client";

import { useTranslations } from "next-intl";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Creatable } from "@/lib/creatable";
import { UI_STATE_COOKIES, writeUiState } from "@/lib/ui-state";

export type Toast = {
  message: string;
  /** `error`: red, announced at once, stays until closed. Default `success`: polite, 8 s. */
  tone?: "success" | "error";
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  /**
   * The action takes the change back. Strg+Z / ⌘Z runs it for the newest such toast. Set `false` for
   * an action that only goes somewhere ("Öffnen"); the default is true for every toast with an action.
   */
  undoable?: boolean;
};

/** A toast in the stack; `id` is stable while it is shown. */
export type ToastEntry = { id: number; toast: Toast };

type Shell = {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  /** Wide screens: the sidebar is hidden (remembered per browser); the top bar then shows a button to bring it back. */
  sidebarHidden: boolean;
  setSidebarHidden: (hidden: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** What this person may create ("+ Neu" and its shortcut show when it is not empty). */
  creatable: readonly Creatable[];
  /** The stack, oldest first (the newest is shown at the bottom, next to the thumb on a phone). */
  toasts: readonly ToastEntry[];
  showToast: (toast: Toast) => void;
  /** Clears one toast if it is still shown; without an argument the whole stack. */
  dismissToast: (which?: Toast) => void;
  dismissToastById: (id: number) => void;
  /** Runs the toast's action (the "Rückgängig" button, Strg+Z) and then clears that toast. */
  runToastAction: (id: number) => Promise<void>;
  /** Toasts whose action is running. */
  busyToastIds: ReadonlySet<number>;
};

/** Toasts that are not errors stay 8 s (UX concept §6: 5–8 s); hover and focus pause the clock. */
export const TOAST_MS = 8000;
/** Up to three at once; a fourth pushes the oldest out. */
const TOAST_MAX = 3;

/** Typing in a field: Strg+Z belongs to the field then. */
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);
function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const field = target.closest("input, textarea, select");
  if (!field) return false;
  return !(field instanceof HTMLInputElement && NON_TEXT_INPUTS.has(field.type));
}

const ShellContext = createContext<Shell | null>(null);

/** Client state of the app shell: mobile navigation and the command palette (Ctrl+K; ⌘K on a Mac). */
export function ShellProvider({
  children,
  creatable = [],
  sidebarHidden: initialSidebarHidden = false,
}: {
  children: React.ReactNode;
  creatable?: readonly Creatable[];
  /** From the `navHidden` UI-state cookie, so the first render is already right. */
  sidebarHidden?: boolean;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarHidden, setSidebarHiddenState] = useState(initialSidebarHidden);
  const setSidebarHidden = useCallback((hidden: boolean) => {
    setSidebarHiddenState(hidden);
    writeUiState(UI_STATE_COOKIES.navHidden, hidden);
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const tErrors = useTranslations("errors");
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([]);
  const [busyToastIds, setBusyToastIds] = useState<ReadonlySet<number>>(new Set());
  const nextToastId = useRef(0);
  // The key handler and `runToastAction` read the latest stack without re-subscribing on every toast.
  const toastsRef = useRef(toasts);
  const busyRef = useRef(busyToastIds);
  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const dismissToastById = useCallback((id: number) => {
    setToasts((current) =>
      current.some((e) => e.id === id) ? current.filter((e) => e.id !== id) : current,
    );
  }, []);
  const dismissToast = useCallback((which?: Toast) => {
    setToasts((current) => {
      if (!which) return current.length > 0 ? [] : current;
      return current.some((e) => e.toast === which)
        ? current.filter((e) => e.toast !== which)
        : current;
    });
  }, []);
  const showToast = useCallback((toast: Toast) => {
    const id = ++nextToastId.current;
    setToasts((current) => {
      // The same error twice (five ticks while offline) is shown once, as the newest.
      const rest =
        toast.tone === "error"
          ? current.filter((e) => !(e.toast.tone === "error" && e.toast.message === toast.message))
          : current;
      return [...rest, { id, toast }].slice(-TOAST_MAX);
    });
  }, []);

  const runToastAction = useCallback(
    async (id: number) => {
      const entry = toastsRef.current.find((e) => e.id === id);
      if (!entry?.toast.onAction || busyRef.current.has(id)) return;
      const setBusy = (on: boolean) => {
        const next = new Set(busyRef.current);
        if (on) next.add(id);
        else next.delete(id);
        busyRef.current = next;
        setBusyToastIds(next);
      };
      setBusy(true);
      try {
        await entry.toast.onAction();
      } catch {
        // An action that throws (offline) must not crash the page; say so instead.
        showToast({ message: tErrors("network"), tone: "error" });
      } finally {
        setBusy(false);
        // An action may show its own toast (e.g. "Status zurückgesetzt"); keep that one.
        dismissToastById(id);
      }
    },
    [showToast, dismissToastById, tErrors],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      // Strg+Z / ⌘Z: take back the newest undoable change (UX concept §6), unless a field has the focus.
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") {
        if (event.defaultPrevented || event.repeat || isEditable(event.target)) return;
        const newest = toastsRef.current.findLast(
          (e) => e.toast.onAction && e.toast.actionLabel && e.toast.undoable !== false,
        );
        if (!newest) return;
        event.preventDefault();
        void runToastAction(newest.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runToastAction]);

  const value = useMemo(
    () => ({
      navOpen,
      setNavOpen,
      sidebarHidden,
      setSidebarHidden,
      paletteOpen,
      setPaletteOpen,
      creatable,
      toasts,
      showToast,
      dismissToast,
      dismissToastById,
      runToastAction,
      busyToastIds,
    }),
    [
      navOpen,
      sidebarHidden,
      setSidebarHidden,
      paletteOpen,
      creatable,
      toasts,
      showToast,
      dismissToast,
      dismissToastById,
      runToastAction,
      busyToastIds,
    ],
  );
  return <ShellContext value={value}>{children}</ShellContext>;
}

export function useShell(): Shell {
  const shell = use(ShellContext);
  if (!shell) throw new Error("useShell outside ShellProvider");
  return shell;
}
