"use client";

import { normalizeClockTime } from "@marktwerk/core";
import { CircleCheck, CircleDashed, Clock, Lock, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { recordTimesAction, shiftHistoryAction, updateShiftAction } from "@/app/(app)/team/actions";
import { useShell } from "@/components/shell/shell-context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateShort, formatHours } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SELECT_CLASS } from "../settings/select-class";
import { draftMinutes, type LiveWarning, liveWarnings } from "./live-warnings";
import type { ShiftEnvironment, ShiftView } from "./shift-types";
import { WarningList } from "./warning-list";

const BREAKS = [0, 15, 30, 45, 60, 75, 90];

const TIME_INPUT = "tabular min-h-12 w-[5.5rem] text-base md:min-h-(--control-h) md:text-small";

type History = {
  version: number;
  reason: string;
  changedAt: string;
  changedBy: string | null;
  before: Record<string, unknown>;
}[];

/**
 * One shift in a list: who, planned times and the actual times to type in (quick entry), hours as you
 * type, warnings while typing, the §17 MiLoG state. Corrections of recorded times need a reason and
 * leave a revision; "Mehr" holds status changes and the history.
 */
export function ShiftRowEditor({
  shift,
  env,
  showDate,
  onEdit,
}: {
  shift: ShiftView;
  env: ShiftEnvironment;
  showDate: boolean;
  /** Opens the full edit dialog. */
  onEdit: (shift: ShiftView) => void;
}) {
  const t = useTranslations("hours.shift");
  const tErr = useTranslations("hours.errors");
  const locale = useLocale();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const hasActual = Boolean(shift.actualStart && shift.actualEnd);
  const [start, setStart] = useState(shift.actualStart ?? "");
  const [end, setEnd] = useState(shift.actualEnd ?? "");
  const [pause, setPause] = useState(shift.breakMinutes);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [statusReason, setStatusReason] = useState("");

  const editable = env.canManage && !shift.locked;
  const counts =
    shift.status === "requested" || shift.status === "confirmed" || shift.status === "worked";
  const dirty =
    start !== (shift.actualStart ?? "") ||
    end !== (shift.actualEnd ?? "") ||
    pause !== shift.breakMinutes;
  const canRecord = shift.workDate <= env.today;

  // What the warnings and the hours are based on: typed times, else actual, else planned.
  const effStart = normalizeClockTime(start) ?? shift.actualStart ?? shift.plannedStart ?? "";
  const effEnd = normalizeClockTime(end) ?? shift.actualEnd ?? shift.plannedEnd ?? "";
  const typedBoth = normalizeClockTime(start) !== null && normalizeClockTime(end) !== null;
  const draft = {
    staffMemberId: shift.staffMemberId,
    workDate: shift.workDate,
    start: typedBoth || hasActual ? effStart : (shift.plannedStart ?? ""),
    end: typedBoth || hasActual ? effEnd : (shift.plannedEnd ?? ""),
    breakMinutes: pause,
    shiftId: shift.id,
    currentMinutes: shift.minutes,
  };
  const warnings: LiveWarning[] = counts ? liveWarnings(env.live, draft) : [];
  const minutes = counts ? draftMinutes(draft) : null;
  const overDay = warnings.some((w) => w.code === "daily_max");

  const errorText = (code: string) =>
    tErr.has(code as never) ? tErr(code as never) : tErr("generic");

  function normalized() {
    const s = normalizeClockTime(start);
    const e = normalizeClockTime(end);
    return s && e ? { actualStart: s, actualEnd: e, breakMinutes: pause } : null;
  }

  function save(times: { actualStart: string; actualEnd: string; breakMinutes: number }) {
    if (hasActual && reason.trim().length < 3) {
      setError("reason_required");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordTimesAction(
        shift.id,
        times,
        shift.version,
        hasActual ? reason : undefined,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReason("");
      showToast({ message: result.data.changed ? t("saved") : t("unchanged") });
    });
  }

  function submit() {
    const times = normalized();
    if (!times) {
      setError("invalid_time");
      return;
    }
    setStart(times.actualStart);
    setEnd(times.actualEnd);
    save(times);
  }

  function takePlanned() {
    if (!shift.plannedStart || !shift.plannedEnd) return;
    setStart(shift.plannedStart);
    setEnd(shift.plannedEnd);
    save({
      actualStart: shift.plannedStart,
      actualEnd: shift.plannedEnd,
      breakMinutes: shift.breakMinutes,
    });
  }

  /** Enter in a time field saves the row (quick entry). */
  function onEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && dirty && !pending) {
      event.preventDefault();
      submit();
    }
  }

  function changeStatus() {
    if (!newStatus) return;
    if (statusReason.trim().length < 3) {
      setError("reason_required");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateShiftAction(
        shift.id,
        { status: newStatus as ShiftView["status"] },
        statusReason,
        shift.version,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatusReason("");
      setNewStatus("");
      showToast({ message: t("saved") });
    });
  }

  async function loadHistory() {
    setHistory(await shiftHistoryAction(shift.id));
  }

  const recording = (() => {
    if (!counts) return null;
    switch (shift.recording) {
      case "recorded":
        return (
          <StatusBadge tone="ok" icon={CircleCheck}>
            {t("recording.recorded")}
          </StatusBadge>
        );
      case "not_due":
        return (
          <StatusBadge tone="neutral" icon={CircleDashed}>
            {t("recording.notDue")}
          </StatusBadge>
        );
      case "pending":
        return (
          <StatusBadge tone="neutral" icon={Clock}>
            {t("recording.pending", { date: formatDateShort(shift.recordingDeadline, locale) })}
          </StatusBadge>
        );
      case "alert":
        return (
          <StatusBadge tone="warn" icon={Clock}>
            {t("recording.alert", { date: formatDateShort(shift.recordingDeadline, locale) })}
          </StatusBadge>
        );
      case "overdue":
        return (
          <StatusBadge tone="critical" icon={TriangleAlert}>
            {t("recording.overdue", { date: formatDateShort(shift.recordingDeadline, locale) })}
          </StatusBadge>
        );
    }
  })();

  const planned =
    shift.plannedStart && shift.plannedEnd ? `${shift.plannedStart}–${shift.plannedEnd}` : null;

  return (
    <li
      className={cn(
        "flex flex-col gap-2 border-border-subtle border-b px-4 py-3 last:border-b-0",
        !counts && "bg-sunken text-muted-foreground",
        overDay && "bg-status-critical-bg/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-44 flex-1 basis-44 items-center gap-2">
          <Avatar name={shift.staffName} size="lg" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{shift.staffName}</span>
            <span className="truncate text-muted-foreground text-tiny">
              {[
                showDate ? formatDateShort(shift.workDate, locale) : null,
                shift.dutyRoleName,
                counts ? null : t(`status.${shift.status}`),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </div>

        <div className="flex min-w-24 flex-col">
          <span className="text-faint-foreground text-tiny">{t("planned")}</span>
          <span className="tabular">{planned ?? t("none")}</span>
        </div>

        {counts &&
          (editable ? (
            <div className="flex flex-wrap items-end gap-2">
              <Label className="flex flex-col gap-0.5 text-faint-foreground text-tiny items-stretch font-normal leading-tight">
                {t("from")}
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={shift.plannedStart ?? "HH:MM"}
                  maxLength={9}
                  value={start}
                  disabled={pending}
                  onChange={(e) => setStart(e.target.value)}
                  onBlur={(e) => {
                    const v = normalizeClockTime(e.target.value);
                    if (v) setStart(v);
                  }}
                  onKeyDown={onEnter}
                  className={TIME_INPUT}
                />
              </Label>
              <Label className="flex flex-col gap-0.5 text-faint-foreground text-tiny items-stretch font-normal leading-tight">
                {t("to")}
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={shift.plannedEnd ?? "HH:MM"}
                  maxLength={9}
                  value={end}
                  disabled={pending}
                  onChange={(e) => setEnd(e.target.value)}
                  onBlur={(e) => {
                    const v = normalizeClockTime(e.target.value);
                    if (v) setEnd(v);
                  }}
                  onKeyDown={onEnter}
                  className={TIME_INPUT}
                />
              </Label>
              <Label className="flex flex-col gap-0.5 text-faint-foreground text-tiny items-stretch font-normal leading-tight">
                {t("break")}
                <select
                  value={pause}
                  disabled={pending}
                  onChange={(e) => setPause(Number(e.target.value))}
                  className={cn(
                    SELECT_CLASS,
                    "min-h-12 w-24 text-base md:min-h-(--control-h) md:text-small",
                  )}
                >
                  {(BREAKS.includes(pause) ? BREAKS : [...BREAKS, pause].sort((a, b) => a - b)).map(
                    (m) => (
                      <option key={m} value={m}>
                        {t("minutes", { count: m })}
                      </option>
                    ),
                  )}
                </select>
              </Label>
            </div>
          ) : (
            <div className="flex min-w-32 flex-col">
              <span className="text-faint-foreground text-tiny">{t("actual")}</span>
              <span className="tabular">
                {hasActual ? `${shift.actualStart}–${shift.actualEnd}` : t("none")}
                {hasActual && shift.breakMinutes > 0 && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {t("minutes", { count: shift.breakMinutes })}
                  </span>
                )}
              </span>
            </div>
          ))}

        {counts && (
          <div className="flex min-w-16 flex-col">
            <span className="text-faint-foreground text-tiny">{t("hours")}</span>
            <span className={cn("tabular font-semibold", overDay && "text-status-critical")}>
              {minutes === null ? t("none") : formatHours(minutes, locale)}
            </span>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {recording}
          {shift.locked && (
            <StatusBadge tone="neutral" icon={Lock}>
              {t("locked")}
            </StatusBadge>
          )}
          {editable && counts && !hasActual && canRecord && planned && (
            <Button size="sm" disabled={pending} onClick={takePlanned}>
              {t("takePlanned")}
            </Button>
          )}
          {editable && counts && dirty && (
            <Button
              variant="default"
              size="sm"
              aria-busy={pending}
              disabled={pending}
              onClick={submit}
            >
              {t("save")}
            </Button>
          )}
          {env.canManage && (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={more}
              onClick={() => setMore((value) => !value)}
            >
              {t("more")}
            </Button>
          )}
        </div>
      </div>

      {editable && counts && hasActual && dirty && (
        <Label className="flex flex-col gap-1 text-small items-stretch font-normal leading-tight">
          <span className="font-medium">{t("reason")}</span>
          <Input
            value={reason}
            autoComplete="off"
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            aria-invalid={error === "reason_required"}
          />
          <span className="text-faint-foreground text-tiny">{t("reasonHint")}</span>
        </Label>
      )}

      <WarningList warnings={warnings} />
      {shift.locked && env.canManage && (
        <p className="m-0 text-faint-foreground text-tiny">{t("lockedHint")}</p>
      )}

      {error && (
        <p role="alert" className="m-0 text-small text-status-critical">
          {errorText(error)}
        </p>
      )}

      {more && env.canManage && (
        <div className="flex flex-col gap-3 rounded-lg border bg-sunken p-3">
          <div className="flex flex-wrap items-end gap-3">
            {editable && (
              <Button size="sm" onClick={() => onEdit(shift)}>
                {t("edit")}
              </Button>
            )}
            <Button size="sm" onClick={loadHistory}>
              {t("history")}
            </Button>
          </div>
          {editable && (
            <div className="flex flex-wrap items-end gap-2">
              <Label className="flex flex-col gap-0.5 text-faint-foreground text-tiny items-stretch font-normal leading-tight">
                {t("statusLabel")}
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className={cn(SELECT_CLASS, "w-48")}
                >
                  <option value="">{t("statusKeep")}</option>
                  {(["confirmed", "no_show", "cancelled", "declined"] as const)
                    .filter((s) => s !== shift.status)
                    .map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                </select>
              </Label>
              {newStatus && (
                <>
                  <Label className="flex min-w-48 flex-1 flex-col gap-0.5 text-faint-foreground text-tiny items-stretch font-normal leading-tight">
                    {t("reason")}
                    <Input
                      value={statusReason}
                      autoComplete="off"
                      onChange={(e) => setStatusReason(e.target.value)}
                    />
                  </Label>
                  <Button size="sm" variant="default" disabled={pending} onClick={changeStatus}>
                    {t("statusSave")}
                  </Button>
                </>
              )}
            </div>
          )}
          {history && (
            <div className="flex flex-col gap-1.5 text-small">
              <p className="m-0 font-semibold text-muted-foreground text-tiny">{t("history")}</p>
              {history.length === 0 ? (
                <p className="m-0 text-faint-foreground">{t("historyEmpty")}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {history.map((h) => (
                    <li key={h.version}>
                      <span className="tabular text-muted-foreground">
                        {t("historyVersion", { version: h.version })}
                        {" · "}
                        {new Date(h.changedAt).toLocaleString(locale === "en" ? "en-GB" : "de-DE", {
                          timeZone: "Europe/Berlin",
                        })}
                        {h.changedBy ? ` · ${h.changedBy}` : ""}
                      </span>
                      <span className="block">
                        {String(h.before.actualStart ?? "").slice(0, 5) || t("none")}
                        {"–"}
                        {String(h.before.actualEnd ?? "").slice(0, 5) || t("none")}
                        {" · "}
                        {t("historyReason", { reason: h.reason })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
