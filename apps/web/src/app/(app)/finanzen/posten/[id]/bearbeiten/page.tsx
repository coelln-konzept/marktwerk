import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type LockedRate, PayableForm } from "@/components/finance/payable-form";
import { Page, PageHeader } from "@/components/shell/page";
import { todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getPayable, listFinanceOptions } from "@/server/queries/finance";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("finance.form"))("titleEdit") };
}

/** Edit a payable and its plan. Paid and part-paid rates are shown but stay as they are. */
export default async function EditPayablePage({
  params,
}: PageProps<"/finanzen/posten/[id]/bearbeiten">) {
  await requirePermission("finance", "write");
  const { id } = await params;
  const payable = await getPayable(await getActor(), id, todayIn());
  if (!payable) notFound();
  const t = await getTranslations("finance");
  const tRate = await getTranslations("finance.rate");
  const options = await listFinanceOptions(payable.eventId);

  const locked: LockedRate[] = payable.installments
    .filter((r) => r.status === "paid" || r.status === "partially_paid")
    .map((r) => ({
      id: r.id,
      position: tRate("position", { position: `${r.sort}/${r.of}` }),
      dueOn: r.dueOn,
      amountCents: r.amountCents,
      state: r.status === "paid" ? "paid" : "partially_paid",
    }));
  const editable = payable.installments
    .filter((r) => r.status === "open")
    .map((r) => ({ id: r.id, dueOn: r.dueOn, amountCents: r.amountCents }));

  return (
    <Page
      crumbs={[
        { label: t("title"), href: "/finanzen" },
        { label: payable.title, href: `/finanzen/posten/${payable.id}` },
        { label: t("form.titleEdit") },
      ]}
    >
      <PageHeader title={t("form.titleEdit")} subtitle={t("form.subtitleEdit")} />
      <PayableForm
        options={options}
        today={todayIn()}
        edit={{ id: payable.id, updatedAt: payable.updatedAt, locked }}
        initialPlan={editable}
        initial={{
          title: payable.title,
          scope: payable.scope,
          category: payable.category,
          counterpartyContactId: payable.counterpartyId ?? "",
          eventId: payable.eventId ?? "",
          venueId: payable.venueId ?? "",
          season: payable.season ? String(payable.season) : "",
          vehicleId: payable.vehicleId ?? "",
          permitId: payable.permitId ?? "",
          critical: payable.critical,
          totalGrossCents: payable.totalGrossCents,
          vatRate: payable.vatRateBp === null ? "" : String(payable.vatRateBp / 100),
          notes: payable.notes ?? "",
        }}
      />
    </Page>
  );
}
