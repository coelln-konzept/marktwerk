"use client";

import {
  checkNotifySetting,
  DEFAULT_TIME_ZONE,
  NOTIFY_CHANNELS,
  NOTIFY_TIMINGS,
  type NotifyChannel,
  type NotifyProblem,
  type NotifyTiming,
  resolveRelativeDue,
} from "@marktwerk/core";
import { CircleAlert, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NotifyInput } from "@/server/services/tasks";

/** What the form holds; `at` is the `datetime-local` text (wall clock in Europe/Berlin). */
export type NotifyFormValue = {
  channels: NotifyChannel[];
  timing: NotifyTiming | "";
  at: string;
};

export const NO_NOTIFY: NotifyFormValue = { channels: [], timing: "", at: "" };

export type NotifyAssignee = { name: string; email: string | null; phone: string | null };

const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/** `datetime-local` text → the instant, reading it as Europe/Berlin wall clock (null when incomplete). */
function instantOf(at: string): Date | null {
  const match = WALL_CLOCK.exec(at);
  if (!match) return null;
  const [, day, time] = match as unknown as [string, string, string];
  try {
    return resolveRelativeDue(day, 0, time, DEFAULT_TIME_ZONE);
  } catch {
    return null;
  }
}

/** An instant → `datetime-local` text in Europe/Berlin wall clock. */
function wallClockOf(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** The saved setting as form state. */
export function notifyFormOf(saved: NotifyInput): NotifyFormValue {
  return {
    channels: saved.channels,
    timing: saved.timing ?? "",
    at: saved.at ? wallClockOf(saved.at) : "",
  };
}

/** The form state as the service input (instant for the custom moment). */
export function notifyInputOf(value: NotifyFormValue): NotifyInput {
  if (value.channels.length === 0) return { channels: [], timing: null, at: null };
  const timing = value.timing || null;
  return {
    channels: value.channels,
    timing,
    at: timing === "custom" ? (instantOf(value.at)?.toISOString() ?? null) : null,
  };
}

/** What is wrong with the form state, if anything (same rule the service applies). */
export function notifyProblemOf(value: NotifyFormValue, hasDue: boolean): NotifyProblem | null {
  const input = notifyInputOf(value);
  return checkNotifySetting(
    { channels: input.channels, timing: input.timing, at: input.at ? new Date(input.at) : null },
    hasDue,
  );
}

const RELATIVE: readonly NotifyTiming[] = ["due_day", "before_1d", "before_3d", "before_7d"];

/**
 * "Benachrichtigung senden an": Mail / WhatsApp and when (UI and storage only, nothing is sent yet).
 * Controlled. Relative timings need a due date, so they are disabled while the form has none.
 */
export function NotifyFields({
  value,
  onChange,
  assignee,
  hasDue,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  value: NotifyFormValue;
  onChange: (next: NotifyFormValue) => void;
  /** The task's assignee: the recipient. Null when nobody is assigned. */
  assignee: NotifyAssignee | null;
  hasDue: boolean;
  disabled?: boolean;
  /** The form's validation error is about these fields. */
  invalid?: boolean;
  /** Id of the error text. */
  describedBy?: string;
}) {
  const t = useTranslations("board.notify");
  const uid = useId();
  const active = value.channels.length > 0;

  function toggle(channel: NotifyChannel, on: boolean) {
    const channels = NOTIFY_CHANNELS.filter((c) =>
      c === channel ? on : value.channels.includes(c),
    );
    // Without a channel nothing is sent, so the timing goes with it.
    onChange(channels.length === 0 ? NO_NOTIFY : { ...value, channels });
  }

  const missing: string[] = [];
  if (assignee) {
    if (value.channels.includes("email") && !assignee.email)
      missing.push(t("noEmail", { name: assignee.name }));
    if (value.channels.includes("whatsapp") && !assignee.phone)
      missing.push(t("noPhone", { name: assignee.name }));
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-medium text-small">{t("legend")}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {NOTIFY_CHANNELS.map((channel) => (
          <label key={channel} className="flex items-center gap-2 text-small">
            <input
              type="checkbox"
              className="size-4 accent-(--primary)"
              checked={value.channels.includes(channel)}
              disabled={disabled}
              onChange={(e) => toggle(channel, e.target.checked)}
            />
            {t(`channels.${channel}`)}
          </label>
        ))}
      </div>

      {active && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-when`}>{t("when")}</Label>
              <select
                id={`${uid}-when`}
                className={SELECT_CLASS}
                value={value.timing}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(e) =>
                  onChange({ ...value, timing: e.target.value as NotifyTiming | "" })
                }
              >
                <option value="" disabled>
                  {t("choose")}
                </option>
                {NOTIFY_TIMINGS.map((timing) => {
                  const blocked = !hasDue && RELATIVE.includes(timing);
                  return (
                    <option key={timing} value={timing} disabled={blocked}>
                      {t(`timing.${timing}`)}
                    </option>
                  );
                })}
              </select>
              {!hasDue && <p className="text-muted-foreground text-tiny">{t("needsDue")}</p>}
            </div>
            {value.timing === "custom" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-at`}>{t("customAt")}</Label>
                <Input
                  id={`${uid}-at`}
                  type="datetime-local"
                  value={value.at}
                  disabled={disabled}
                  aria-invalid={invalid || undefined}
                  aria-describedby={`${uid}-at-hint`}
                  onChange={(e) => onChange({ ...value, at: e.target.value })}
                />
                <p id={`${uid}-at-hint`} className="text-muted-foreground text-tiny">
                  {t("customAtHint")}
                </p>
              </div>
            )}
          </div>

          {assignee ? (
            <p className="text-small">{t("to", { name: assignee.name })}</p>
          ) : (
            <p className="flex items-start gap-1.5 text-status-warn text-tiny">
              <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {t("noAssignee")}
            </p>
          )}
          {missing.map((text) => (
            <p key={text} className="flex items-start gap-1.5 text-status-warn text-tiny">
              <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {text}
            </p>
          ))}
        </>
      )}

      <p
        role="note"
        className="flex items-start gap-1.5 rounded-lg bg-status-info-bg px-3 py-2 text-small text-status-info"
      >
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {t("pending")}
      </p>
    </fieldset>
  );
}
