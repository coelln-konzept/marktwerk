"use client";

import { formatMetres, nextRowLabel, parseMetresToCm, sameText } from "@marktwerk/core";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type RefObject, useRef, useState, useTransition } from "react";
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

/** A zone with its rows in order (for the next label, the last size and the duplicate check). */
export type ZoneRef = {
  id: string;
  name: string;
  rows?: { id?: string; label: string; lengthCm: number; depthCm: number }[];
};

const FIELD_OF_ERROR: Record<string, string> = {
  invalid_row_label: "row-label",
  invalid_length: "row-length",
  invalid_depth: "row-depth",
  invalid_car_slots: "row-slots",
};

/**
 * Add a row to a zone (`row` unset) or edit one. Seven small fields: a modal. When it closes, the focus
 * goes back to `returnFocus` (the button that opened it) instead of falling to the top of the page.
 */
export function RowDialog({
  open,
  onOpenChange,
  zone,
  row,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zone: ZoneRef;
  row?: RowValues;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("venues.manage");
  const change = (next: boolean) => {
    onOpenChange(next);
    if (!next && returnFocus)
      // After the dialog's own focus handling has run.
      window.setTimeout(() => returnFocus.current?.focus(), 0);
  };
  return (
    <Modal
      open={open}
      onOpenChange={change}
      title={row ? t("row.editTitle") : t("row.addTitle", { zone: zone.name })}
      description={row ? zone.name : undefined}
      closeLabel={t("close")}
    >
      <RowForm zone={zone} row={row} onClose={() => change(false)} />
    </Modal>
  );
}

/**
 * Mounted fresh each time the dialog opens, so the fields always start from the current row. A new row
 * starts with the next label ("A3" → "A4") and the last row's length and depth (UX-056); "Hinzufügen
 * und weitere" saves and starts the next row in the same dialog.
 */
function RowForm({ zone, row, onClose }: { zone: ZoneRef; row?: RowValues; onClose: () => void }) {
  const t = useTranslations("venues.manage");
  const locale = useLocale();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const zoneRows = zone.rows ?? [];
  const last = zoneRows.at(-1);
  // Rows added in this dialog, until the page data has them.
  const [added, setAdded] = useState<string[]>([]);
  const labels = [...zoneRows.map((r) => r.label), ...added];
  const [label, setLabel] = useState(row?.label ?? nextRowLabel(labels));
  const [length, setLength] = useState(
    row ? formatMetres(row.lengthCm, locale) : last ? formatMetres(last.lengthCm, locale) : "",
  );
  const [depth, setDepth] = useState(
    row ? formatMetres(row.depthCm, locale) : last ? formatMetres(last.depthCm, locale) : "",
  );
  const [carAllowed, setCarAllowed] = useState(row?.carAllowed ?? false);
  const [carSlots, setCarSlots] = useState(String(row?.carSlots ?? 0));
  const [power, setPower] = useState(row?.power ?? false);
  const [water, setWater] = useState(row?.water ?? false);
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const labelInput = useRef<HTMLInputElement>(null);

  // Same label twice in one zone (UX-028): a hint, not a block ("A1" may exist on purpose).
  const otherLabels = [
    ...zoneRows.filter((r) => !row || r.id !== row.id).map((r) => r.label),
    ...added,
  ];
  const duplicate = label.trim() !== "" && otherLabels.some((l) => sameText(l, label));

  function fail(code: string) {
    const field = FIELD_OF_ERROR[code] ?? null;
    setError({ field, text: errorText(code) });
    if (field) document.getElementById(field)?.focus();
  }

  function submit(more: boolean) {
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
      const result = row
        ? await updateRowAction(row.id, input)
        : await addRowAction(zone.id, input);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      if (row && "changed" in result.data && !result.data.changed) {
        onClose();
        showToast({ message: t("row.unchanged") });
        return;
      }
      const saved = label.trim();
      showToast({ message: t(row ? "row.saved" : "row.added", { row: saved }) });
      if (!more) {
        onClose();
        return;
      }
      // Next row: the next label, everything else as just typed; the focus goes to the label.
      setAdded((prev) => [...prev, saved]);
      setLastAdded(saved);
      setLabel(nextRowLabel([...labels, saved]));
      labelInput.current?.focus();
      labelInput.current?.select();
    });
  }

  const invalid = (field: string) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": `${field}-error` }
      : {};
  const fieldError = (field: string) =>
    error?.field === field ? (
      <p id={`${field}-error`} className="text-small text-status-critical">
        {error.text}
      </p>
    ) : null;
  const check = "flex min-h-8 items-center gap-2 text-small";

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        submit(submitter?.getAttribute("value") === "more");
      }}
    >
      <p role="status" className="flex items-center gap-1.5 text-small text-status-ok empty:hidden">
        {lastAdded && (
          <>
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            {t("row.addedNext", { row: lastAdded })}
          </>
        )}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="row-label">{t("row.label")}</Label>
        <Input
          ref={labelInput}
          id="row-label"
          value={label}
          maxLength={40}
          required
          autoComplete="off"
          placeholder={t("row.labelHint")}
          onChange={(e) => setLabel(e.target.value)}
          {...invalid("row-label")}
          {...(duplicate && error?.field !== "row-label"
            ? { "aria-describedby": "row-label-duplicate" }
            : {})}
        />
        {fieldError("row-label")}
        {duplicate && (
          <p
            id="row-label-duplicate"
            className="flex items-center gap-1.5 text-small text-status-warn"
          >
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {t("row.duplicateLabel", { row: label.trim() })}
          </p>
        )}
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
            {fieldError(id)}
          </div>
        ))}
        <p className="col-span-2 -mt-1 text-faint-foreground text-small">
          {!row && last ? t("row.metresHintPrefilled") : t("row.metresHint")}
        </p>
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
            {fieldError("row-slots")}
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
      {error && error.field === null && (
        <p role="alert" className="text-small text-status-critical">
          {error.text}
        </p>
      )}
      {/* "Hinzufügen" comes first in the DOM, so Enter adds one row and closes as before; it is shown last. */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="submit"
          value="one"
          variant="default"
          aria-busy={pending}
          disabled={pending}
          className="order-3"
        >
          {t(row ? "row.submitEdit" : "row.submitAdd")}
        </Button>
        <Button disabled={pending} onClick={onClose} className="order-1">
          {t("cancel")}
        </Button>
        {!row && (
          <Button type="submit" value="more" disabled={pending} className="order-2">
            {t("row.submitAddMore")}
          </Button>
        )}
      </div>
    </form>
  );
}
