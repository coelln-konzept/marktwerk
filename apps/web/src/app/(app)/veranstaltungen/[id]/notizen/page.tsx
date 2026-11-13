import { can } from "@marktwerk/core";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NotesForm } from "@/components/event-detail/notes-form";
import { NextTimeNotesSection } from "@/components/next-time-notes/next-time-note-panels";
import { Panel, PanelBody } from "@/components/ui/panel";
import { todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { getEventNextTimeNotes } from "@/server/queries/next-time-notes";
import { requirePermission } from "@/server/session";

/**
 * Tab "Notizen": "Fürs nächste Mal" (the market's notes that carry over to its next date, Fahrplan R25; everybody
 * who works at the date may write them), then the free text of this date (editable with event:write).
 */
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
  const nextTime = await getEventNextTimeNotes(actor, event, todayIn());
  return (
    <div className="flex flex-col gap-6">
      {can(actor.role, "nextTimeNote", "read") && (
        <NextTimeNotesSection
          event={event}
          notes={nextTime}
          canWrite={can(actor.role, "nextTimeNote", "write")}
        />
      )}
      <Panel title={t("title")} titleId="notes-title">
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
    </div>
  );
}
