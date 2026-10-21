import { getLocale, getTranslations } from "next-intl/server";
import { EVENT_TYPE_KEYS, type EventTypeKey, EventTypeTag } from "@/components/ui/event-type-tag";
import { Panel } from "@/components/ui/panel";
import type { Overview } from "@/server/queries/overview";

/** The owner's view of the year. Before time estimates (M2) it shows what exists: event counts. */
export async function SeasonStrip({
  season,
  nextSeason,
}: {
  season: Overview["season"];
  nextSeason: Overview["nextSeason"];
}) {
  const t = await getTranslations("overview.season");
  const locale = await getLocale();
  const months = t("months").split(",");
  const title =
    season.firstMonth && season.lastMonth
      ? t("title", {
          year: season.year,
          from: months[season.firstMonth - 1] ?? "",
          to: months[season.lastMonth - 1] ?? "",
        })
      : t("titleEmpty", { year: season.year });
  return (
    <Panel aria-label={t("label")} className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-semibold text-muted-foreground text-tiny uppercase tracking-wide">
          {title}
        </h2>
        {season.count > 0 ? (
          <>
            <p className="m-0 font-semibold">
              <span className="tabular">{t("count", { count: season.count })}</span>
            </p>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {season.byType.map((type) => (
                <li key={type.key}>
                  <EventTypeTag typeKey={type.key}>
                    <span className="tabular">{type.n}</span>{" "}
                    {(EVENT_TYPE_KEYS as readonly string[]).includes(type.key)
                      ? t(`types.${type.key as EventTypeKey}`)
                      : locale === "en"
                        ? type.nameEn
                        : type.nameDe}
                  </EventTypeTag>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="m-0 text-muted-foreground">{t("empty")}</p>
        )}
        {nextSeason && (
          <p className="tabular m-0 ml-auto font-medium text-foreground-2">
            {t("next", { year: nextSeason.year, count: nextSeason.count })}
          </p>
        )}
      </div>
      <p className="m-0 text-muted-foreground text-small">{t("later")}</p>
    </Panel>
  );
}
