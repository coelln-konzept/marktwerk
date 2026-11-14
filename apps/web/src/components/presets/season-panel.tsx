import { orderSeasonPanels } from "@marktwerk/core";
import { CalendarDays, CalendarRange, ChevronRight, CircleCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { formatDateWithWeekday, formatWeek } from "@/lib/format";
import type { MarketSeason, MarketSeasons, MissingSeason } from "@/server/queries/seasons";
import {
  CreateSeasonForm,
  ExpectedStartEditor,
  SeasonStatusMenu,
  SeasonSuggestion,
  SeasonTaskRow,
} from "./season-controls";

type Rights = { canWrite: boolean; canWriteTasks: boolean };

/**
 * The Saison panels of the market page (research 13 §6.3, Fahrplan R12): one line on what a Saison is (UX-050),
 * then the current year's season (or "Saison anlegen" while it has no record) and the next year's once it
 * exists. Seasons that are not closed come first, by year, the closed ones after them (`orderSeasonPanels`).
 */
export async function SeasonPanels({
  presetId,
  seasons,
  today,
  canWrite,
  canWriteTasks,
}: {
  presetId: string;
  seasons: MarketSeasons;
  today: string;
} & Rights) {
  const t = await getTranslations("templates.season");
  const rights = { canWrite, canWriteTasks };
  const panels = orderSeasonPanels([
    {
      season: seasons.current.season,
      status: seasons.current.record?.status ?? null,
      record: seasons.current.record,
    },
    ...(seasons.next
      ? [{ season: seasons.next.season, status: seasons.next.status, record: seasons.next }]
      : []),
  ]);
  const missing = seasons.current.missing ?? { hasDates: false, suggestedStart: null };
  return (
    <KeyboardRows className="flex flex-col gap-6">
      <p className="m-0 -mb-4 text-small text-foreground-2">{t("intro")}</p>
      {panels.map((p) =>
        p.record ? (
          <SeasonPanel
            key={p.season}
            presetId={presetId}
            season={p.record}
            today={today}
            {...rights}
          />
        ) : (
          <MissingSeasonPanel
            key={p.season}
            presetId={presetId}
            season={p.season}
            missing={missing}
            canWrite={canWrite}
          />
        ),
      )}
    </KeyboardRows>
  );
}

async function MissingSeasonPanel({
  presetId,
  season,
  missing,
  canWrite,
}: {
  presetId: string;
  season: number;
  missing: MissingSeason;
  canWrite: boolean;
}) {
  const t = await getTranslations("templates.season");
  return (
    <Panel title={t("title", { season })} titleId={`season-${season}-title`}>
      <EmptyState
        icon={CalendarRange}
        title={t("missing.title", { season })}
        hint={
          !canWrite
            ? t("missing.hint")
            : missing.hasDates
              ? t("createForm.hasDates")
              : t("createForm.hint")
        }
      >
        {canWrite && (
          <CreateSeasonForm
            presetId={presetId}
            season={season}
            hasDates={missing.hasDates}
            suggestedStart={missing.suggestedStart}
          />
        )}
      </EmptyState>
    </Panel>
  );
}

async function SeasonPanel({
  presetId,
  season,
  today,
  canWrite,
  canWriteTasks,
}: {
  presetId: string;
  season: MarketSeason;
  today: string;
} & Rights) {
  const t = await getTranslations("templates.season");
  const locale = await getLocale();
  const { start, tasks } = season;
  // Client parts get only what they need (the task rows travel once).
  const ref = { id: season.id, season: season.season, status: season.status };
  const statusRef = {
    ...ref,
    statusBlocks: season.statusBlocks,
    openSeasonTasks: season.openSeasonTasks,
  };
  const open = tasks?.open ?? [];
  const finished = tasks?.finished ?? [];
  const row = (task: (typeof open)[number]) => (
    <SeasonTaskRow
      key={task.id}
      presetId={presetId}
      task={task}
      today={today}
      canWrite={canWriteTasks}
    />
  );

  return (
    <Panel
      title={t("title", { season: season.season })}
      titleId={`season-${season.season}-title`}
      // A closed season has nothing left to count.
      meta={
        tasks && season.status !== "closed" ? t("openCount", { count: open.length }) : undefined
      }
      actions={<SeasonStatusMenu season={statusRef} canWrite={canWrite} />}
      cardClassName="overflow-hidden"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <CalendarDays aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {start.kind === "dates" ? (
            <>
              <span className="font-medium">
                {t("start.first", {
                  date: formatDateWithWeekday(start.firstDate, locale),
                  week: formatWeek(start.firstDate, locale),
                })}
              </span>
              <span className="text-muted-foreground text-small">
                {t("start.dates", {
                  count: start.events,
                  last: formatDateWithWeekday(start.lastDate, locale),
                })}
              </span>
            </>
          ) : (
            <>
              {season.canEditExpectedStart ? (
                <ExpectedStartEditor
                  season={{ ...ref, expectedStart: season.expectedStart }}
                  canWrite={canWrite}
                />
              ) : (
                <span className="font-medium">
                  {t("start.expected", {
                    date: formatDateWithWeekday(start.expectedStart, locale),
                  })}
                </span>
              )}
              <span className="text-muted-foreground text-small">
                {t("start.expectedHint", { week: formatWeek(start.expectedStart, locale) })}
              </span>
            </>
          )}
        </div>
      </div>
      {canWrite && season.suggestedStatus && (
        <SeasonSuggestion season={ref} to={season.suggestedStatus} />
      )}
      {tasks && (
        <div className="border-border-subtle border-t">
          <h3 className="sr-only">{t("tasks.title")}</h3>
          {open.length > 0 ? (
            <ul className="m-0 flex list-none flex-col p-0">{open.map(row)}</ul>
          ) : finished.length > 0 ? (
            <EmptyState icon={CircleCheck} title={t("tasks.allDone")} className="py-6" />
          ) : (
            <p className="m-0 px-4 py-3 text-muted-foreground text-small">{t("tasks.none")}</p>
          )}
          {finished.length > 0 && (
            <details className="group border-border-subtle border-t">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-4 text-muted-foreground text-small hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  aria-hidden
                  className="size-4 transition-transform group-open:rotate-90"
                />
                {t("tasks.finished", { count: finished.length })}
              </summary>
              <ul className="m-0 flex list-none flex-col border-border-subtle border-t p-0">
                {finished.map(row)}
              </ul>
            </details>
          )}
        </div>
      )}
    </Panel>
  );
}
