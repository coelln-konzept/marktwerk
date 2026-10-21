import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { getActor } from "@/server/actor";

export const metadata: Metadata = { title: "Übersicht" };

// Placeholder until the Übersicht screen lands (season strip, Heute fällig, Nächstes Wochenende).
export default async function OverviewPage() {
  const actor = await getActor();
  const t = await getTranslations("nav");
  return (
    <Page crumbs={[{ label: t("overview") }]}>
      <PageHeader title={actor.firstName} />
    </Page>
  );
}
