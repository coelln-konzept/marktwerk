import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PayableForm } from "@/components/finance/payable-form";
import { Page, PageHeader } from "@/components/shell/page";
import { todayIn } from "@/lib/format";
import { param } from "@/lib/url";
import { listFinanceOptions } from "@/server/queries/finance";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("finance.form"))("titleNew") };
}

/**
 * "Zahlung anlegen": a page, because a payable has many fields and an instalment plan (UX concept §4).
 * `?veranstaltung=<id>` presets an event payable (from the Geld tab).
 */
export default async function NewPayablePage({ searchParams }: PageProps<"/finanzen/neu">) {
  await requirePermission("finance", "write");
  const sp = await searchParams;
  const t = await getTranslations("finance");
  const eventId = param(sp.veranstaltung);
  const options = await listFinanceOptions(eventId);
  const preset = eventId && options.events.some((e) => e.id === eventId) ? eventId : "";
  return (
    <Page crumbs={[{ label: t("title"), href: "/finanzen" }, { label: t("form.titleNew") }]}>
      <PageHeader title={t("form.titleNew")} subtitle={t("form.subtitleNew")} />
      <PayableForm
        options={options}
        today={todayIn()}
        initial={preset ? { scope: "event", eventId: preset } : undefined}
      />
    </Page>
  );
}
