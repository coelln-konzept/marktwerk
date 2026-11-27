"use client";

import { Popover } from "@base-ui/react/popover";
import type { ShiftCandidate } from "@marktwerk/core";
import { CalendarOff, Clock, Layers, TriangleAlert, UserCheck, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { listCandidatesAction } from "@/app/(app)/team/planung/candidates-action";
import { formatMinutesAsHours } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUPS = ["usual", "other", "unavailable"] as const;
const FLAG_ICON = {
  already_scheduled: UserCheck,
  overlap: Layers,
  over_budget_after: Wallet,
  worktime: Clock,
  unavailable: CalendarOff,
} as const;

/**
 * "+ Person" on one open slot: a popover with the ranked candidates of the need (Üblich, Weitere, Nicht
 * verfügbar), searchable by name. The search field keeps focus; ↑/↓ move through the list, Enter picks,
 * Esc closes and focus goes back to the button. Below 640 px the popover spans the screen width.
 */
export function CandidatePicker({
  needId,
  label,
  disabled,
  onPick,
}: {
  needId: string;
  /** Accessible name of the button (role and day). */
  label: string;
  disabled?: boolean;
  onPick: (candidate: ShiftCandidate) => void;
}) {
  const t = useTranslations("planning.event");
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        disabled={disabled}
        className="inline-flex min-h-8 cursor-pointer items-center rounded-md border border-input border-dashed px-2 font-medium text-accent-soft-foreground text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45 data-[popup-open]:bg-selected tap:min-h-11"
      >
        {t("addPerson")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
          <Popover.Popup className="flex max-h-[min(440px,70vh)] w-[min(360px,calc(100vw-24px))] flex-col rounded-xl border bg-popover p-2 text-popover-foreground shadow-pop outline-hidden">
            <Popover.Title className="sr-only">{label}</Popover.Title>
            {open && (
              <CandidateList
                needId={needId}
                onPick={(c) => {
                  setOpen(false);
                  onPick(c);
                }}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CandidateList({
  needId,
  onPick,
}: {
  needId: string;
  onPick: (candidate: ShiftCandidate) => void;
}) {
  const t = useTranslations("planning.event");
  const locale = useLocale();
  const listId = useId();
  const [all, setAll] = useState<ShiftCandidate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const tPlanning = useTranslations("planning");

  // Loaded on every opening (the list unmounts on close), so the ranking is current.
  useEffect(() => {
    let live = true;
    listCandidatesAction(needId).then(
      (rows) => live && setAll(rows),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [needId]);

  const shown = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("de");
    const hits = (all ?? []).filter((c) => c.displayName.toLocaleLowerCase("de").includes(query));
    // Group order is the display order, so the arrow keys follow what is on screen.
    return GROUPS.flatMap((g) => hits.filter((c) => c.group === g));
  }, [all, q]);
  const current = Math.min(active, Math.max(shown.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;
  const h = (m: number) => formatMinutesAsHours(m, locale);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (shown.length === 0) return;
      const next = (current + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
      setActive(next);
      document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = shown[current];
      if (pick) onPick(pick);
    }
  };

  let index = -1;
  return (
    <>
      <input
        // biome-ignore lint/a11y/noAutofocus: the picker opens for typing; Esc returns focus to "+ Person".
        autoFocus
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={shown.length > 0 ? optionId(current) : undefined}
        aria-label={t("search")}
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={t("search")}
        className="mb-2 flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground placeholder:text-faint-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1"
      />
      {all === null && !failed && (
        <p className="m-0 px-1 py-1 text-muted-foreground text-small" aria-live="polite">
          {t("loading")}
        </p>
      )}
      {failed && (
        <p role="alert" className="m-0 px-1 py-1 text-small text-status-critical">
          {tPlanning("error")}
        </p>
      )}
      {all !== null && shown.length === 0 && (
        <p className="m-0 px-1 py-1 text-muted-foreground text-small">{t("empty")}</p>
      )}
      <div
        id={listId}
        role="listbox"
        aria-label={t("search")}
        className="min-h-0 overflow-y-auto overscroll-contain"
      >
        {GROUPS.map((group) => {
          const rows = shown.filter((c) => c.group === group);
          if (rows.length === 0) return null;
          const headId = `${listId}-${group}`;
          return (
            // biome-ignore lint/a11y/useSemanticElements: an option group inside a listbox (no fieldset there).
            <div key={group} role="group" aria-labelledby={headId}>
              <div
                id={headId}
                className="px-2 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider"
              >
                {t(`group.${group}`)}
              </div>
              {rows.map((c) => {
                index += 1;
                const i = index;
                const flags = c.flags.filter((f) => f !== "unavailable" || group !== "unavailable");
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled on the search field (aria-activedescendant).
                  <div
                    key={c.staffMemberId}
                    id={optionId(i)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === current}
                    onMouseMove={() => i !== current && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPick(c)}
                    className={cn(
                      "flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 tap:min-h-11",
                      i === current && "bg-hover",
                    )}
                  >
                    <span className="font-medium text-small">{c.displayName}</span>
                    <span className="tabular text-muted-foreground text-tiny">
                      {t("left", { before: h(c.leftBefore), after: h(c.leftAfter) })}
                    </span>
                    {(flags.length > 0 || c.unavailableNote) && (
                      <span className="flex flex-wrap gap-1">
                        {flags.map((f) => {
                          const Icon = FLAG_ICON[f] ?? TriangleAlert;
                          return (
                            <span
                              key={f}
                              className={cn(
                                "inline-flex items-center gap-1 rounded border border-input px-1 text-[11px]",
                                f === "already_scheduled"
                                  ? "text-muted-foreground"
                                  : "text-status-warn",
                              )}
                            >
                              <Icon aria-hidden className="size-3 shrink-0" />
                              {t(`flag.${f}`)}
                            </span>
                          );
                        })}
                        {c.unavailableNote && (
                          <span className="text-muted-foreground text-tiny">
                            {c.unavailableNote}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
