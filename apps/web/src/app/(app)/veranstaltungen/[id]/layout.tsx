import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EventHeader } from "@/components/event-detail/event-header";
import { Page } from "@/components/shell/page";
import { formatDate } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { requirePermission } from "@/server/session";

/**
 * "<Name> · <Datum>" on the Zusammenfassung; every other tab puts its name in front through the template
 * ("Checkliste · <Name> · <Datum> · marktwerk", UX-039), so open tabs and the history can be told apart.
 * The template replaces the root one, so it repeats "marktwerk".
 */
export async function generateMetadata({
  params,
}: LayoutProps<"/veranstaltungen/[id]">): Promise<Metadata> {
  await requirePermission("event", "read");
  const { id } = await params;
  const event = await getEvent(await getActor(), id);
  if (!event) return {};
  const name = `${event.name} · ${formatDate(event.startsOn, await getLocale())}`;
  return { title: { default: name, template: `%s · ${name} · marktwerk` } };
}

/** Header and tab bar shared by all tabs of one event (Überblick, Board, Genehmigungen, Team, Geld, …). */
export default async function EventLayout({
  children,
  params,
}: LayoutProps<"/veranstaltungen/[id]">) {
  await requirePermission("event", "read");
  const { id } = await params;
  const actor = await getActor();
  const event = await getEvent(actor, id);
  if (!event) notFound();
  const tNav = await getTranslations("nav");
  return (
    <Page crumbs={[{ label: tNav("events"), href: "/veranstaltungen" }, { label: event.name }]}>
      <EventHeader event={event} actor={actor} />
      {children}
    </Page>
  );
}
