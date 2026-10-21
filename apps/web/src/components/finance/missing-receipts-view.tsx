import { Archive, CheckCircle2, Download, FileText } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DocumentUpload } from "@/components/documents/upload";
import { buttonVariants } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { param } from "@/lib/url";
import type { Actor } from "@/server/actor";
import { listMissingReceipts, payableHref } from "@/server/queries/finance";
import { collectReceiptMonth, MONTH_PATTERN } from "@/server/services/receipt-bundle";

/** Previous calendar month of `today` as `YYYY-MM`. */
function previousMonth(today: string): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * "Belege fehlen": paid money without a receipt, with the upload right on the row, and the monthly bundle
 * for the tax advisor (zip with receipts + CSV list; the CSV alone if a zip is not wanted).
 */
export async function MissingReceiptsView({
  actor,
  sp,
  today,
  canWrite,
}: {
  actor: Actor;
  sp: Record<string, string | string[] | undefined>;
  today: string;
  canWrite: boolean;
}) {
  const t = await getTranslations("finance.missing");
  const locale = await getLocale();
  const monthParam = param(sp.monat);
  const month = monthParam && MONTH_PATTERN.test(monthParam) ? monthParam : previousMonth(today);
  const [missing, items] = await Promise.all([
    listMissingReceipts(actor),
    collectReceiptMonth(actor, month),
  ]);
  const withReceipt = items.filter((i) => i.receipts.length > 0).length;

  return (
    <>
      <Panel aria-labelledby="bundle-title">
        <PanelHeader>
          <PanelTitle>
            <span id="bundle-title">{t("bundle.title")}</span>
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          <p className="max-w-[70ch] text-muted-foreground text-small">{t("bundle.hint")}</p>
          <form method="get" action="/finanzen" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="ansicht" value="belege" />
            <div className="flex flex-col gap-1.5">
              <label className="font-medium text-small" htmlFor="b-monat">
                {t("bundle.month")}
              </label>
              <input
                id="b-monat"
                name="monat"
                type="month"
                defaultValue={month}
                className="min-h-(--control-h) rounded-lg border border-input bg-card px-3"
              />
            </div>
            <button
              type="submit"
              className="min-h-8 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {t("bundle.show")}
            </button>
          </form>
          <p className="tabular text-small">
            {t("bundle.summary", {
              payments: items.length,
              withReceipt,
              missing: items.length - withReceipt,
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/finanzen/belege/${month}`}
              className={buttonVariants({ variant: "default" })}
              download
            >
              <Archive aria-hidden />
              {t("bundle.zip")}
            </a>
            <a
              href={`/api/finanzen/belege/${month}?format=csv`}
              className={buttonVariants({})}
              download
            >
              <Download aria-hidden />
              {t("bundle.csv")}
            </a>
          </div>
        </PanelBody>
      </Panel>

      <Panel className="overflow-hidden">
        {missing.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={t("empty")} hint={t("emptyHint")} />
        ) : (
          <Table>
            <caption className="sr-only">{t("caption")}</caption>
            <THead>
              <tr>
                <TH>{t("cols.date")}</TH>
                <TH>{t("cols.what")}</TH>
                <TH>{t("cols.event")}</TH>
                <TH className="text-right">{t("cols.amount")}</TH>
                <TH>{t("cols.receipt")}</TH>
              </tr>
            </THead>
            <tbody>
              {missing.map((m) => (
                <TR key={`${m.kind}-${m.id}`}>
                  <TD className="tabular whitespace-nowrap">{formatDate(m.date, locale)}</TD>
                  <TD className="max-w-72">
                    {m.payableId ? (
                      <Link
                        href={`${payableHref(m.payableId)}#rate-${m.id}` as never}
                        className="block truncate font-medium text-accent-soft-foreground hover:underline"
                      >
                        {m.title}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium">{m.title}</span>
                    )}
                    <span className="block truncate text-muted-foreground text-small">
                      {[
                        m.kind === "installment" ? t("kindInstallment") : t("kindExpense"),
                        m.counterpartyName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </TD>
                  <TD className="max-w-48 truncate">
                    {m.eventName ?? <span className="text-faint-foreground">{t("none")}</span>}
                  </TD>
                  <TD className="tabular whitespace-nowrap text-right">
                    {formatMoney(m.amountCents, locale)}
                  </TD>
                  <TD>
                    {canWrite ? (
                      <DocumentUpload
                        compact
                        link={
                          m.kind === "installment" ? { installmentId: m.id } : { expenseId: m.id }
                        }
                        kind="receipt"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <FileText aria-hidden className="size-3.5" />
                        {t("missing")}
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
