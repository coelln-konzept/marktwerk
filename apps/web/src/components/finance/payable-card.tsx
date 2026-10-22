import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateShort, formatMoney } from "@/lib/format";
import { type PayableRow, payableHref } from "@/server/queries/finance";
import { RateTable, type StaffOption } from "./rate-table";
import { CriticalBadge, FinanceStatusBadge } from "./status";

/** Where a payable belongs, as one line: "Flohmarkt Altstadt", "Messeplatz · Saison 2027", "Transporter 1". */
export function payableTarget(p: PayableRow, company: string): string {
  if (p.scope === "event") return p.eventName ?? "";
  if (p.scope === "venue_season") return `${p.venueName ?? ""} · ${p.season ?? ""}`;
  if (p.scope === "vehicle") return p.vehicleName ?? "";
  return company;
}

/**
 * One payable in the list (wireframe W10): a row with the next rate, expandable to the instalment plan.
 * Overdue payables start open. A native `<details>`, so it works without script and by keyboard.
 */
export async function PayableCard({
  payable: p,
  today,
  staff,
  defaultStaffId,
  canWrite,
}: {
  payable: PayableRow;
  today: string;
  staff: StaffOption[];
  defaultStaffId: string | null;
  canWrite: boolean;
}) {
  const t = await getTranslations("finance.card");
  const tCategories = await getTranslations("finance.categories");
  const tScopes = await getTranslations("finance.scopes");
  const locale = await getLocale();
  const target = payableTarget(p, t("company"));
  const next = p.next;
  return (
    <details
      id={`posten-${p.id}`}
      open={p.status === "overdue"}
      className="group/card border-border-subtle border-b last:border-b-0"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 outline-none hover:bg-hover focus-visible:bg-hover [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/card:rotate-90"
        />
        <span className="flex min-w-0 flex-1 basis-64 flex-col">
          <Link
            href={payableHref(p.id) as never}
            className="truncate font-semibold hover:underline"
          >
            {p.title}
          </Link>
          <span className="truncate text-muted-foreground text-small">
            {[p.counterpartyName, tCategories(p.category), `${tScopes(p.scope)}: ${target}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {p.critical && <CriticalBadge />}
          <FinanceStatusBadge status={p.status} />
        </span>
        <span className="tabular flex flex-col text-right text-small sm:w-44">
          <span className="font-medium">
            {next
              ? t("next", {
                  amount: formatMoney(next.openCents, locale),
                  date: formatDateShort(next.dueOn, locale),
                })
              : t("nothingOpen")}
          </span>
          <span className="text-muted-foreground text-tiny">
            {t("progress", {
              paid: formatMoney(p.paidCents, locale),
              total: formatMoney(p.totalGrossCents, locale),
            })}
          </span>
        </span>
      </summary>
      <div className="border-border-subtle border-t bg-surface-2 pb-2">
        <RateTable
          payableTitle={p.title}
          rates={p.installments}
          today={today}
          staff={staff}
          defaultStaffId={defaultStaffId}
          canWrite={canWrite}
        />
      </div>
    </details>
  );
}
