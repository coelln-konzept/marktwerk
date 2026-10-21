import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { RequirementForm } from "@/components/permits/requirement-form";
import { Page, PageHeader } from "@/components/shell/page";
import { listContactOptions } from "@/server/queries/contacts";
import { listEventTypes } from "@/server/queries/events";
import { getVenue } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("requirements.form"))("titleNew") };
}

/** "Anforderung hinzufügen": a page, because a requirement has about a dozen fields. */
export default async function NewRequirementPage({
  params,
}: PageProps<"/orte/[id]/genehmigungen/neu">) {
  await requirePermission("permit", "write");
  const { id } = await params;
  const venue = await getVenue(id);
  if (!venue) notFound();
  const t = await getTranslations("requirements.form");
  const tVenues = await getTranslations("venues");
  const locale = await getLocale();
  const [contacts, types] = await Promise.all([listContactOptions(), listEventTypes()]);
  return (
    <Page
      crumbs={[
        { label: tVenues("title"), href: "/orte" },
        { label: venue.name, href: `/orte/${venue.id}` },
        { label: t("titleNew") },
      ]}
    >
      <PageHeader title={t("titleNew")} subtitle={t("subtitle", { venue: venue.name })} />
      <RequirementForm
        venueId={venue.id}
        contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
        eventTypes={types.map((x) => ({ id: x.id, name: locale === "en" ? x.nameEn : x.nameDe }))}
      />
    </Page>
  );
}
