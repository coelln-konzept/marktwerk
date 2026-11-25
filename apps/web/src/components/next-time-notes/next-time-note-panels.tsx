import { ArrowRight, Lightbulb } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Panel, PanelBody, panelActionLink } from "@/components/ui/panel";
import { formatDateWithWeekday } from "@/lib/format";
import type { EventDetail } from "@/server/queries/events";
import type { EventNextTimeNotes, NextTimeNoteList } from "@/server/queries/next-time-notes";
import { NextTimeNoteForm } from "./next-time-note-form";
import { NextTimeNoteList as NoteList } from "./next-time-note-list";

/** Anchor of the section on the Notizen tab (the Zusammenfassung links to it). */
export const NEXT_TIME_ANCHOR = "fuers-naechste-mal";

const title = (text: string) => (
  <span className="inline-flex items-center gap-2">
    <Lightbulb aria-hidden className="size-[18px] text-status-warn" />
    {text}
  </span>
);

/**
 * Zusammenfassung of the market's next date (Fahrplan R25): the open notes written before it, prominently, right
 * under the status line. Nothing on other dates or when no note is open.
 */
export async function NextTimeOverviewPanel({
  event,
  notes,
  canWrite,
}: {
  event: EventDetail;
  notes: EventNextTimeNotes | null;
  canWrite: boolean;
}) {
  if (!notes?.isNextDate || notes.forThisDate.length === 0) return null;
  const t = await getTranslations("nextTimeNotes");
  return (
    <Panel
      title={title(t("title"))}
      titleId="next-time-title"
      meta={t("openCount", { count: notes.forThisDate.length })}
      actions={
        <Link
          href={`/veranstaltungen/${event.id}/notizen#${NEXT_TIME_ANCHOR}` as never}
          className={panelActionLink}
        >
          {t("overview.link")}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      }
      cardClassName="border-status-warn-dot/40"
    >
      <p className="m-0 border-border-subtle border-b px-4 py-2 text-foreground-2 text-small">
        {t("overview.intro", { market: event.preset?.name ?? event.name })}
      </p>
      <NoteList open={notes.forThisDate} canWrite={canWrite} emptyText={null} />
    </Panel>
  );
}

/**
 * Notizen tab: "Fürs nächste Mal" with the form and every note of the market (open, then the done ones folded).
 * A date without a market says why there is nothing.
 */
export async function NextTimeNotesSection({
  event,
  notes,
  canWrite,
}: {
  event: EventDetail;
  notes: EventNextTimeNotes | null;
  canWrite: boolean;
}) {
  const t = await getTranslations("nextTimeNotes");
  const locale = await getLocale();
  return (
    <Panel
      id={NEXT_TIME_ANCHOR}
      title={title(t("title"))}
      titleId="next-time-title"
      meta={notes ? t("openCount", { count: notes.open.length }) : undefined}
      className="scroll-mt-20"
    >
      {notes ? (
        <>
          <PanelBody className="flex max-w-[70ch] flex-col gap-3">
            <p className="m-0 text-foreground-2 text-small">
              {t("intro", { market: event.preset?.name ?? event.name })}
            </p>
            {notes.isNextDate ? (
              <p className="m-0 text-muted-foreground text-small">{t("isNextDate")}</p>
            ) : notes.nextDate ? (
              <p className="m-0 text-muted-foreground text-small">
                {t("nextDate", { date: formatDateWithWeekday(notes.nextDate.startsOn, locale) })}{" "}
                <Link
                  href={`/veranstaltungen/${notes.nextDate.id}` as never}
                  className="font-medium text-accent-soft-foreground hover:underline"
                >
                  {t("nextDateLink")}
                </Link>
              </p>
            ) : null}
            {canWrite && <NextTimeNoteForm target={{ eventId: event.id }} />}
          </PanelBody>
          <div className="border-border-subtle border-t">
            <NoteList
              open={notes.open}
              done={notes.done}
              doneCount={notes.doneCount}
              canWrite={canWrite}
            />
          </div>
        </>
      ) : (
        <PanelBody>
          <p className="m-0 text-muted-foreground text-small">{t("noMarket")}</p>
        </PanelBody>
      )}
    </Panel>
  );
}

/** Market page: every note of the market, with the form (written on the market page: no date). */
export async function MarketNextTimeNotesPanel({
  presetId,
  notes,
  canWrite,
}: {
  presetId: string;
  notes: NextTimeNoteList;
  canWrite: boolean;
}) {
  const t = await getTranslations("nextTimeNotes");
  return (
    <Panel
      id={NEXT_TIME_ANCHOR}
      title={title(t("title"))}
      titleId="next-time-title"
      meta={t("openCount", { count: notes.open.length })}
    >
      <PanelBody className="flex max-w-[70ch] flex-col gap-3">
        <p className="m-0 text-foreground-2 text-small">{t("market.intro")}</p>
        {canWrite && <NextTimeNoteForm target={{ presetId }} />}
      </PanelBody>
      <div className="border-border-subtle border-t">
        <NoteList
          open={notes.open}
          done={notes.done}
          doneCount={notes.doneCount}
          canWrite={canWrite}
        />
      </div>
    </Panel>
  );
}
