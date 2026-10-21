import { can } from "@marktwerk/core";
import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUpload } from "@/components/documents/upload";
import { payableTarget } from "@/components/finance/payable-card";
import { CancelPayableButton } from "@/components/finance/rate-actions";
import { RateTable } from "@/components/finance/rate-table";
import { CriticalBadge, FinanceStatusBadge } from "@/components/finance/status";
import { Page, PageHeader } from "@/components/shell/page";
import { buttonVariants } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Facts } from "@/components/ui/vorschau";
import { formatDate, formatMoney, todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getPayable, listFinanceOptions } from "@/server/queries/finance";
import { requirePermission } from "@/server/session";

export async function generateMetadata({
  params,
}: PageProps<"/finanzen/posten/[id]">): Promise<Metadata> {
  await requirePermission("finance", "read");
  const { id } = await params;
  const payable = await getPayable(await getActor(), id, todayIn());
  return { title: payable?.title };
}

/** One payable: facts, instalment plan with payments and receipts, documents on the payable, history. */
export default async function PayablePage({ params }: PageProps<"/finanzen/posten/[id]">) {
  await requirePermission("finance", "read");
  const { id } = await params;
  const actor = await getActor();
  const today = todayIn();
  const payable = await getPayable(actor, id, today);
  if (!payable) notFound();

  const canWrite = can(actor.role, "finance", "write");
  const t = await getTranslations("finance");
  const tDetail = await getTranslations("finance.detail");
  const tCategories = await getTranslations("finance.categories");
  const tScopes = await getTranslations("finance.scopes");
  const tHistory = await getTranslations("finance.history");
  const locale = await getLocale();
  const options = await listFinanceOptions();

  const vatBp = payable.vatRateBp;
  const netCents =
    vatBp === null ? null : Math.round((payable.totalGrossCents * 10_000) / (10_000 + vatBp));
  const target = payableTarget(payable, tDetail("company"));
  const targetHref =
    payable.scope === "event" && payable.eventId
      ? `/veranstaltungen/${payable.eventId}/geld`
      : payable.scope === "venue_season" && payable.venueId
        ? `/orte/${payable.venueId}`
        : null;
  const hasUnpaid = payable.installments.some((i) => i.status === "open");

  return (
    <Page crumbs={[{ label: t("title"), href: "/finanzen" }, { label: payable.title }]}>
      <PageHeader
        title={payable.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <FinanceStatusBadge status={payable.status} />
            {payable.critical && <CriticalBadge />}
          </span>
        }
        actions={
          canWrite && (
            <>
              <Link
                href={`/finanzen/posten/${payable.id}/bearbeiten` as never}
                className={buttonVariants({})}
              >
                <Pencil aria-hidden />
                {tDetail("edit")}
              </Link>
              {hasUnpaid && <CancelPayableButton payableId={payable.id} title={payable.title} />}
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel aria-labelledby="facts-title">
          <PanelHeader>
            <PanelTitle>
              <span id="facts-title">{tDetail("facts")}</span>
            </PanelTitle>
          </PanelHeader>
          <PanelBody>
            <Facts
              items={[
                {
                  label: tDetail("counterparty"),
                  value: payable.counterpartyName ? (
                    <Link
                      href={`/kontakte?vorschau=${payable.counterpartyId}` as never}
                      className="text-accent-soft-foreground hover:underline"
                    >
                      {payable.counterpartyName}
                    </Link>
                  ) : (
                    tDetail("none")
                  ),
                },
                { label: tDetail("category"), value: tCategories(payable.category) },
                {
                  label: tDetail("scope"),
                  value: (
                    <>
                      {tScopes(payable.scope)}
                      {payable.scope !== "company" && (
                        <>
                          {": "}
                          {targetHref ? (
                            <Link
                              href={targetHref as never}
                              className="text-accent-soft-foreground hover:underline"
                            >
                              {target}
                            </Link>
                          ) : (
                            target
                          )}
                        </>
                      )}
                    </>
                  ),
                },
                {
                  label: tDetail("total"),
                  value: (
                    <span className="tabular font-semibold">
                      {formatMoney(payable.totalGrossCents, locale)}
                    </span>
                  ),
                },
                {
                  label: tDetail("vat"),
                  value:
                    vatBp === null || netCents === null ? (
                      tDetail("vatUnknown")
                    ) : (
                      <span className="tabular">
                        {tDetail("vatLine", {
                          rate: vatBp / 100,
                          net: formatMoney(netCents, locale),
                          vat: formatMoney(payable.totalGrossCents - netCents, locale),
                        })}
                      </span>
                    ),
                },
                {
                  label: tDetail("paid"),
                  value: (
                    <span className="tabular">
                      {tDetail("paidLine", {
                        paid: formatMoney(payable.paidCents, locale),
                        open: formatMoney(payable.openCents, locale),
                      })}
                    </span>
                  ),
                },
                {
                  label: tDetail("notes"),
                  value: payable.notes ? (
                    <span className="whitespace-pre-wrap text-small">{payable.notes}</span>
                  ) : (
                    tDetail("none")
                  ),
                },
              ]}
            />
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="docs-title">
          <PanelHeader>
            <PanelTitle>
              <span id="docs-title">{tDetail("documents")}</span>
            </PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-3">
            <p className="text-muted-foreground text-small">{tDetail("documentsHint")}</p>
            <DocumentList documents={payable.documents} canWrite={canWrite} />
            {payable.documents.length === 0 && (
              <p className="text-muted-foreground text-small">{tDetail("noDocuments")}</p>
            )}
            {canWrite && (
              <DocumentUpload
                link={{ payableId: payable.id }}
                kind="invoice"
                label={tDetail("addInvoice")}
              />
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel aria-labelledby="plan-title" className="overflow-hidden">
        <PanelHeader>
          <PanelTitle>
            <span id="plan-title">{tDetail("plan")}</span>
          </PanelTitle>
        </PanelHeader>
        <RateTable
          payableTitle={payable.title}
          rates={payable.installments}
          rateDocuments={payable.rateDocuments}
          today={today}
          staff={options.staff}
          defaultStaffId={actor.staffMemberId}
          canWrite={canWrite}
          documentList={(documents) => (
            <DocumentList documents={documents} canWrite={canWrite} compact />
          )}
        />
      </Panel>

      <Panel aria-labelledby="history-title">
        <PanelHeader>
          <PanelTitle>
            <span id="history-title">{tDetail("history")}</span>
          </PanelTitle>
        </PanelHeader>
        <PanelBody>
          {payable.history.length === 0 ? (
            <p className="text-muted-foreground text-small">{tDetail("noHistory")}</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {payable.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 text-small">
                  <time dateTime={h.at} className="tabular text-muted-foreground">
                    {formatDate(h.at.slice(0, 10), locale)} {h.at.slice(11, 16)}
                  </time>
                  <span className="font-medium">
                    {tHistory.has(h.action.replace(".", "_") as never)
                      ? tHistory(h.action.replace(".", "_") as never)
                      : h.action}
                  </span>
                  {h.actorName && <span className="text-muted-foreground">{h.actorName}</span>}
                </li>
              ))}
            </ol>
          )}
        </PanelBody>
      </Panel>
    </Page>
  );
}
