import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AgreementGenerateForm } from "@/components/agreements/generate-form";
import { Page, PageHeader } from "@/components/shell/page";
import { getAgreement } from "@/server/queries/agreements";
import { listEventTypeOptions } from "@/server/queries/event-form";
import { listPresetsForGeneration } from "@/server/queries/presets";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("agreements.generateForm"))("title") };
}

/** "Termine erzeugen" for one location agreement (reached from the venue page). */
export default async function AgreementGeneratePage({
  params,
}: PageProps<"/orte/[id]/vereinbarungen/[agreementId]/erzeugen">) {
  await requirePermission("venue", "read");
  await requirePermission("event", "write");
  const { id, agreementId } = await params;
  const agreement = await getAgreement(agreementId);
  if (!agreement || agreement.venueId !== id) notFound();
  const t = await getTranslations("agreements.generateForm");
  const tVenues = await getTranslations("nav");
  const [presets, types] = await Promise.all([listPresetsForGeneration(), listEventTypeOptions()]);

  return (
    <Page
      crumbs={[
        { label: tVenues("venues"), href: "/orte" },
        { label: agreement.venueName, href: `/orte/${id}` },
        { label: t("title") },
      ]}
    >
      <PageHeader title={t("title")} subtitle={t("subtitle", { venue: agreement.venueName })} />
      <AgreementGenerateForm
        agreementId={agreement.id}
        venueId={agreement.venueId}
        venueName={agreement.venueName}
        pending={agreement.pending}
        presets={presets.filter((p) => p.venueId === agreement.venueId)}
        types={types}
      />
    </Page>
  );
}
