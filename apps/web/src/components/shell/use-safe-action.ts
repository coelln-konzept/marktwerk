"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { failureCode, NETWORK_ERROR, trackPending } from "@/lib/call-action";
import { useShell } from "./shell-context";

/**
 * For forms and buttons that call a server action inside a transition (UX-007): a call that throws
 * (offline, a 500) would reach the error boundary and replace the page, losing what was typed. Wrapped,
 * it shows an error toast instead ("Nicht gespeichert: keine Verbindung. Deine Eingaben sind noch
 * da …", or the server-error text) and resolves to null; the form stays as it is. The shell's pending
 * bar shows while the call runs.
 *
 * `const result = await safe(() => createContactAction(input)); if (!result) return;`
 */
export function useSafeAction() {
  const { showError } = useShell();
  const t = useTranslations("errors");
  return useCallback(
    async <R>(call: () => Promise<R>): Promise<R | null> => {
      try {
        return await trackPending(call);
      } catch (error) {
        console.warn("Server action failed", error);
        showError(t(failureCode(error) === NETWORK_ERROR ? "networkKept" : "serverKept"), {
          key: "action-failure",
        });
        return null;
      }
    },
    [showError, t],
  );
}
