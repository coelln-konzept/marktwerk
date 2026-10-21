import { can } from "@marktwerk/core";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NotesForm } from "@/components/event-detail/notes-form";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { requirePermission } from "@/server/session";

/** Tab "Notizen": free text per event; editable with event:write. */
export default async function EventNotesPage({
  params,
}: PageProps<"/veranstaltungen/[id]/notizen">) {
  await requirePermission("event", "read");
  const { id } = await params;
  const actor = await getActor();
  const event = await getEvent(actor, id);
  if (!event) notFound();
  const t = await getTranslations("eventDetail.notes");
  const canWrite = can(actor.role, "event", "write");
  return (
    <Panel aria-labelledby="notes-title">
      <PanelHeader>
        <PanelTitle id="notes-title">{t("title")}</PanelTitle>
      </PanelHeader>
      <PanelBody>
        {canWrite ? (
          <NotesForm eventId={event.id} notes={event.notes ?? ""} />
        ) : (
          <div className="flex max-w-[70ch] flex-col gap-3">
            {event.notes ? (
              <p className="whitespace-pre-wrap leading-relaxed">{event.notes}</p>
            ) : (
              <p className="text-muted-foreground">{t("empty")}</p>
            )}
            <p className="text-faint-foreground text-small">{t("readOnly")}</p>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
