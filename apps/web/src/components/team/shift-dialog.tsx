"use client";

import { isIsoDate, normalizeClockTime } from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createShiftAction, updateShiftAction } from "@/app/(app)/team/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { SELECT_CLASS } from "../settings/select-class";
import { type LiveWarning, liveWarnings } from "./live-warnings";
import type { ShiftEnvironment, ShiftView } from "./shift-types";
import { WarningList } from "./warning-list";

const BREAKS = [0, 15, 30, 45, 60, 75, 90];

type Form = {
  staffMemberId: string;
  eventId: string;
  dutyRoleId: string;
  workDate: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
  breakMinutes: number;
};

function initialForm(
  shift: ShiftView | null,
  defaults: { eventId: string | null; workDate: string; staffMemberId?: string },
): Form {
  return {
    staffMemberId: shift?.staffMemberId ?? defaults.staffMemberId ?? "",
    eventId: shift ? (shift.eventId ?? "") : (defaults.eventId ?? ""),
    dutyRoleId: shift?.dutyRoleId ?? "",
    workDate: shift?.workDate ?? defaults.workDate,
    plannedStart: shift?.plannedStart ?? "",
    plannedEnd: shift?.plannedEnd ?? "",
    actualStart: shift?.actualStart ?? "",
    actualEnd: shift?.actualEnd ?? "",
    breakMinutes: shift?.breakMinutes ?? 30,
  };
}

/**
 * "Schicht hinzufügen" / "Bearbeiten": person, role, day, planned and actual times, break. Warnings
 * appear while typing. Editing an existing shift needs a reason (kept in its history).
 */
