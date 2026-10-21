"use client";

import { centsToInput, parseMoneyCents } from "@marktwerk/core";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setBudgetLineAction } from "@/app/(app)/veranstaltungen/[id]/geld/actions";
import { useShell } from "@/components/shell/shell-context";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SELECT_CLASS } from "./form-classes";

export type BudgetTableRow = {
  category: string;
  plannedCents: number;
  committedCents: number;
  actualCents: number;
  varianceCents: number | null;
  /** The plan has a stored line (so clearing it removes the line). */
  hasPlan: boolean;
};

/**
 * Costs by category: plan (editable inline) → committed (payables + expenses) → actual (paid), and the
 * difference plan − committed. Saving a plan cell shows an undo toast; clearing it removes the line.
 * Categories without data can be added from the select below the table.
 */
export function BudgetTable({
  eventId,
  rows,
  totals,
  categories,
  canWrite,
}: {
  eventId: string;
  rows: BudgetTableRow[];
  totals: {
    plannedCents: number;
    committedCents: number;
    actualCents: number;
    varianceCents: number | null;
  };
  /** All categories with their labels (for adding a plan line). */
  categories: { key: string; label: string }[];
  canWrite: boolean;
}) {
  const t = useTranslations("eventMoney.table");
  const tErrors = useTranslations("finance.errors");
  const locale = useLocale();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const [extra, setExtra] = useState<string[]>([]);
  const [error, setError] = useState<{ category: string; code: string } | null>(null);
  const labelOf = new Map(categories.map((c) => [c.key, c.label]));
  const shown = [
    ...rows,
    ...extra
      .filter((c) => !rows.some((r) => r.category === c))
      .map<BudgetTableRow>((category) => ({
        category,
        plannedCents: 0,
        committedCents: 0,
        actualCents: 0,
        varianceCents: null,
        hasPlan: false,
      })),
  ];
  const available = categories.filter((c) => !shown.some((r) => r.category === c.key));

  function save(row: BudgetTableRow, text: string) {
    const cleared = text.trim() === "";
    const cents = cleared ? null : parseMoneyCents(text);
    if (!cleared && cents === null) {
      setError({ category: row.category, code: "invalid_amount" });
      return;
    }
    if ((cents ?? null) === (row.hasPlan ? row.plannedCents : null)) {
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setBudgetLineAction(eventId, row.category, cents);
      if (!result.ok) {
        setError({ category: row.category, code: result.error });
        return;
      }
      const { previousCents } = result.data;
      showToast({
        message: t("saved", { category: labelOf.get(row.category) ?? row.category }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await setBudgetLineAction(eventId, row.category, previousCents);
          showToast({ message: undone.ok ? t("reverted") : tErrors("generic") });
        },
      });
    });
  }

  const varianceClass = (cents: number | null) =>
    cents === null
      ? "text-faint-foreground"
      : cents < 0
        ? "font-medium text-status-critical"
        : "text-foreground";

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="text-muted-foreground text-tiny">
              <th scope="col" className="px-3 py-1.5 font-semibold">
                {t("cols.category")}
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                {t("cols.plan")}
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                {t("cols.committed")}
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                {t("cols.actual")}
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                {t("cols.variance")}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.category} className="border-border-subtle border-t">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {labelOf.get(r.category) ?? r.category}
                </th>
                <td className="px-3 py-1.5 text-right">
                  {canWrite ? (
                    <div className="relative ml-auto w-36">
                      <Input
                        key={`${r.category}-${r.hasPlan ? r.plannedCents : "none"}`}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={t("planOf", {
                          category: labelOf.get(r.category) ?? r.category,
                        })}
                        defaultValue={
                          r.hasPlan ? centsToInput(r.plannedCents, locale !== "en") : ""
                        }
                        placeholder="–"
                        disabled={pending}
                        onBlur={(e) => save(r, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        className="tabular pr-8 text-right"
                        aria-invalid={error?.category === r.category ? true : undefined}
                      />
                      <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                        €
                      </span>
                    </div>
                  ) : r.hasPlan ? (
                    <span className="tabular">{formatMoney(r.plannedCents, locale)}</span>
                  ) : (
                    <span className="text-faint-foreground">–</span>
                  )}
                </td>
                <td className="tabular px-3 py-2 text-right">
                  {r.committedCents > 0 ? (
                    formatMoney(r.committedCents, locale)
                  ) : (
                    <span className="text-faint-foreground">–</span>
                  )}
                </td>
                <td className="tabular px-3 py-2 text-right">
                  {r.actualCents > 0 ? (
                    formatMoney(r.actualCents, locale)
                  ) : (
                    <span className="text-faint-foreground">–</span>
                  )}
                </td>
                <td className={cn("tabular px-3 py-2 text-right", varianceClass(r.varianceCents))}>
                  {r.varianceCents === null ? "–" : formatMoney(r.varianceCents, locale)}
                  {r.varianceCents !== null && r.varianceCents < 0 && (
                    <span className="sr-only"> {t("overBudget")}</span>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-small">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <th scope="row" className="px-3 py-2 text-left">
                  {t("total")}
                </th>
                <td className="tabular px-3 py-2 text-right">
                  {formatMoney(totals.plannedCents, locale)}
                </td>
                <td className="tabular px-3 py-2 text-right">
                  {formatMoney(totals.committedCents, locale)}
                </td>
                <td className="tabular px-3 py-2 text-right">
                  {formatMoney(totals.actualCents, locale)}
                </td>
                <td
                  className={cn(
                    "tabular px-3 py-2 text-right",
                    varianceClass(totals.varianceCents),
                  )}
                >
                  {totals.varianceCents === null ? "–" : formatMoney(totals.varianceCents, locale)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {error && (
        <p role="alert" className="text-small text-status-critical">
          {tErrors.has(error.code as never) ? tErrors(error.code as never) : tErrors("generic")}
        </p>
      )}
      {canWrite && available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-small" htmlFor="budget-add">
            {t("addCategory")}
          </label>
          <select
            id="budget-add"
            value=""
            onChange={(e) => e.target.value && setExtra([...extra, e.target.value])}
            className={cn(SELECT_CLASS, "w-auto min-w-52")}
          >
            <option value="">{t("pick")}</option>
            {available.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
