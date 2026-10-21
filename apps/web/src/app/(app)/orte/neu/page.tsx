import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { EMPTY_VENUE } from "@/components/venues/defaults";
import { VenueForm } from "@/components/venues/venue-form";
import { listLandownerOptions } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("venues.manage"))("newTitle") };
}

export default async function NewVenuePage() {
  await requirePermission("venue", "write");
  const t = await getTranslations("venues");
  const tm = await getTranslations("venues.manage");
  const landowners = await listLandownerOptions();

  return (
    <Page crumbs={[{ label: t("title"), href: "/orte" }, { label: tm("newTitle") }]}>
      <PageHeader title={tm("newTitle")} subtitle={tm("newSubtitle")} />
      <VenueForm initial={EMPTY_VENUE} landowners={landowners} />
    </Page>
  );
}
