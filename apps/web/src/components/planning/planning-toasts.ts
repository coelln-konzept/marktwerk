"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  assignToNeedAction,
  clearUnavailabilityAction,
  setShiftStatusAction,
  setUnavailabilityAction,
} from "@/app/(app)/team/planung/actions";
import { useShell } from "@/components/shell/shell-context";
import { formatWeekdayDayMonth } from "@/lib/format";
import { useWarningConfirm } from "./warning-confirm";

/**
 * The text for a planning action's error code (period_locked, conflict, invalid_input, duplicate, not_found);
 * other codes get the generic "reload and try again".
 */
export function usePlanningErrorText() {
  const t = useTranslations("planning");
  return (code?: string) =>
    code && t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("error");
}

/** The statuses the planning views set (Entfernen = cancelled, never deleted). */
export type PlanningStatus = "requested" | "confirmed" | "declined" | "cancelled";

/**
 * Every planning action with its toast and undo (UX concept: undo over confirmation; a warning asks once,
 * "Trotzdem einplanen"). Shared by Team › Planung and the event's day list. Render `dialog` once.
 */
export function usePlanningActions() {
  const t = useTranslations("planning");
  const locale = useLocale();
  const { showToast, showError } = useShell();
  const { confirm, dialog } = useWarningConfirm();
  const [pending, start] = useTransition();
  const dateLabel = (date: string) => formatWeekdayDayMonth(date, locale);
  const errorText = usePlanningErrorText();
  const fail = (code?: string) => showError(errorText(code));

  /** "Einplanen": the shift starts angefragt; undo = Entfernen (a new shift is at version 1). */
  const assign = (
    needId: string,
    staffMemberId: string,
    workDate: string,
    name: string,
    note: string | null = null,
  ) =>
    start(async () => {
      let result = await assignToNeedAction(needId, staffMemberId);
      if (!result.ok && result.error === "needs_confirmation" && "flags" in result) {
        if (!(await confirm(result.flags, name, note))) return;
        result = await assignToNeedAction(needId, staffMemberId, true);
      }
      if (!result.ok) return fail(result.error);
      const { shiftId, shortNotice } = result.data;
      const message = t("toast.assigned", { name, date: dateLabel(workDate) });
      showToast({
        message: shortNotice ? `${message} · ${t("toast.shortNotice")}` : message,
        actionLabel: t("toast.undo"),
        onAction: async () => {
          // Matches only while nobody edited the shift since; a version conflict shows the error.
          const undone = await setShiftStatusAction(shiftId, "cancelled", 1);
          if (!undone.ok) fail(undone.error);
        },
      });
    });

  /** bestätigt / abgesagt / wieder angefragt / Entfernen; undo sets the previous status back. */
  const setStatus = (
    shift: { id: string; version: number },
    status: PlanningStatus,
    name: string,
  ) =>
    start(async () => {
      const result = await setShiftStatusAction(shift.id, status, shift.version);
      if (!result.ok) return fail(result.error);
      const { previous, version } = result.data;
      showToast({
        message: t("toast.status", { name, status: t(`status.${status}`) }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await setShiftStatusAction(shift.id, previous as PlanningStatus, version);
          if (!undone.ok) fail(undone.error);
        },
      });
    });

  const markUnavailable = (staffMemberId: string, date: string, name: string) =>
    start(async () => {
      const result = await setUnavailabilityAction(staffMemberId, date, date, null);
      if (!result.ok) return fail(result.error);
      showToast({
        message: t("toast.unavailableSet", { name, date: dateLabel(date) }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await clearUnavailabilityAction(staffMemberId, [date]);
          if (!undone.ok) fail(undone.error);
        },
      });
    });

  /** "Wieder verfügbar"; undo brings the day back with its note. */
  const clearUnavailable = (
    staffMemberId: string,
    date: string,
    note: string | null,
    name: string,
  ) =>
    start(async () => {
      const result = await clearUnavailabilityAction(staffMemberId, [date]);
      if (!result.ok) return fail(result.error);
      showToast({
        message: t("toast.unavailableCleared", { name, date: dateLabel(date) }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await setUnavailabilityAction(staffMemberId, date, date, note);
          if (!undone.ok) fail(undone.error);
        },
      });
    });

  return { pending, assign, setStatus, markUnavailable, clearUnavailable, dialog };
}