export function ShiftDialog({
  open,
  onOpenChange,
  env,
  shift,
  fixedEventId,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  env: ShiftEnvironment;
  /** The shift to edit; null creates a new one. */
  shift: ShiftView | null;
  /** Event tab: the event is given and not selectable. */
  fixedEventId?: string;
  defaults: { workDate: string; staffMemberId?: string };
}) {
  const t = useTranslations("hours.shift");
  const tErr = useTranslations("hours.errors");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Form>(() =>
    initialForm(shift, { ...defaults, eventId: fixedEventId ?? null }),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const norm = (value: string) => (value.trim() === "" ? "" : (normalizeClockTime(value) ?? value));

  // The times the warnings are based on: actual if typed, otherwise planned.
  const useActual = form.actualStart.trim() !== "" && form.actualEnd.trim() !== "";
  const warnings: LiveWarning[] = liveWarnings(env.live, {
    staffMemberId: form.staffMemberId,
    workDate: form.workDate,
    start: norm(useActual ? form.actualStart : form.plannedStart),
    end: norm(useActual ? form.actualEnd : form.plannedEnd),
    breakMinutes: form.breakMinutes,
    shiftId: shift?.id,
    currentMinutes: shift?.minutes,
  });

  const errorText = (code: string) =>
    tErr.has(code as never) ? tErr(code as never) : tErr("generic");

  function submit() {
    const times = {
      plannedStart: norm(form.plannedStart),
      plannedEnd: norm(form.plannedEnd),
      actualStart: norm(form.actualStart),
      actualEnd: norm(form.actualEnd),
    };
    const orNull = (value: string) => (value === "" ? null : value);
    if (!form.staffMemberId) return setError("invalid_person");
    if (!isIsoDate(form.workDate)) return setError("invalid_date");
    if (shift && reason.trim().length < 3) return setError("reason_required");
    const fields = {
      eventId: fixedEventId ?? (form.eventId || null),
      staffMemberId: form.staffMemberId,
      dutyRoleId: form.dutyRoleId || null,
      workDate: form.workDate,
      plannedStart: orNull(times.plannedStart),
      plannedEnd: orNull(times.plannedEnd),
      actualStart: orNull(times.actualStart),
      actualEnd: orNull(times.actualEnd),
      breakMinutes: form.breakMinutes,
    };
    setError(null);
    startTransition(async () => {
      const result = shift
        ? await updateShiftAction(shift.id, fields, reason, shift.version)
        : await createShiftAction(fields);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      showToast({ message: shift ? t("saved") : t("created") });
    });
  }

  const invalid = (codes: string[]) =>
    error && codes.includes(error) ? { "aria-invalid": true as const } : {};

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={shift ? t("dialog.editTitle") : t("dialog.createTitle")}
      description={t("dialog.description")}
      closeLabel={t("dialog.cancel")}
      className="w-[min(560px,calc(100%-2rem))]"
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shift-person">{t("dialog.person")}</Label>
            <select
              id="shift-person"
              value={form.staffMemberId}
              onChange={(e) => set("staffMemberId", e.target.value)}
              className={SELECT_CLASS}
              {...invalid(["invalid_person"])}
            >
              <option value="">{t("dialog.choose")}</option>
              {env.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shift-role">{t("dialog.role")}</Label>
            <select
              id="shift-role"
              value={form.dutyRoleId}
              onChange={(e) => set("dutyRoleId", e.target.value)}
              className={SELECT_CLASS}
              {...invalid(["invalid_role"])}
            >
              <option value="">{t("dialog.noRole")}</option>
              {env.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {!fixedEventId && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="shift-event">{t("dialog.event")}</Label>
              <select
                id="shift-event"
                value={form.eventId}
                onChange={(e) => set("eventId", e.target.value)}
                className={SELECT_CLASS}
                {...invalid(["invalid_event"])}
              >
                <option value="">{t("dialog.office")}</option>
                {env.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shift-date">{t("dialog.date")}</Label>
            <Input
              id="shift-date"
              type="date"
              value={form.workDate}
              onChange={(e) => set("workDate", e.target.value)}
              className="tabular"
              {...invalid(["invalid_date", "period_locked"])}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shift-break">{t("dialog.break")}</Label>
            <select
              id="shift-break"
              value={form.breakMinutes}
              onChange={(e) => set("breakMinutes", Number(e.target.value))}
              className={SELECT_CLASS}
              {...invalid(["invalid_break", "break_too_long"])}
            >
              {(BREAKS.includes(form.breakMinutes)
                ? BREAKS
                : [...BREAKS, form.breakMinutes].sort((a, b) => a - b)
              ).map((m) => (
                <option key={m} value={m}>
                  {t("minutes", { count: m })}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-2 font-medium text-small">{t("dialog.plannedTimes")}</legend>
          {(["plannedStart", "plannedEnd"] as const).map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`shift-${key}`} className="text-small">
                {key === "plannedStart" ? t("from") : t("to")}
              </Label>
              <Input
                id={`shift-${key}`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="HH:MM"
                maxLength={9}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                onBlur={(e) => set(key, norm(e.target.value))}
                className="tabular"
                {...invalid(["invalid_time", "times_incomplete", "no_times", "too_long"])}
              />
            </div>
          ))}
        </fieldset>

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-2 font-medium text-small">{t("dialog.actualTimes")}</legend>
          {(["actualStart", "actualEnd"] as const).map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`shift-${key}`} className="text-small">
                {key === "actualStart" ? t("from") : t("to")}
              </Label>
              <Input
                id={`shift-${key}`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="HH:MM"
                maxLength={9}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                onBlur={(e) => set(key, norm(e.target.value))}
                className="tabular"
                {...invalid(["future_actual", "status_conflict"])}
              />
            </div>
          ))}
          <p className="col-span-2 m-0 text-faint-foreground text-tiny">{t("dialog.actualHint")}</p>
        </fieldset>

        {shift && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shift-reason">{t("reason")}</Label>
            <Input
              id="shift-reason"
              autoComplete="off"
              value={reason}
              placeholder={t("reasonPlaceholder")}
              onChange={(e) => setReason(e.target.value)}
              {...invalid(["reason_required"])}
            />
            <span className="text-faint-foreground text-tiny">{t("reasonHint")}</span>
          </div>
        )}

        <WarningList warnings={warnings} />
        {error && (
          <p role="alert" className="m-0 text-small text-status-critical">
            {errorText(error)}
          </p>
        )}
        <div className={cn("flex justify-end gap-2")}>
          <Button disabled={pending} onClick={() => onOpenChange(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
            {t("dialog.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
