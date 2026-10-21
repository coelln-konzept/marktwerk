import { FileWarning, Receipt, SearchX } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUpload } from "@/components/documents/upload";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { param } from "@/lib/url";
import type { Actor } from "@/server/actor";
import { type FinanceOptions, listExpenses } from "@/server/queries/finance";
import { ArchiveExpenseButton } from "./archive-expense-button";
import { ExpenseDialog } from "./expense-dialog";

const CATEGORIES = [
  "location",
  "permit",
  "water_power",
  "equipment_rental",
  "staff_external",
  "security",
  "cleaning_waste",
  "toilets",
  "marketing",
  "gema",
  "transport_fuel",
  "vehicle",
  "insurance",
  "tax_fees",
  "other",
] as const;

/** "Ausgaben": what was paid right away (fuel, small purchases), newest first, with receipts and quick entry. */
export async function ExpensesView({
  actor,
  sp,
  options,
  today,
  canWrite,
}: {
  actor: Actor;
  sp: Record<string, string | string[] | undefined>;
  options: FinanceOptions;
  today: string;
  canWrite: boolean;
}) {
  const t = await getTranslations("finance.expenses");
  const tCategories = await getTranslations("finance.categories");
  const tMethods = await getTranslations("finance.methods");
  const locale = await getLocale();
  const month =
    param(sp.monat) && /^\d{4}-\d{2}$/.test(param(sp.monat) as string)
      ? param(sp.monat)
      : undefined;
  const category = param(sp.kategorie);
  const eventId = param(sp.veranstaltung);
  const rows = await listExpenses(actor, { month, category, eventId });
  const filtered = Boolean(month || category || eventId);
  const total = rows.reduce((s, r) => s + r.amountCents, 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" action="/finanzen" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="ansicht" value="ausgaben" />
          <label className="sr-only" htmlFor="x-monat">
            {t("month")}
          </label>
          <input
            id="x-monat"
            name="monat"
            type="month"
            defaultValue={month ?? ""}
            className="min-h-(--control-h) rounded-lg border border-input bg-card px-3"
          />
          <label className="sr-only" htmlFor="x-kategorie">
            {t("category")}
          </label>
          <AutoSubmitSelect id="x-kategorie" name="kategorie" defaultValue={category ?? ""}>
            <option value="">{t("anyCategory")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tCategories(c)}
              </option>
            ))}
          </AutoSubmitSelect>
          <label className="sr-only" htmlFor="x-veranstaltung">
            {t("event")}
          </label>
          <AutoSubmitSelect id="x-veranstaltung" name="veranstaltung" defaultValue={eventId ?? ""}>
            <option value="">{t("anyEvent")}</option>
            {options.events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {formatDate(ev.startsOn, locale)} · {ev.name}
              </option>
            ))}
          </AutoSubmitSelect>
          <button
            type="submit"
            className="min-h-8 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
          >
            {t("apply")}
          </button>
        </form>
        {canWrite && <ExpenseDialog options={options} today={today} />}
      </div>

      <Panel className="overflow-hidden">
        {rows.length === 0 && !filtered ? (
          <EmptyState icon={Receipt} title={t("empty")} hint={t("emptyHint")} />
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("emptyFiltered")}>
            <Link
              href={"/finanzen?ansicht=ausgaben" as never}
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {t("resetFilters")}
            </Link>
          </EmptyState>
        ) : (
          <Table>
            <caption className="sr-only">{t("caption")}</caption>
            <THead>
              <tr>
                <TH>{t("cols.date")}</TH>
                <TH>{t("cols.description")}</TH>
                <TH>{t("cols.category")}</TH>
                <TH>{t("cols.event")}</TH>
                <TH className="text-right">{t("cols.amount")}</TH>
                <TH>{t("cols.receipt")}</TH>
                {canWrite && (
                  <TH>
                    <span className="sr-only">{t("cols.actions")}</span>
                  </TH>
                )}
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="tabular whitespace-nowrap">{formatDate(r.spentOn, locale)}</TD>
                  <TD className="max-w-64">
                    <span className="block truncate font-medium">{r.description}</span>
                    <span className="block truncate text-muted-foreground text-small">
                      {[
                        r.merchant,
                        r.vehicleName,
                        r.method ? tMethods(r.method as never) : null,
                        r.paidByName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </TD>
                  <TD>{tCategories(r.category)}</TD>
                  <TD className="max-w-48 truncate">
                    {r.eventId ? (
                      <Link
                        href={`/veranstaltungen/${r.eventId}/geld` as never}
                        className="text-accent-soft-foreground hover:underline"
                      >
                        {r.eventName}
                      </Link>
                    ) : (
                      <span className="text-faint-foreground">{t("none")}</span>
                    )}
                  </TD>
                  <TD className="tabular whitespace-nowrap text-right">
                    {formatMoney(r.amountCents, locale)}
                  </TD>
                  <TD>
                    <DocumentList documents={r.documents} canWrite={canWrite} compact />
                    {r.receiptCount === 0 && (
                      <span className="flex flex-col items-start gap-1.5">
                        <StatusBadge tone="warn" icon={FileWarning}>
                          {t("receiptMissing")}
                        </StatusBadge>
                        {canWrite && (
                          <DocumentUpload compact link={{ expenseId: r.id }} kind="receipt" />
                        )}
                      </span>
                    )}
                  </TD>
                  {canWrite && (
                    <TD className="w-12">
                      <ArchiveExpenseButton id={r.id} description={r.description} />
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      {rows.length > 0 && (
        <p className="tabular text-muted-foreground text-small">
          {t("sum", { count: rows.length, amount: formatMoney(total, locale) })}
        </p>
      )}
    </>
  );
}
