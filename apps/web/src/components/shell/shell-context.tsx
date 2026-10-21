"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Toast = {
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

type Shell = {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  toast: Toast | null;
  showToast: (toast: Toast) => void;
  dismissToast: () => void;
};

/** Undo toasts stay 8 s (UX concept §6: 5–8 s). */
const TOAST_MS = 8000;

const ShellContext = createContext<Shell | null>(null);

/** Client state of the app shell: mobile navigation and the command palette (⌘K / Ctrl+K). */
export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dismissToast = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
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
    () => ({ navOpen, setNavOpen, paletteOpen, setPaletteOpen, toast, showToast, dismissToast }),
    [navOpen, paletteOpen, toast, showToast, dismissToast],
  );
  return <ShellContext value={value}>{children}</ShellContext>;
}

export function useShell(): Shell {
  const shell = use(ShellContext);
  if (!shell) throw new Error("useShell outside ShellProvider");
  return shell;
}
