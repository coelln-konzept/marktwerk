"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/** Flags that are worth a line; "already_scheduled" alone never asks (see `needsConfirmation`). */
const LINES = ["unavailable", "over_budget_after", "overlap", "worktime"] as const;
type Line = (typeof LINES)[number];

type Ask = { flags: Line[]; name: string; note: string | null };

/**
 * "Trotzdem einplanen?" (decision 2026-11-26): the one confirmation of the planning views. The UX concept
 * prefers undo toasts; a warning on an assignment (nicht verfügbar, über Budget, Überschneidung, ArbZG) asks
 * once instead. `confirm()` resolves true/false; render `dialog` once.
 */
export function useWarningConfirm() {
  const t = useTranslations("planning.confirm");
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (flags: readonly string[], name: string, note: string | null) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setAsk({
          flags: LINES.filter((line) => flags.includes(line)),
          name,
          note,
        });
      }),
    [],
  );

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setAsk(null);
  };

  const text = (line: Line, a: Ask) =>
    line === "unavailable"
      ? t("unavailable", { name: a.name, note: a.note ? `: ${a.note}` : "" })
      : t(line);

  const dialog = (
    <Modal
      open={ask !== null}
      onOpenChange={(open) => !open && close(false)}
      title={t("title")}
      closeLabel={t("cancel")}
    >
      {ask && ask.flags.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ask.flags.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-status-warn" />
              <span>{text(line, ask)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={() => close(false)}>{t("cancel")}</Button>
        <Button variant="default" onClick={() => close(true)}>
          {t("action")}
        </Button>
      </div>
    </Modal>
  );

  return { confirm, dialog };
}
