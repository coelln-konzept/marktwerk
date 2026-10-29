"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { savePermitAction } from "@/app/(app)/genehmigungen/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PermitPatch } from "@/server/services/permits";

export type PermitFormValues = {
  title: string;
  referenceNo: string;
  authorityContactId: string;
  responsibleStaffMemberId: string;
  applyBy: string;
  appliedAt: string;
  expectedDecisionOn: string;
  grantedAt: string;
  validFrom: string;
  validUntil: string;
  stickers: string;
  conditions: string;
  notes: string;
};

/** Field error code → the field to mark. */
const ERROR_FIELD: Record<string, keyof PermitFormValues> = {
  invalid_title: "title",
  invalid_contact: "authorityContactId",
  invalid_staff: "responsibleStaffMemberId",
  invalid_period: "validUntil",
  invalid_conditions: "conditions",
  invalid_deliverables: "stickers",
  invalid_text: "notes",
};

/**
 * "Bearbeiten" in the permit drawer: reference number, dates, validity, stickers received, conditions,
 * notes and who is responsible. The drawer is a record surface, so the form is inline (not a modal).
 * Saving shows an undo toast that writes the previous values back.
 */
export function PermitEditForm({
  permitId,
  initial,
  deliverables,
  contacts,
  staff,
}: {
  permitId: string;
  initial: PermitFormValues;
  /** The other received deliverables, kept untouched when the sticker count changes. */
  deliverables: Record<string, number | undefined>;
  contacts: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const t = useTranslations("permitDrawer");
  const { showToast } = useShell();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<PermitFormValues>(initial);
  const [error, setError] = useState<{ field: keyof PermitFormValues | null; code: string } | null>(
    null,
  );
  const fid = (name: string) => `${uid}-${name}`;
  const set = (name: keyof PermitFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));
  const invalid = (field: keyof PermitFormValues) =>
    error?.field === field ? { "aria-invalid": true as const } : {};
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function toPatch(v: PermitFormValues): PermitPatch {
    const stickers = v.stickers.trim() === "" ? 0 : Number(v.stickers);
    return {
      title: v.title,
      referenceNo: v.referenceNo.trim() === "" ? null : v.referenceNo,
      authorityContactId: v.authorityContactId === "" ? null : v.authorityContactId,
      responsibleStaffMemberId:
        v.responsibleStaffMemberId === "" ? null : v.responsibleStaffMemberId,
      applyBy: v.applyBy === "" ? null : v.applyBy,
      appliedAt: v.appliedAt === "" ? null : v.appliedAt,
      expectedDecisionOn: v.expectedDecisionOn === "" ? null : v.expectedDecisionOn,
      grantedAt: v.grantedAt === "" ? null : v.grantedAt,
      validFrom: v.validFrom === "" ? null : v.validFrom,
      validUntil: v.validUntil === "" ? null : v.validUntil,
      deliverablesReceived: { ...deliverables, stickers },
      conditions: v.conditions.split("\n"),
      notes: v.notes.trim() === "" ? null : v.notes,
    };
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await savePermitAction(permitId, toPatch(values));
      if (!result.ok)
        return setError({ field: ERROR_FIELD[result.error] ?? null, code: result.error });
      setOpen(false);
      if (!result.data.changed) return showToast({ message: t("unchanged") });
      const { previous } = result.data;
      showToast({
        message: t("saved"),
        actionLabel: t("undo"),
        onAction: async () => {
          await savePermitAction(permitId, previous, true);
          showToast({ message: t("savedUndone") });
        },
      });
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        onClick={() => {
          setValues(initial);
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil aria-hidden />
        {t("edit")}
      </Button>
    );
  }

  const text = (name: keyof PermitFormValues, label: string, type = "text", optional = true) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fid(name)} optional={optional}>
        {label}
      </Label>
      <Input
        id={fid(name)}
        type={type}
        value={values[name]}
        onChange={(e) => set(name)(e.target.value)}
        className={type === "date" ? "tabular" : undefined}
        {...invalid(name)}
      />
    </div>
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-3 rounded-lg border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {text("title", t("form.title"), "text", false)}
      <div className="grid grid-cols-2 gap-3">
        {text("referenceNo", t("form.reference"))}
        {text("stickers", t("form.stickers"))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid("authorityContactId")} optional>
            {t("form.authority")}
          </Label>
          <select
            id={fid("authorityContactId")}
            value={values.authorityContactId}
            onChange={(e) => set("authorityContactId")(e.target.value)}
            className={SELECT_CLASS}
            {...invalid("authorityContactId")}
          >
            <option value="">{t("form.noAuthority")}</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid("responsibleStaffMemberId")} optional>
            {t("form.responsible")}
          </Label>
          <select
            id={fid("responsibleStaffMemberId")}
            value={values.responsibleStaffMemberId}
            onChange={(e) => set("responsibleStaffMemberId")(e.target.value)}
            className={SELECT_CLASS}
            {...invalid("responsibleStaffMemberId")}
          >
            <option value="">{t("form.noResponsible")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {text("applyBy", t("form.applyBy"), "date")}
        {text("appliedAt", t("form.appliedAt"), "date")}
        {text("expectedDecisionOn", t("form.decision"), "date")}
        {text("grantedAt", t("form.grantedAt"), "date")}
        {text("validFrom", t("form.validFrom"), "date")}
        {text("validUntil", t("form.validUntil"), "date")}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fid("conditions")} optional>
          {t("form.conditions")}
        </Label>
        <textarea
          id={fid("conditions")}
          rows={4}
          value={values.conditions}
          onChange={(e) => set("conditions")(e.target.value)}
          className={TEXTAREA_CLASS}
          {...invalid("conditions")}
        />
        <p className="text-muted-foreground text-tiny">{t("conditionsHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fid("notes")} optional>
          {t("form.notes")}
        </Label>
        <textarea
          id={fid("notes")}
          rows={3}
          maxLength={4000}
          value={values.notes}
          onChange={(e) => set("notes")(e.target.value)}
          className={TEXTAREA_CLASS}
          {...invalid("notes")}
        />
      </div>
      {error && (
        <p role="alert" className="text-small text-status-critical">
          {errorText(error.code)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={() => setOpen(false)}>
          {t("form.cancel")}
        </Button>
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
          {t("form.save")}
        </Button>
      </div>
    </form>
  );
}
