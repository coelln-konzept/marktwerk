"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Creatable } from "@/lib/creatable";
import { UI_STATE_COOKIES, writeUiState } from "@/lib/ui-state";

export type Toast = {
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

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
  toast: Toast | null;
  showToast: (toast: Toast) => void;
  /** Clears the toast; with an argument only if that toast is still the one shown. */
  dismissToast: (which?: Toast) => void;
};

/** Undo toasts stay 8 s (UX concept §6: 5–8 s). */
const TOAST_MS = 8000;

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
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dismissToast = useCallback((which?: Toast) => {
    setToast((current) => {
      if (which && current !== which) return current;
      clearTimeout(timer.current);
      return null;
    });
  }, []);
  const showToast = useCallback((next: Toast) => {
    clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(
    () => ({
      navOpen,
      setNavOpen,
      sidebarHidden,
      setSidebarHidden,
      paletteOpen,
      setPaletteOpen,
      creatable,
      toast,
      showToast,
      dismissToast,
    }),
    [
      navOpen,
      sidebarHidden,
      setSidebarHidden,
      paletteOpen,
      creatable,
      toast,
      showToast,
      dismissToast,
    ],
  );
  return <ShellContext value={value}>{children}</ShellContext>;
}

export function useShell(): Shell {
  const shell = use(ShellContext);
  if (!shell) throw new Error("useShell outside ShellProvider");
  return shell;
}
