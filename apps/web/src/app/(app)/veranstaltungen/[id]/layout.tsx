import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EventHeader } from "@/components/event-detail/event-header";
import { Page } from "@/components/shell/page";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { requirePermission } from "@/server/session";

export async function generateMetadata({
  params,
}: LayoutProps<"/veranstaltungen/[id]">): Promise<Metadata> {
  await requirePermission("event", "read");
  const { id } = await params;
  const event = await getEvent(await getActor(), id);
  return { title: event?.name };
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
