"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatDateWithWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingItem, PlanEvent, VendorOption } from "./types";

type Source = "phone" | "walkin";
type Payment = "mail" | "paid";

/**
 * "+ Buchung": a booking taken by phone or in person (spec 2026-11-04, manual/Festplatz). Creates an
 * open request for the current event; payment is chosen per booking: Platzkarte by mail (two-step) or
 * already paid (cash / on site → Fest once placed).
 */
export function ManualBookingDialog({
  ev,
  vendors,
  onClose,
  onCreate,
}: {
  ev: PlanEvent;
  vendors: VendorOption[];
  onClose: () => void;
  onCreate: (item: BookingItem) => void;
}) {
  const t = useTranslations("standplan.manual");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [known, setKnown] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<"private" | "commercial">("private");
  const [lengthM, setLengthM] = useState("3");
  const [car, setCar] = useState(false);
  const [carM, setCarM] = useState("5");
  const [power, setPower] = useState(false);
  const [note, setNote] = useState("");
  const [source, setSource] = useState<Source>("phone");
  const [payment, setPayment] = useState<Payment>("mail");

  const q = query.trim().toLowerCase();
  const matches =
    q.length >= 2
      ? vendors
          .filter((v) =>
            [v.name, v.companyName ?? "", v.email, v.phone ?? ""].some((x) =>
              x.toLowerCase().includes(q),
            ),
          )
          .slice(0, 6)
      : [];

  const pick = (v: VendorOption) => {
    setKnown(true);
    setName(v.name);
    setCompany(v.companyName ?? "");
    setEmail(v.email);
    setPhone(v.phone ?? "");
    setKind(v.kind);
    if (v.defaultLengthCm) setLengthM(String(v.defaultLengthCm / 100));
    setCar(v.hasCar);
    if (v.carLengthCm) setCarM(String(v.carLengthCm / 100));
    setQuery("");
  };

  const cm = (m: string) => Math.round(Number(m.replace(",", ".")) * 100) || 0;
  const lengthCm = cm(lengthM);
  const hasEmail = /\S+@\S+\.\S+/.test(email.trim());
  const effectivePayment: Payment = hasEmail ? payment : "paid";
  const valid = name.trim().length > 1 && lengthCm >= 100 && lengthCm <= 5000;

  const submit = () => {
    if (!valid) return;
    const now = new Date();
    const ref = `${source === "phone" ? "TEL" : "VO"}-${now.getTime().toString(36).toUpperCase()}`;
    onCreate({
      id: `manual-${now.getTime()}:${ev.id}`,
      mailId: null,
      eventId: ev.id,
      vendorName: name.trim(),
      companyName: company.trim() || null,
      email: email.trim(),
      phone: phone.trim() || null,
      kind,
      lengthCm,
      carRequested: car,
      carLengthCm: car ? cm(carM) : null,
      power,
      categories: [],
      preferredRowLabel: null,
      preferredOffsetCm: null,
      preferredRaw: null,
      note: note.trim() || null,
      receivedAt: now.toISOString(),
      requestRef: ref,
      knownVendor: known,
      source,
      paidUpfront: effectivePayment === "paid",
    });
  };

  const choice = <T extends string>(
    value: T,
    current: T,
    set: (v: T) => void,
    label: string,
    disabled?: boolean,
  ) => (
    <button
      type="button"
      aria-pressed={current === value}
      disabled={disabled}
      onClick={() => set(value)}
      className={cn(
        "flex-1 rounded-md border px-3 py-2 text-left text-small disabled:opacity-50",
        current === value ? "border-primary bg-selected font-semibold" : "hover:bg-hover",
      )}
    >
      {label}
    </button>
  );

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={t("subtitle", {
        event: ev.name,
        date: formatDateWithWeekday(ev.startsOn, locale),
      })}
      closeLabel={t("cancel")}
      className="w-[min(560px,calc(100%-2rem))]"
    >
      <form
        className="flex flex-col gap-3 text-small"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex gap-2">
          {choice<Source>("phone", source, setSource, t("source.phone"))}
          {choice<Source>("walkin", source, setSource, t("source.walkin"))}
        </div>

        <div className="relative">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input control */}
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("lookup")}</span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("lookupPlaceholder")}
            />
          </label>
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-overlay">
              {matches.map((v) => (
                <li key={v.email}>
                  <button
                    type="button"
                    onClick={() => pick(v)}
                    className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-hover"
                  >
                    <span className="font-medium">{v.companyName ?? v.name}</span>
                    <span className="text-muted-foreground text-tiny">
                      {v.email}
                      {v.phone ? ` · ${v.phone}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {known && <p className="mt-1 text-status-ok text-tiny">{t("knownVendor")}</p>}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {field(
            t("name"),
            name,
            (v) => {
              setName(v);
              setKnown(false);
            },
            { required: true },
          )}
          {field(t("company"), company, setCompany)}
          {field(t("phone"), phone, setPhone, { type: "tel" })}
          {field(t("email"), email, setEmail, { type: "email", hint: t("emailHint") })}
        </div>
        <div className="flex gap-2">
          {choice<"private" | "commercial">("private", kind, setKind, t("private"))}
          {choice<"private" | "commercial">("commercial", kind, setKind, t("commercial"))}
        </div>
        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
          {field(t("length"), lengthM, setLengthM, { inputMode: "decimal" })}
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" checked={car} onChange={(e) => setCar(e.target.checked)} />
            {t("car")}
          </label>
          {car ? field(t("carLength"), carM, setCarM, { inputMode: "decimal" }) : <span />}
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" checked={power} onChange={(e) => setPower(e.target.checked)} />
            {t("power")}
          </label>
        </div>
        {field(t("note"), note, setNote)}

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-medium">{t("payment.label")}</legend>
          <div className="flex gap-2">
            {choice<Payment>("mail", effectivePayment, setPayment, t("payment.mail"), !hasEmail)}
            {choice<Payment>("paid", effectivePayment, setPayment, t("payment.paid"))}
          </div>
          <p className="text-faint-foreground text-tiny">
            {hasEmail ? t(`payment.${effectivePayment}Hint`) : t("payment.noEmail")}
          </p>
        </fieldset>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="default" disabled={!valid}>
            {t("create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function field(
  label: string,
  value: string,
  set: (v: string) => void,
  opts: {
    type?: string;
    required?: boolean;
    hint?: string;
    inputMode?: "decimal" | "text";
  } = {},
) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input control
    <label className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      <Input
        value={value}
        type={opts.type}
        required={opts.required}
        inputMode={opts.inputMode}
        onChange={(e) => set(e.target.value)}
      />
      {opts.hint && <span className="text-faint-foreground text-tiny">{opts.hint}</span>}
    </label>
  );
}
