"use client";

import {
  NOTIFY_CHANNELS,
  NOTIFY_TIMINGS,
  type NotifyChannel,
  type NotifyTiming,
} from "@marktwerk/core";
import { CircleAlert, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { type Ref, useId } from "react";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NO_NOTIFY, type NotifyFormValue, RELATIVE_TIMINGS } from "./notify-form";

/**
 * Who gets the notification. While the Team module is hidden it is the person who sets it (`self`: their
 * own email, whether they have a phone); with Team visible it is the task's assignee (`person`; `null`
 * flags mean unknown, so no hint). Contact data of staff never reaches the client, only these flags.
 */
export type NotifyRecipient =
  | { kind: "self"; email: string; hasPhone: boolean }
  | { kind: "person"; name: string; hasEmail: boolean | null; hasPhone: boolean | null };

/**
 * "Benachrichtigung senden an": Mail / WhatsApp and when (UI and storage only, nothing is sent yet).
 * Controlled. Relative timings need a due date, so they are disabled while the form has none.
 */
export function NotifyFields({
  value,
  onChange,
  recipient,
  hasDue,
  disabled = false,
  whenRef,
  invalid = false,
  describedBy,
}: {
  value: NotifyFormValue;
  onChange: (next: NotifyFormValue) => void;
  /** The recipient. Null when nobody is (Team visible and nobody assigned). */
  recipient: NotifyRecipient | null;
  hasDue: boolean;
  disabled?: boolean;
  /** To focus the "Wann" select when the form's error is about it. */
  whenRef?: Ref<HTMLSelectElement>;
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
  if (recipient?.kind === "self") {
    if (value.channels.includes("whatsapp") && !recipient.hasPhone) missing.push(t("noPhoneSelf"));
  } else if (recipient) {
    if (value.channels.includes("email") && recipient.hasEmail === false)
      missing.push(t("noEmail", { name: recipient.name }));
    if (value.channels.includes("whatsapp") && recipient.hasPhone === false)
      missing.push(t("noPhone", { name: recipient.name }));
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
                ref={whenRef}
                className={SELECT_CLASS}
                value={value.timing}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                aria-describedby={
                  [!hasDue ? `${uid}-needs-due` : null, describedBy].filter(Boolean).join(" ") ||
                  undefined
                }
                onChange={(e) =>
                  onChange({ ...value, timing: e.target.value as NotifyTiming | "" })
                }
              >
                <option value="" disabled>
                  {t("choose")}
                </option>
                {NOTIFY_TIMINGS.map((timing) => {
                  const blocked = !hasDue && RELATIVE_TIMINGS.includes(timing);
                  return (
                    <option key={timing} value={timing} disabled={blocked}>
                      {t(`timing.${timing}`)}
                    </option>
                  );
                })}
              </select>
              {!hasDue && (
                <p id={`${uid}-needs-due`} className="text-muted-foreground text-tiny">
                  {t("needsDue")}
                </p>
              )}
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

          {recipient ? (
            <p className="text-small">
              {recipient.kind === "self"
                ? t("toSelf", { email: recipient.email })
                : t("to", { name: recipient.name })}
            </p>
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
