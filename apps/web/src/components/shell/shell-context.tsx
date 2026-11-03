"use client";

import { useTranslations } from "next-intl";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ConfirmOptions, useConfirm } from "@/components/ui/confirm";
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

/** A change that can still be taken back, after its toast is gone (the top bar's "Rückgängig", Strg+Z). */
export type UndoEntry = { id: number; message: string; at: number };

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
  /** The newest change that can still be undone (outlives its toast), or null. */
  lastUndo: UndoEntry | null;
  /** Takes back the newest change of the history (the top bar's button and Strg+Z). */
  undoLast: () => Promise<void>;
  /** One app-wide confirmation dialog (`ui/confirm`), for actions that ask first (e.g. "Erledigt" where the task leaves the list). */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

/** Toasts that are not errors stay 8 s (UX concept §6: 5–8 s); hover and focus pause the clock. */
export const TOAST_MS = 8000;
/** Up to three at once; a fourth pushes the oldest out. */
const TOAST_MAX = 3;
/**
 * Undo history: the last changes stay undoable after their toast has gone (handwritten notes 2026-11: an
 * accidental click must not depend on catching the toast). In memory only, so a reload clears it; an entry
 * older than this is dropped, since by then the change is rather a decision than a slip.
 */
const UNDO_MAX = 10;
const UNDO_MS = 15 * 60 * 1000;

const isUndoable = (toast: Toast) =>
  Boolean(toast.onAction && toast.actionLabel && toast.undoable !== false);

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
  const { confirm, dialog } = useConfirm();
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
  const [undoHistory, setUndoHistory] = useState<
    readonly (UndoEntry & { run: () => void | Promise<void> })[]
  >([]);
  const undoRef = useRef(undoHistory);
  useEffect(() => {
    undoRef.current = undoHistory;
  }, [undoHistory]);
  const forgetUndo = useCallback((id: number) => {
    setUndoHistory((current) =>
      current.some((e) => e.id === id) ? current.filter((e) => e.id !== id) : current,
    );
  }, []);

  const showToast = useCallback((toast: Toast) => {
    const id = ++nextToastId.current;
    if (isUndoable(toast) && toast.onAction) {
      const run = toast.onAction;
      const now = Date.now();
      setUndoHistory((current) =>
        [
          ...current.filter((e) => now - e.at < UNDO_MS),
          { id, message: toast.message, at: now, run },
        ].slice(-UNDO_MAX),
      );
    }
    setToasts((current) => {
      // The same error twice (five ticks while offline) is shown once, as the newest.
      const rest =
        toast.tone === "error"
          ? current.filter((e) => !(e.toast.tone === "error" && e.toast.message === toast.message))
          : current;
      return [...rest, { id, toast }].slice(-TOAST_MAX);
    });
  }, []);

  /** Runs an action by its toast id, from the toast or from the undo history (the toast may be gone). */
  const runAction = useCallback(
    async (id: number, action: (() => void | Promise<void>) | undefined) => {
      if (!action || busyRef.current.has(id)) return;
      const setBusy = (on: boolean) => {
        const next = new Set(busyRef.current);
        if (on) next.add(id);
        else next.delete(id);
        busyRef.current = next;
        setBusyToastIds(next);
      };
      setBusy(true);
      // Leave the stack first: the action's own toast ("Rückgängig gemacht") must not push out an older
      // toast that can still be undone.
      dismissToastById(id);
      forgetUndo(id);
      try {
        await action();
      } catch {
        // An action that throws (offline) must not crash the page; say so instead.
        showToast({ message: tErrors("network"), tone: "error" });
      } finally {
        setBusy(false);
      }
    },
    [showToast, dismissToastById, forgetUndo, tErrors],
  );

  const runToastAction = useCallback(
    (id: number) => runAction(id, toastsRef.current.find((e) => e.id === id)?.toast.onAction),
    [runAction],
  );

  const undoLast = useCallback(async () => {
    const now = Date.now();
    const newest = undoRef.current.findLast((e) => now - e.at < UNDO_MS);
    if (!newest) {
      if (undoRef.current.length > 0) setUndoHistory([]);
      return;
    }
    await runAction(newest.id, newest.run);
  }, [runAction]);

  const lastUndo = useMemo(() => {
    const newest = undoHistory.at(-1);
    return newest ? { id: newest.id, message: newest.message, at: newest.at } : null;
  }, [undoHistory]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      // Strg+Z / ⌘Z: take back the newest change of the undo history (UX concept §6), unless a field has
      // the focus. Works after the toast has gone, like the top bar's button.
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") {
        if (event.defaultPrevented || event.repeat || isEditable(event.target)) return;
        if (undoRef.current.length === 0) return;
        event.preventDefault();
        void undoLast();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoLast]);

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
      lastUndo,
      undoLast,
      confirm,
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
      lastUndo,
      undoLast,
      confirm,
    ],
  );
  return (
    <ShellContext value={value}>
      {children}
      {dialog}
    </ShellContext>
  );
}

export function useShell(): Shell {
  const shell = use(ShellContext);
  if (!shell) throw new Error("useShell outside ShellProvider");
  return shell;
}
