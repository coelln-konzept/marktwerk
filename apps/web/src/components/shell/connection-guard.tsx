"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { navTarget } from "./nav-target";
import { useShell } from "./shell-context";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** The browser's own idea of the connection; the server render assumes online. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Offline (UX-007): a banner says so, and what can't work is stopped before it breaks the page. A click
 * on an in-app link or row stays on the page (instead of the browser's error page) and a form is not
 * sent (instead of the error page that drops what was typed); each says why in an error toast. Back
 * online, a short toast says so. Reading the open page keeps working.
 */
export function ConnectionGuard() {
  const online = useOnline();
  const t = useTranslations("states");
  const tErrors = useTranslations("errors");
  const { showToast, showError } = useShell();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    // Same key as the offline errors: this replaces them.
    showToast({ message: t("online"), key: "connection" });
  }, [online, showToast, t]);

  useEffect(() => {
    if (online) return;
    // Window, capture phase: before the link's or the form's own handler.
    function onClick(event: MouseEvent) {
      if (!navTarget(event)) return;
      event.preventDefault();
      event.stopPropagation();
      showError(tErrors("offlinePage"), { key: "connection" });
    }
    function onSubmit(event: SubmitEvent) {
      event.preventDefault();
      event.stopPropagation();
      showError(tErrors("networkKept"), { key: "connection" });
    }
    window.addEventListener("click", onClick, true);
    window.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("submit", onSubmit, true);
    };
  }, [online, showError, tErrors]);

  if (online) return null;
  return (
    <p
      role="status"
      className="-translate-x-1/2 fixed top-2 left-1/2 z-[65] flex w-max max-w-[calc(100%-2rem)] items-start gap-2 rounded-lg border border-status-warn-dot bg-status-warn-bg px-3 py-2 font-medium text-small text-status-warn shadow-pop"
    >
      <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{t("offline")}</span>
    </p>
  );
}
