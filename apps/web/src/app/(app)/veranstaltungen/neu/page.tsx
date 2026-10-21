import { isIsoDate } from "@marktwerk/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ManualEventForm } from "@/components/events/manual-event-form";
import { Page, PageHeader } from "@/components/shell/page";
import { param } from "@/lib/url";
import { listEventTypeOptions } from "@/server/queries/event-form";
import { listVenueOptions } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("generate.single"))("title") };
}

/**
 * "Neue Veranstaltung ohne Vorlage" (Einzeltermin). `?ort=<id>` and `?datum=YYYY-MM-DD` pre-fill the
 * venue and the first day (links from the venue page / "+ Neu" in context).
 */
export default async function NewEventPage({ searchParams }: PageProps<"/veranstaltungen/neu">) {
  await requirePermission("event", "write");
  const sp = await searchParams;
  const t = await getTranslations("generate.single");
  const tNav = await getTranslations("nav");
  const [types, venues] = await Promise.all([listEventTypeOptions(), listVenueOptions()]);
  const venueId = param(sp.ort);
  const startsOn = param(sp.datum);

  return (
    <Page crumbs={[{ label: tNav("events"), href: "/veranstaltungen" }, { label: t("title") }]}>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ManualEventForm
        types={types}
        venues={venues}
        initial={{
          venueId: venues.some((v) => v.id === venueId) ? venueId : undefined,
          startsOn: startsOn && isIsoDate(startsOn) ? startsOn : undefined,
        }}
      />
    </Page>
  );
}
