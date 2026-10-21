import { can } from "@marktwerk/core";
import { CalendarClock, Plus, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { BudgetTable } from "@/components/finance/budget-table";
import { ExpenseDialog } from "@/components/finance/expense-dialog";
import { ArchiveIncomeButton, IncomeDialog } from "@/components/finance/income-controls";
import { FinanceStatusBadge } from "@/components/finance/status";
import { buttonVariants } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateShort, formatMoney, todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getEventMoney, listFinanceOptions, payableHref } from "@/server/queries/finance";
import { PAYABLE_CATEGORIES } from "@/server/services/payables";
import { requirePermission } from "@/server/session";

/**
 * Tab "Geld": costs by category as plan → committed → actual, the event's payables, expenses and other
 * income. A location fee that covers a whole season (`venue_season`) is not part of the category totals:
 * it is listed separately with this event's share (the payable divided by the events at the venue that
 * season), and the totals below show both. Revenue from stall bookings arrives in Phase 2.
 */
export default async function EventMoneyPage({ params }: PageProps<"/veranstaltungen/[id]/geld">) {
  await requirePermission("finance", "read");
  const { id } = await params;
  const actor = await getActor();
  const today = todayIn();
  const money = await getEventMoney(actor, id, today);
  if (!money) notFound();

  const canWrite = can(actor.role, "finance", "write");
  const t = await getTranslations("eventMoney");
  const tCategories = await getTranslations("finance.categories");
  const locale = await getLocale();
  const options = canWrite ? await listFinanceOptions(id) : null;
  const categories = PAYABLE_CATEGORIES.map((key) => ({ key, label: tCategories(key) }));
  const plannedKeys = new Set(money.lines.map((l) => l.category));
  const rows = money.rows.map((r) => ({ ...r, hasPlan: plannedKeys.has(r.category) }));
  const hasMoney =
    money.rows.length > 0 || money.income.length > 0 || money.seasonPayables.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
        {(
          [
            { key: "plan", cents: money.totals.plannedCents },
            { key: "committed", cents: money.totals.committedCents },
            { key: "actual", cents: money.totals.actualCents },
            { key: "income", cents: money.incomeCents },
          ] as const
        ).map((card) => (
          <li key={card.key} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
            <span className="text-muted-foreground text-small">{t(`cards.${card.key}`)}</span>
            <span className="tabular font-semibold text-xl">{formatMoney(card.cents, locale)}</span>
            <span className="text-muted-foreground text-tiny">{t(`cards.${card.key}Hint`)}</span>
          </li>
        ))}
      </ul>

      <Panel aria-labelledby="costs-title">
        <PanelHeader>
          <PanelTitle>
            <span id="costs-title">{t("costs.title")}</span>
          </PanelTitle>
          {money.summary.health && (
            <StatusBadge tone={money.summary.health} icon={CalendarClock}>
              {t(`health.${money.summary.health}`, {
                overdue: money.summary.overdueCount,
                soon: money.summary.dueSoonCount,
              })}
            </StatusBadge>
          )}
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          <p className="max-w-[75ch] text-muted-foreground text-small">{t("costs.hint")}</p>
          <BudgetTable
            eventId={money.event.id}
            rows={rows}
            totals={money.totals}
            categories={categories}
            canWrite={canWrite}
          />
        </PanelBody>
      </Panel>

      {money.seasonPayables.length > 0 && (
        <Panel aria-labelledby="season-title">
          <PanelHeader>
            <PanelTitle>
              <span id="season-title">
                {t("season.title", { venue: money.event.venueName, season: money.event.season })}
              </span>
            </PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-3">
            <p className="max-w-[75ch] text-muted-foreground text-small">
              {t("season.hint", { count: money.seasonEventCount })}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">{t("season.caption")}</caption>
                <thead>
                  <tr className="text-muted-foreground text-tiny">
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      {t("season.cols.payable")}
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      {t("season.cols.status")}
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                      {t("season.cols.total")}
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                      {t("season.cols.shareCommitted")}
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                      {t("season.cols.shareActual")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {money.seasonPayables.map((p) => (
                    <tr key={p.id} className="border-border-subtle border-t">
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        <Link href={payableHref(p.id) as never} className="hover:underline">
                          {p.title}
                        </Link>
                        <span className="block font-normal text-muted-foreground text-small">
                          {[tCategories(p.category), p.counterpartyName]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </th>
                      <td className="px-3 py-2">
                        <FinanceStatusBadge status={p.status} />
                      </td>
                      <td className="tabular px-3 py-2 text-right">
                        {formatMoney(p.committedCents, locale)}
                      </td>
                      <td className="tabular px-3 py-2 text-right">
                        {formatMoney(p.shareCommittedCents, locale)}
                      </td>
                      <td className="tabular px-3 py-2 text-right">
                        {formatMoney(p.shareActualCents, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <th scope="row" className="px-3 py-2 text-left" colSpan={3}>
                      {t("season.withShare")}
                    </th>
                    <td className="tabular px-3 py-2 text-right">
                      {formatMoney(
                        money.totals.committedCents + money.seasonShare.committedCents,
                        locale,
                      )}
                    </td>
                    <td className="tabular px-3 py-2 text-right">
                      {formatMoney(
                        money.totals.actualCents + money.seasonShare.actualCents,
                        locale,
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </PanelBody>
        </Panel>
      )}

      <Panel aria-labelledby="payables-title">
        <PanelHeader>
          <PanelTitle>
            <span id="payables-title">{t("payables.title")}</span>
          </PanelTitle>
          {canWrite && (
            <Link
              href={`/finanzen/neu?veranstaltung=${money.event.id}` as never}
              className={buttonVariants({})}
            >
              <Plus aria-hidden />
              {t("payables.new")}
            </Link>
          )}
        </PanelHeader>
        {money.payables.length === 0 ? (
          <PanelBody className="text-muted-foreground text-small">{t("payables.empty")}</PanelBody>
        ) : (
          <ul className="m-0 list-none p-0">
            {money.payables.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-border-subtle border-b px-4 py-2.5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 basis-56 flex-col">
                  <Link
                    href={payableHref(p.id) as never}
                    className="truncate font-semibold hover:underline"
                  >
                    {p.title}
                  </Link>
                  <span className="truncate text-muted-foreground text-small">
                    {[tCategories(p.category), p.counterpartyName].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <FinanceStatusBadge status={p.status} />
                <span className="tabular text-right text-small sm:w-44">
                  <span className="block font-medium">
                    {t("payables.committedPaid", {
                      committed: formatMoney(p.committedCents, locale),
                      paid: formatMoney(p.actualCents, locale),
                    })}
                  </span>
                  <span className="block text-muted-foreground text-tiny">
                    {p.next
                      ? t("payables.next", {
                          amount: formatMoney(p.next.openCents, locale),
                          date: formatDateShort(p.next.dueOn, locale),
                        })
                      : t("payables.nothingOpen")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel aria-labelledby="expenses-title">
        <PanelHeader>
          <PanelTitle>
            <span id="expenses-title">{t("expenses.title")}</span>
          </PanelTitle>
          {canWrite && options && (
            <ExpenseDialog options={options} today={today} defaultEventId={money.event.id} />
          )}
        </PanelHeader>
        {money.expenses.length === 0 ? (
          <PanelBody className="text-muted-foreground text-small">{t("expenses.empty")}</PanelBody>
        ) : (
          <ul className="m-0 list-none p-0">
            {money.expenses.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-border-subtle border-b px-4 py-2.5 last:border-b-0"
              >
                <span className="tabular w-24 text-muted-foreground text-small">
                  {formatDate(e.spentOn, locale)}
                </span>
                <span className="flex min-w-0 flex-1 basis-48 flex-col">
                  <span className="truncate font-medium">{e.description}</span>
                  <span className="truncate text-muted-foreground text-small">
                    {[tCategories(e.category), e.merchant].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="tabular text-small">{formatMoney(e.amountCents, locale)}</span>
                <span className="text-small text-muted-foreground">
                  {e.receiptCount > 0
                    ? t("expenses.receipts", { count: e.receiptCount })
                    : t("expenses.receiptMissing")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel aria-labelledby="income-title">
        <PanelHeader>
          <PanelTitle>
            <span id="income-title">{t("income.title")}</span>
          </PanelTitle>
          {canWrite && <IncomeDialog eventId={money.event.id} />}
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          {money.income.length === 0 ? (
            <p className="text-muted-foreground text-small">{t("income.empty")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {money.income.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="font-medium">{i.label}</span>
                    {i.notes && (
                      <span className="block text-muted-foreground text-small">{i.notes}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-small">
                    {i.receivedOn
                      ? t("income.received", { date: formatDate(i.receivedOn, locale) })
                      : t("income.expected")}
                  </span>
                  <span className="tabular text-small">{formatMoney(i.amountCents, locale)}</span>
                  {canWrite && <ArchiveIncomeButton id={i.id} label={i.label} />}
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-center gap-2 border-border-subtle border-t pt-3 text-muted-foreground text-small">
            <TrendingUp aria-hidden className="size-4 shrink-0" />
            {t("income.bookings")}
          </p>
        </PanelBody>
      </Panel>

      {!hasMoney && <p className="text-muted-foreground text-small">{t("nothingYet")}</p>}
    </div>
  );
}
