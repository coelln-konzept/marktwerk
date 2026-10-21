import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { VenueForm } from "@/components/venues/venue-form";
import { getVenueForEdit, listLandownerOptions } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata({
  params,
}: PageProps<"/orte/[id]/bearbeiten">): Promise<Metadata> {
  const venue = await getVenueForEdit((await params).id);
  return { title: venue?.name ?? (await getTranslations("venues.manage"))("editTitle") };
}

export default async function EditVenuePage({ params }: PageProps<"/orte/[id]/bearbeiten">) {
  await requirePermission("venue", "write");
  const { id } = await params;
  const venue = await getVenueForEdit(id);
  if (!venue) notFound();
  const t = await getTranslations("venues");
  const tm = await getTranslations("venues.manage");
  const landowners = await listLandownerOptions(venue.landownerContactId);

  return (
    <Page
      crumbs={[
        { label: t("title"), href: "/orte" },
        { label: venue.name, href: `/orte/${venue.id}` },
        { label: tm("editTitle") },
      ]}
    >
      <PageHeader title={tm("editTitle")} subtitle={tm("editSubtitle")} />
      <VenueForm
        venueId={venue.id}
        initial={{
          name: venue.name,
          kind: venue.kind,
          street: venue.street,
          postalCode: venue.postalCode,
          city: venue.city,
          bundesland: venue.bundesland,
          accessInfo: venue.accessInfo,
          landownerContactId: venue.landownerContactId,
          capacityCm: venue.capacityCm,
          lat: venue.lat,
          lng: venue.lng,
        }}
        landowners={landowners}
        rowLengthCm={venue.rowLengthCm}
      />
    </Page>
  );
}
