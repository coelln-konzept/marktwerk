"use client";

import { useEffect } from "react";
import { useShell } from "@/components/shell/shell-context";

/**
 * `/` jumps to the search field of a list (UX concept §6). Ignored while typing or on top of a dialog.
 * It also sets the field's `aria-keyshortcuts="/"`, only while single keys are on (UX-054): turned off,
 * the shell stops `/` and the field must not advertise it.
 */
export function SearchHotkey({ inputId }: { inputId: string }) {
  const { singleKeys } = useShell();
  useEffect(() => {
    const input = document.getElementById(inputId);
    if (!singleKeys || !input) return;
    input.setAttribute("aria-keyshortcuts", "/");
    return () => input.removeAttribute("aria-keyshortcuts");
  }, [inputId, singleKeys]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.repeat || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable]")) return;
      if (document.querySelector("[role=dialog], [role=alertdialog], [role=menu]")) return;
      const input = document.getElementById(inputId);
      if (!(input instanceof HTMLInputElement)) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inputId]);
  return null;
}
