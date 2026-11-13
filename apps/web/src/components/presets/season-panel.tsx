import { CalendarDays, CalendarRange, ChevronRight, CircleCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { formatDateWithWeekday, formatWeek } from "@/lib/format";
import type { MarketSeason, MarketSeasons } from "@/server/queries/seasons";
import {
  CreateSeasonButton,
  ExpectedStartEditor,
  SeasonStatusMenu,
  SeasonSuggestion,
  SeasonTaskRow,
} from "./season-controls";

type Rights = { canWrite: boolean; canWriteTasks: boolean };

/**
 * The Saison panels of the market page (research 13 §6.3, Fahrplan R12): the current year's season (or "Saison
 * anlegen" while it has no record) and the next year's underneath once it exists.
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
  const rights = { canWrite, canWriteTasks };
  return (
    <KeyboardRows className="flex flex-col gap-6">
      {seasons.current.record ? (
        <SeasonPanel
          presetId={presetId}
          season={seasons.current.record}
          today={today}
          {...rights}
        />
      ) : (
        <MissingSeasonPanel
          presetId={presetId}
          season={seasons.current.season}
          canWrite={canWrite}
        />
      )}
      {seasons.next && (
        <SeasonPanel presetId={presetId} season={seasons.next} today={today} {...rights} />
      )}
    </KeyboardRows>
  );
}

async function MissingSeasonPanel({
  presetId,
  season,
  canWrite,
}: {
  presetId: string;
  season: number;
  canWrite: boolean;
}) {
  const t = await getTranslations("templates.season");
  return (
    <Panel title={t("title", { season })} titleId={`season-${season}-title`}>
      <EmptyState
        icon={CalendarRange}
        title={t("missing.title", { season })}
        hint={t("missing.hint")}
      >
        {canWrite && <CreateSeasonButton presetId={presetId} season={season} />}
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
      meta={tasks ? t("openCount", { count: open.length }) : undefined}
      actions={<SeasonStatusMenu season={ref} canWrite={canWrite} />}
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
