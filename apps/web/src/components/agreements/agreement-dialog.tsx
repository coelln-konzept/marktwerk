"use client";

import { isIsoDate } from "@marktwerk/core";
import { Pencil, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  addAgreement,
  removeAgreement,
  saveAgreement,
} from "@/app/(app)/orte/[id]/vereinbarungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import type { ContactOption } from "@/server/queries/agreements";
import type { AgreementInput } from "@/server/services/agreements";

const FIELD_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1";

type Existing = AgreementInput & { id: string };

/**
 * Create or edit a location agreement: counterparty, validity, fixed dates, terms. Five fields, so a
 * modal. Saving shows an undo toast (creating undoes by removing, editing by writing the old values back).
 */
export function AgreementDialog({
  venueId,
  contacts,
  agreement,
}: {
  venueId: string;
  contacts: ContactOption[];
  /** Omit to create a new agreement. */
  agreement?: Existing;
}) {
  const t = useTranslations("agreements");
  const locale = useLocale();
  const { showToast } = useShell();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [contactId, setContactId] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState<{ field: string; code: string } | null>(null);

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const fieldOf = (code: string) =>
    code === "invalid_contact"
      ? "contact"
      : code === "invalid_period"
        ? "until"
        : code === "invalid_terms"
          ? "terms"
          : code === "date_outside_period" || code === "too_many_dates"
            ? "dates"
            : "from";

  function openDialog() {
    setContactId(agreement?.counterpartyContactId ?? "");
    setValidFrom(agreement?.validFrom ?? "");
    setValidUntil(agreement?.validUntil ?? "");
    setDates(agreement?.fixedDates ?? []);
    setDateInput("");
    setTerms(agreement?.terms ?? "");
    setError(null);
    setOpen(true);
  }

  function addDate() {
    if (!isIsoDate(dateInput)) return;
    setDates((current) => [...new Set([...current, dateInput])].sort());
    setDateInput("");
  }

  function submit() {
    if (!isIsoDate(validFrom) || !isIsoDate(validUntil))
      return setError({ field: "from", code: "invalid_date" });
    // A date typed but not added yet still counts.
    const fixedDates = isIsoDate(dateInput) ? [...new Set([...dates, dateInput])].sort() : dates;
    const input: AgreementInput = {
      counterpartyContactId: contactId || null,
      validFrom,
      validUntil,
      fixedDates,
      terms: terms.trim() === "" ? null : terms,
    };
    setError(null);
    startTransition(async () => {
      if (!agreement) {
        const result = await addAgreement(venueId, input);
        if (!result.ok) return setError({ field: fieldOf(result.error), code: result.error });
        setOpen(false);
        const { id } = result.data;
        showToast({
          message: t("created"),
          actionLabel: t("undo"),
          onAction: async () => {
            await removeAgreement(id);
            showToast({ message: t("createdUndone") });
          },
        });
        return;
      }
      const result = await saveAgreement(agreement.id, input);
      if (!result.ok) return setError({ field: fieldOf(result.error), code: result.error });
      setOpen(false);
      if (!result.data.changed) return showToast({ message: t("unchanged") });
      const { previous } = result.data;
      showToast({
        message: t("saved"),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await saveAgreement(agreement.id, previous, true);
          showToast({ message: undone.ok ? t("reverted") : errorText(undone.error) });
        },
      });
    });
  }

  const invalid = (field: string) =>
    error?.field === field ? { "aria-invalid": true as const, "aria-describedby": errorId } : {};

  return (
    <>
      {agreement ? (
        <Button size="sm" onClick={openDialog}>
          <Pencil aria-hidden />
          {t("edit")}
        </Button>
      ) : (
        <Button onClick={openDialog}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      )}
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={agreement ? t("editTitle") : t("addTitle")}
        description={t("description")}
        closeLabel={t("cancel")}
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agreement-contact" optional>
              {t("counterparty")}
            </Label>
            <select
              id="agreement-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className={FIELD_CLASS}
              {...invalid("contact")}
            >
              <option value="">{t("noCounterparty")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agreement-from">{t("validFrom")}</Label>
              <Input
                id="agreement-from"
                type="date"
                required
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="tabular"
                {...invalid("from")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agreement-until">{t("validUntil")}</Label>
              <Input
                id="agreement-until"
                type="date"
                required
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="tabular"
                {...invalid("until")}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agreement-date" optional>
              {t("fixedDates")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="agreement-date"
                type="date"
                value={dateInput}
                min={validFrom || undefined}
                max={validUntil || undefined}
                onChange={(e) => setDateInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDate();
                  }
                }}
                className="tabular"
                {...invalid("dates")}
              />
              <Button onClick={addDate} disabled={!isIsoDate(dateInput)}>
                {t("addDate")}
              </Button>
            </div>
            {dates.length === 0 ? (
              <p className="text-muted-foreground text-small">{t("noDates")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {dates.map((d) => (
                  <li
                    key={d}
                    className="tabular inline-flex items-center gap-1 rounded-md bg-status-neutral-bg py-0.5 pr-0.5 pl-2 text-small"
                  >
                    {formatDate(d, locale)}
                    <button
                      type="button"
                      aria-label={t("removeDate", { date: formatDate(d, locale) })}
                      onClick={() => setDates((current) => current.filter((x) => x !== d))}
                      className="grid size-5 cursor-pointer place-items-center rounded hover:bg-hover"
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agreement-terms" optional>
              {t("terms")}
            </Label>
            <textarea
              id="agreement-terms"
              rows={3}
              maxLength={4000}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 aria-invalid:border-destructive"
              {...invalid("terms")}
            />
          </div>
          {error && (
            <p id={errorId} role="alert" className="text-small text-status-critical">
              {errorText(error.code)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
