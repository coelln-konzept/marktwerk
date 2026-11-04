"use client";

import { paymentDueDate, paymentReference, reminderDate } from "@marktwerk/core";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { formatDateWithWeekday } from "@/lib/format";
import { type BookingSettings, prototypeToday, useStandplanStore } from "./store";

/**
 * PROTOTYPE: Einstellungen → Buchungen (stored in the browser with the Standplan). Payment deadline and
 * reminder timing of the two-step booking, bank details for the Platzkarte, and a live example.
 */
export function BookingSettingsForm({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations("settings.bookings");
  const locale = useLocale();
  const { state, update } = useStandplanStore();
  const s = state.bookingSettings;
  const set = (patch: Partial<BookingSettings>) =>
    update((cur) => ({ ...cur, bookingSettings: { ...cur.bookingSettings, ...patch } }));
  const days = (v: string, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.trunc(Number(v) || 0)));

  // Example: a Platzkarte sent today for a market three weeks ahead.
  const today = prototypeToday(state);
  const market = new Date(`${today}T12:00:00Z`);
  market.setUTCDate(market.getUTCDate() + 21);
  const marketDate = market.toISOString().slice(0, 10);
  const due = paymentDueDate(today, marketDate, s.paymentDays);
  const reminder = reminderDate(today, due, s.reminderDaysBefore);

  const field = (label: string, key: "payee" | "bank" | "iban" | "bic", hint?: string) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input control
    <label className="flex flex-col gap-1 text-small">
      <span className="font-medium">{label}</span>
      <Input value={s[key]} disabled={!canWrite} onChange={(e) => set({ [key]: e.target.value })} />
      {hint && <span className="text-faint-foreground text-tiny">{hint}</span>}
    </label>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-muted-foreground text-small">{t("intro")}</p>
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t("rulesTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input control */}
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium">{t("paymentDays")}</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={s.paymentDays}
              disabled={!canWrite}
              onChange={(e) => set({ paymentDays: days(e.target.value, 1, 20) })}
            />
            <span className="text-faint-foreground text-tiny">{t("paymentDaysHint")}</span>
          </label>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input control */}
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium">{t("reminderDaysBefore")}</span>
            <Input
              type="number"
              min={0}
              max={10}
              value={s.reminderDaysBefore}
              disabled={!canWrite}
              onChange={(e) => set({ reminderDaysBefore: days(e.target.value, 0, 10) })}
            />
            <span className="text-faint-foreground text-tiny">{t("reminderHint")}</span>
          </label>
        </div>
        <p className="rounded-lg bg-sunken p-3 text-small">
          {t("example", {
            sent: formatDateWithWeekday(today, locale),
            due: formatDateWithWeekday(due, locale),
          })}{" "}
          {reminder
            ? t("exampleReminder", { date: formatDateWithWeekday(reminder, locale) })
            : t("exampleNoReminder")}
        </p>
      </section>
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t("bankTitle")}</h2>
        <p className="text-faint-foreground text-tiny">{t("bankHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field(t("payee"), "payee")}
          {field(t("bank"), "bank")}
          {field(t("iban"), "iban")}
          {field(t("bic"), "bic")}
        </div>
      </section>
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t("referenceTitle")}</h2>
        <p className="text-small">
          {t("referenceExample", {
            ref: paymentReference({
              eventName: "Flohmarkt Riehler Gürtel",
              marketDate: "2026-11-12",
              stallNumber: "B-13",
            }),
          })}
        </p>
        <p className="text-faint-foreground text-tiny">{t("referenceHint")}</p>
      </section>
    </div>
  );
}
