import { FileWarning, Paperclip } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { DocumentUpload } from "@/components/documents/upload";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateShort, formatMoney } from "@/lib/format";
import type { DocumentRow, InstallmentRow } from "@/server/queries/finance";
import { RateActions } from "./rate-actions";
import { FinanceStatusBadge } from "./status";

export type StaffOption = { id: string; name: string };

/**
 * The instalments of one payable: rate, due date, amount, status, what was paid, receipt, actions.
 * Money that went out without a receipt says "Beleg fehlt" and offers the upload right there.
 */
export async function RateTable({
  payableTitle,
  rates,
  rateDocuments,
  today,
  staff,
  defaultStaffId,
  canWrite,
  documentList,
}: {
  payableTitle: string;
  rates: InstallmentRow[];
  rateDocuments?: Record<string, DocumentRow[]>;
  today: string;
  staff: StaffOption[];
  defaultStaffId: string | null;
  canWrite: boolean;
  /** Renders the documents of a rate (detail page); the list view only shows a count. */
  documentList?: (documents: DocumentRow[]) => React.ReactNode;
}) {
  const t = await getTranslations("finance.rate");
  const tMethods = await getTranslations("finance.methods");
  const locale = await getLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{t("caption", { title: payableTitle })}</caption>
        <thead>
          <tr className="text-muted-foreground text-tiny">
            <th scope="col" className="px-3 py-1.5 font-semibold">
              {t("cols.rate")}
            </th>
            <th scope="col" className="px-3 py-1.5 font-semibold">
              {t("cols.dueOn")}
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">
              {t("cols.amount")}
            </th>
            <th scope="col" className="px-3 py-1.5 font-semibold">
              {t("cols.status")}
            </th>
            <th scope="col" className="px-3 py-1.5 font-semibold">
              {t("cols.paid")}
            </th>
            <th scope="col" className="px-3 py-1.5 font-semibold">
              {t("cols.receipt")}
            </th>
            {canWrite && (
              <th scope="col" className="px-3 py-1.5">
                <span className="sr-only">{t("cols.actions")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rates.map((r) => {
            const position = `${r.sort}/${r.of}`;
            const paidMoney = (r.paidAmountCents ?? 0) > 0;
            const documents = rateDocuments?.[r.id] ?? [];
            return (
              <tr
                key={r.id}
                id={`rate-${r.id}`}
                className="border-border-subtle border-t align-top"
              >
                <td className="tabular px-3 py-2 font-medium">{t("position", { position })}</td>
                <td className="tabular whitespace-nowrap px-3 py-2">
                  {formatDateShort(r.dueOn, locale)}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                  {formatMoney(r.amountCents, locale)}
                  {r.state === "partially_paid" || (r.state === "overdue" && paidMoney) ? (
                    <span className="block text-muted-foreground text-tiny">
                      {t("openLeft", { amount: formatMoney(r.openCents, locale) })}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <FinanceStatusBadge status={r.state} />
                </td>
                <td className="px-3 py-2 text-small">
                  {paidMoney && r.paidOn ? (
                    <>
                      <span className="tabular">
                        {formatDate(r.paidOn, locale)} ·{" "}
                        {formatMoney(r.paidAmountCents ?? 0, locale)}
                      </span>
                      <span className="block text-muted-foreground text-tiny">
                        {[r.method ? tMethods(r.method as never) : null, r.paidByName, r.reference]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </>
                  ) : (
                    <span className="text-faint-foreground">{t("none")}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-small">
                  {documentList && documents.length > 0 ? (
                    documentList(documents)
                  ) : r.receiptCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Paperclip aria-hidden className="size-3.5" />
                      {t("receipts", { count: r.receiptCount })}
                    </span>
                  ) : null}
                  {r.receiptMissing && (
                    <span className="mt-1 flex flex-col items-start gap-1.5">
                      <StatusBadge tone="warn" icon={FileWarning}>
                        {t("receiptMissing")}
                      </StatusBadge>
                      {canWrite && (
                        <DocumentUpload compact link={{ installmentId: r.id }} kind="receipt" />
                      )}
                    </span>
                  )}
                  {paidMoney && !r.receiptMissing && r.receiptCount === 0 && (
                    <span className="text-muted-foreground">{t("onPayable")}</span>
                  )}
                  {canWrite && documentList && paidMoney && r.receiptCount > 0 && (
                    <DocumentUpload compact link={{ installmentId: r.id }} kind="receipt" />
                  )}
                </td>
                {canWrite && (
                  <td className="px-3 py-2">
                    <RateActions
                      rate={{
                        id: r.id,
                        position: t("position", { position }),
                        payableTitle,
                        openCents: r.openCents,
                      }}
                      status={r.status}
                      today={today}
                      staff={staff}
                      defaultStaffId={defaultStaffId}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
