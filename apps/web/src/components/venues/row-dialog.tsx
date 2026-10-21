"use client";

import { formatMetres, parseMetresToCm } from "@marktwerk/core";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { addRowAction, updateRowAction } from "@/app/(app)/orte/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useErrorText } from "./shared";

export type RowValues = {
  id: string;
  label: string;
  lengthCm: number;
  depthCm: number;
  carAllowed: boolean;
  carSlots: number;
  power: boolean;
  water: boolean;
};

const FIELD_OF_ERROR: Record<string, string> = {
  invalid_row_label: "row-label",
  invalid_length: "row-length",
  invalid_depth: "row-depth",
  invalid_car_slots: "row-slots",
};

/** Add a row to a zone (`row` unset) or edit one. Seven small fields: a modal. */
export function RowDialog({
  open,
  onOpenChange,
  zone,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zone: { id: string; name: string };
  row?: RowValues;
}) {
  const t = useTranslations("venues.manage");
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={row ? t("row.editTitle") : t("row.addTitle", { zone: zone.name })}
      description={row ? zone.name : undefined}
      closeLabel={t("close")}
    >
      <RowForm zoneId={zone.id} row={row} onClose={() => onOpenChange(false)} />
    </Modal>
  );
}

/** Mounted fresh each time the dialog opens, so the fields always start from the current row. */
function RowForm({
  zoneId,
  row,
  onClose,
}: {
  zoneId: string;
  row?: RowValues;
  onClose: () => void;
}) {
  const t = useTranslations("venues.manage");
  const locale = useLocale();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(row?.label ?? "");
  const [length, setLength] = useState(row ? formatMetres(row.lengthCm, locale) : "");
  const [depth, setDepth] = useState(row ? formatMetres(row.depthCm, locale) : "");
  const [carAllowed, setCarAllowed] = useState(row?.carAllowed ?? false);
  const [carSlots, setCarSlots] = useState(String(row?.carSlots ?? 0));
  const [power, setPower] = useState(row?.power ?? false);
  const [water, setWater] = useState(row?.water ?? false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);

  function fail(code: string) {
    const field = FIELD_OF_ERROR[code] ?? null;
    setError({ field, text: errorText(code) });
    if (field) document.getElementById(field)?.focus();
  }

  function submit() {
    setError(null);
    const lengthCm = parseMetresToCm(length);
    if (!lengthCm) return fail("invalid_length");
    const depthCm = parseMetresToCm(depth);
    if (!depthCm) return fail("invalid_depth");
    const slots = carAllowed ? carSlots.trim() : "0";
    if (!/^\d{1,3}$/.test(slots)) return fail("invalid_car_slots");

    const input = {
      label,
      lengthCm,
      depthCm,
      carAllowed,
      carSlots: Number(slots),
      power,
      water,
    };
    startTransition(async () => {
      const result = row ? await updateRowAction(row.id, input) : await addRowAction(zoneId, input);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      onClose();
      if (row && "changed" in result.data && !result.data.changed) {
        showToast({ message: t("row.unchanged") });
        return;
      }
      showToast({ message: t(row ? "row.saved" : "row.added", { row: label.trim() }) });
    });
  }

  const invalid = (field: string) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": "row-error" }
      : {};
  const check = "flex min-h-8 items-center gap-2 text-small";

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="row-label">{t("row.label")}</Label>
        <Input
          id="row-label"
          value={label}
          maxLength={40}
          required
          autoComplete="off"
          placeholder={t("row.labelHint")}
          onChange={(e) => setLabel(e.target.value)}
          {...invalid("row-label")}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["row-length", t("row.length"), length, setLength],
            ["row-depth", t("row.depth"), depth, setDepth],
          ] as const
        ).map(([id, text, value, set]) => (
          <div key={id} className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{text}</Label>
            <div className="relative">
              <Input
                id={id}
                value={value}
                inputMode="decimal"
                autoComplete="off"
                required
                className="tabular pr-9"
                onChange={(e) => set(e.target.value)}
                onBlur={(e) => {
                  const cm = parseMetresToCm(e.target.value);
                  if (cm) set(formatMetres(cm, locale));
                }}
                {...invalid(id)}
              />
              <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                m
              </span>
            </div>
          </div>
        ))}
        <p className="col-span-2 -mt-1 text-faint-foreground text-small">{t("row.metresHint")}</p>
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
        <label className={check}>
          <input
            type="checkbox"
            checked={carAllowed}
            className="size-4 shrink-0 accent-primary"
            onChange={(e) => setCarAllowed(e.target.checked)}
          />
          {t("row.carAllowed")}
        </label>
        {carAllowed && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="row-slots">{t("row.carSlots")}</Label>
            <Input
              id="row-slots"
              value={carSlots}
              inputMode="numeric"
              maxLength={3}
              autoComplete="off"
              className="tabular"
              onChange={(e) => setCarSlots(e.target.value)}
              {...invalid("row-slots")}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <label className={check}>
          <input
            type="checkbox"
            checked={power}
            className="size-4 shrink-0 accent-primary"
            onChange={(e) => setPower(e.target.checked)}
          />
          {t("row.power")}
        </label>
        <label className={check}>
          <input
            type="checkbox"
            checked={water}
            className="size-4 shrink-0 accent-primary"
            onChange={(e) => setWater(e.target.checked)}
          />
          {t("row.water")}
        </label>
      </div>
      {error && (
        <p id="row-error" role="alert" className="text-small text-status-critical">
          {error.text}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
          {t(row ? "row.submitEdit" : "row.submitAdd")}
        </Button>
      </div>
    </form>
  );
}
