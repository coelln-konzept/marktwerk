"use client";

import { EMPLOYMENT_TYPES, type EmploymentType, isIsoDate, parseEuroCents } from "@marktwerk/core";
import { Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveContractAction } from "@/app/(app)/team/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatMoney } from "@/lib/format";
import { SELECT_CLASS } from "../settings/select-class";

export type ContractView = {
  id: string;
  type: EmploymentType;
  hourlyRateCents: number | null;
  contractedHoursPerWeek: number | null;
  fixedMonthlyPayCents: number | null;
  workingTimeAccount: boolean;
  otherMinijobDeclared: boolean;
  validFrom: string;
  validUntil: string | null;
};

const euro = (cents: number | null, locale: string) =>
  cents === null ? "" : (cents / 100).toFixed(2).replace(".", locale === "en" ? "." : ",");

/** Decimal as typed ("12", "12,5", "12.5") → number; null when it isn't one. */
function parseDecimal(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

/**
 * "Vertrag bearbeiten" / "Neuer Vertrag": type, dated hourly rate, contracted hours per week, fixed
 * pay and working-time account, declared other Minijob, validity. Eight fields in a modal; a new
 * contract can end the open one the day before.
 */
export function ContractButton({
  staffMemberId,
  contract,
  openEnded,
  today,
  minimumWageCents,
  variant = "ghost",
}: {
  staffMemberId: string;
  /** The contract to edit; null starts a new one. */
  contract: ContractView | null;
  /** The person has a contract without end date (offered to be ended by a new one). */
  openEnded: ContractView | null;
  today: string;
  minimumWageCents: number | null;
  variant?: "ghost" | "outline";
}) {
  const t = useTranslations("hours.contract");
  const tErr = useTranslations("hours.contract.errors");
  const locale = useLocale();
  const { showToast } = useShell();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ code: string; detail?: string } | null>(null);

  const base = contract ?? openEnded;
  const [type, setType] = useState<EmploymentType>("minijob");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [rate, setRate] = useState("");
  const [hours, setHours] = useState("");
  const [fixed, setFixed] = useState("");
  const [account, setAccount] = useState(false);
  const [other, setOther] = useState(false);
  const [endPrevious, setEndPrevious] = useState(true);

  function openDialog() {
    setType(base?.type ?? "minijob");
    setValidFrom(contract ? contract.validFrom : today);
    setValidUntil(contract?.validUntil ?? "");
    setRate(euro(base?.hourlyRateCents ?? null, locale));
    setHours(
      base?.contractedHoursPerWeek != null
        ? String(base.contractedHoursPerWeek).replace(".", locale === "en" ? "." : ",")
        : "",
    );
    setFixed(euro(base?.fixedMonthlyPayCents ?? null, locale));
    setAccount(base?.workingTimeAccount ?? false);
    setOther(base?.otherMinijobDeclared ?? false);
    setEndPrevious(true);
    setError(null);
    setOpen(true);
  }

  const errorText = (e: { code: string; detail?: string }) => {
    if (e.code === "overlap") {
      const date = e.detail && isIsoDate(e.detail) ? formatDate(e.detail, locale) : "";
      return tErr("overlap", { date });
    }
    if (e.code === "below_minimum_wage")
      return tErr("below_minimum_wage", { amount: formatMoney(Number(e.detail ?? 0), locale) });
    return tErr.has(e.code as never) ? tErr(e.code as never) : tErr("generic");
  };

  function submit() {
    const hourlyRateCents = rate.trim() === "" ? null : parseEuroCents(rate);
    const fixedMonthlyPayCents = fixed.trim() === "" ? null : parseEuroCents(fixed);
    const contractedHoursPerWeek = hours.trim() === "" ? null : parseDecimal(hours);
    if (
      (rate.trim() !== "" && hourlyRateCents === null) ||
      (fixed.trim() !== "" && fixedMonthlyPayCents === null) ||
      (hours.trim() !== "" && contractedHoursPerWeek === null)
    )
      return setError({ code: "invalid_amount" });
    if (!isIsoDate(validFrom)) return setError({ code: "invalid_dates" });
    setError(null);
    startTransition(async () => {
      const result = await saveContractAction(
        staffMemberId,
        {
          type,
          hourlyRateCents,
          contractedHoursPerWeek,
          fixedMonthlyPayCents,
          workingTimeAccount: account,
          otherMinijobDeclared: other,
          validFrom,
          validUntil: validUntil === "" ? null : validUntil,
        },
        contract?.id,
        !contract && endPrevious,
      );
      if (!result.ok) {
        setError({ code: result.error, detail: result.detail });
        return;
      }
      setOpen(false);
      showToast({ message: contract ? t("saved") : t("created") });
    });
  }

  const bad = (...codes: string[]) =>
    error && codes.includes(error.code) ? { "aria-invalid": true as const } : {};
  const showEndPrevious =
    !contract && openEnded !== null && validFrom !== "" && openEnded.validFrom < validFrom;

  return (
    <>
      <Button size="sm" variant={variant} onClick={openDialog}>
        {contract ? <Pencil aria-hidden /> : <Plus aria-hidden />}
        {contract ? t("edit") : t("new")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={contract ? t("editTitle") : t("newTitle")}
        description={t("description")}
        closeLabel={t("cancel")}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="contract-type">{t("type")}</Label>
              <select
                id="contract-type"
                value={type}
                onChange={(e) => setType(e.target.value as EmploymentType)}
                className={SELECT_CLASS}
                {...bad("invalid_type")}
              >
                {EMPLOYMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`types.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contract-from">{t("validFrom")}</Label>
              <Input
                id="contract-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="tabular"
                {...bad("invalid_dates", "overlap", "period_locked")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contract-until">{t("validUntil")}</Label>
              <Input
                id="contract-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="tabular"
                {...bad("invalid_dates", "overlap")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contract-rate">{t("rate")}</Label>
              <div className="relative">
                <Input
                  id="contract-rate"
                  inputMode="decimal"
                  autoComplete="off"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="tabular pr-12"
                  {...bad("rate_required", "below_minimum_wage", "invalid_amount")}
                />
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                  {t("perHour")}
                </span>
              </div>
              {minimumWageCents !== null && (
                <span className="text-faint-foreground text-tiny">
                  {t("minimumWage", { amount: formatMoney(minimumWageCents, locale) })}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contract-hours">{t("hoursPerWeek")}</Label>
              <div className="relative">
                <Input
                  id="contract-hours"
                  inputMode="decimal"
                  autoComplete="off"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="tabular pr-12"
                  {...bad("hours_required", "invalid_amount")}
                />
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                  {t("perWeek")}
                </span>
              </div>
              <span className="text-faint-foreground text-tiny">{t("hoursHint")}</span>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="contract-fixed">{t("fixedPay")}</Label>
              <div className="relative">
                <Input
                  id="contract-fixed"
                  inputMode="decimal"
                  autoComplete="off"
                  value={fixed}
                  onChange={(e) => setFixed(e.target.value)}
                  className="tabular pr-12"
                  {...bad("fixed_pay_required", "invalid_amount")}
                />
                <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                  {t("perMonth")}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-small">
              <input
                type="checkbox"
                checked={account}
                onChange={(e) => setAccount(e.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                {t("workingTimeAccount")}
                <span className="block text-faint-foreground text-tiny">
                  {t("workingTimeAccountHint")}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-small">
              <input
                type="checkbox"
                checked={other}
                onChange={(e) => setOther(e.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                {t("otherMinijob")}
                <span className="block text-faint-foreground text-tiny">
                  {t("otherMinijobHint")}
                </span>
              </span>
            </label>
            {showEndPrevious && openEnded && (
              <label className="flex items-start gap-2 text-small">
                <input
                  type="checkbox"
                  checked={endPrevious}
                  onChange={(e) => setEndPrevious(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t("endPrevious", { date: formatDate(openEnded.validFrom, locale) })}</span>
              </label>
            )}
          </div>
          {error && (
            <p role="alert" className="m-0 text-small text-status-critical">
              {errorText(error)}
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
