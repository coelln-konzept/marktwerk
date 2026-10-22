import { addDays, can, expandRRule } from "@marktwerk/core";
import { dutyRole } from "@marktwerk/db/schema";
import { asc } from "drizzle-orm";
import { CalendarPlus, Pencil } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Facts, Vorschau } from "@/components/ui/vorschau";
import { formatDateRange, formatMoney, formatWeek, todayIn } from "@/lib/format";
import { rruleText } from "@/lib/rrule-text";
import { getActor } from "@/server/actor";
import { db } from "@/server/db";
import type { listPresets } from "@/server/queries/presets";
import { PresetStatusBadge } from "./preset-status";

export type PresetRow = Awaited<ReturnType<typeof listPresets>>[number];

/** The next dates a preset's rule yields in the coming 12 months (first five). */
export function nextPresetDates(rule: string | null, today: string, limit = 5): string[] {
  if (!rule) return [];
  try {
    return expandRRule(rule, today, addDays(today, 365)).slice(0, limit);
  } catch {
    return [];
  }
}

/** Vorschau of one event preset: public title, times, default team, next dates, "Termine erzeugen". */
export async function PresetVorschau({
  preset,
  closeHref,
  canEdit = false,
}: {
  preset: PresetRow;
  closeHref: string;
  /** template:write: shows "Bearbeiten". */
  canEdit?: boolean;
}) {
  const actor = await getActor();
  const t = await getTranslations("templates");
  const locale = await getLocale();
  const roles = await db
    .select({ key: dutyRole.key, nameDe: dutyRole.nameDe, nameEn: dutyRole.nameEn })
    .from(dutyRole)
    .orderBy(asc(dutyRole.sort));
  const personOf = new Map(preset.team.map((m) => [m.roleKey, m.name]));
  const dates = nextPresetDates(preset.rrule, todayIn());
  const canGenerate = can(actor.role, "event", "write") && preset.active;
  const times = preset.defaultTimes;
  return (
    <Vorschau
      kind={t("vorschau.kind")}
      title={preset.name}
      closeHref={closeHref}
      badges={
        <>
          <EventTypeTag typeKey={preset.typeKey}>
            {locale === "en" ? preset.typeNameEn : preset.typeNameDe}
          </EventTypeTag>
          <PresetStatusBadge active={preset.active} />
        </>
      }
    >
      <Facts
        items={[
          {
            label: t("vorschau.venue"),
            value: (
              <Link
                href={`/orte/${preset.venueId}` as never}
                className="font-medium text-accent-soft-foreground hover:underline"
              >
                {preset.venueName}
              </Link>
            ),
          },
          { label: t("vorschau.publicTitle"), value: preset.publicTitle ?? "–" },
          {
            label: t("vorschau.rhythm"),
            value: preset.rrule ? rruleText(preset.rrule, locale) : t("vorschau.noRule"),
          },
          { label: t("vorschau.duration"), value: t("duration", { days: preset.durationDays }) },
          { label: t("vorschau.times"), value: t("vorschau.timesValue", times) },
          {
            label: t("vorschau.price"),
            value: t("perMeter", { price: formatMoney(preset.pricePerMCents, locale) }),
          },
          { label: t("vorschau.fee"), value: formatMoney(preset.bookingFeeCents, locale) },
        ]}
      />

      <p className="m-0 text-muted-foreground text-small">
        {preset.ownTemplate ? (
          <>
            {t("vorschau.tasksOwn")}{" "}
            <Link
              href={`/vorlagen/ablauf/${preset.ownTemplate.id}` as never}
              className="text-accent-soft-foreground hover:underline"
            >
              {t("vorschau.tasksOpen")}
            </Link>
          </>
        ) : preset.sharedTemplates.length > 0 ? (
          t("vorschau.tasksShared", { names: preset.sharedTemplates.map((x) => x.name).join(", ") })
        ) : (
          t("vorschau.tasksNone")
        )}
      </p>

      <section aria-labelledby="vorschau-team">
        <h3
          id="vorschau-team"
          className="mb-1.5 font-semibold text-muted-foreground text-tiny uppercase tracking-wide"
        >
          {t("vorschau.team")}
        </h3>
        {preset.team.length === 0 ? (
          <p className="text-muted-foreground text-small">{t("vorschau.noTeam")}</p>
        ) : (
          <dl className="m-0 grid grid-cols-[132px_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
            {roles.map((role) => (
              <div key={role.key} className="contents">
                <dt className="text-muted-foreground">
                  {locale === "en" ? role.nameEn : role.nameDe}
                </dt>
                <dd className="m-0">
                  {personOf.get(role.key) ?? <span className="text-faint-foreground">–</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section aria-labelledby="vorschau-dates">
        <h3
          id="vorschau-dates"
          className="mb-1.5 font-semibold text-muted-foreground text-tiny uppercase tracking-wide"
        >
          {t("vorschau.nextDates")}
          <span className="ml-1.5 font-normal normal-case tracking-normal">
            {t("vorschau.nextDatesHint")}
          </span>
        </h3>
        {dates.length === 0 ? (
          <p className="text-muted-foreground text-small">
            {preset.rrule ? t("vorschau.noDates") : t("vorschau.noRule")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {dates.map((date) => (
              <li key={date} className="flex items-baseline gap-2 text-small">
                <span className="tabular whitespace-nowrap font-semibold">
                  {formatDateRange(date, addDays(date, preset.durationDays - 1), locale)}
                </span>
                <span className="tabular text-muted-foreground">{formatWeek(date, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(canGenerate || canEdit) && (
        <div className="flex flex-wrap gap-2">
          {canGenerate && (
            <Link
              href={`/veranstaltungen?erzeugen=1&vorlage=${preset.id}` as never}
              className="inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <CalendarPlus aria-hidden className="size-4" />
              {t("vorschau.generate")}
            </Link>
          )}
          {canEdit && (
            <Link
              href={`/vorlagen/${preset.id}` as never}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil aria-hidden />
              {t("vorschau.edit")}
            </Link>
          )}
        </div>
      )}
    </Vorschau>
  );
}
