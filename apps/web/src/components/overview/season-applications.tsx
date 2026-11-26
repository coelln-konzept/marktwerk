import { ArrowRight, ChevronRight, CircleAlert, FileClock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PermitStateBadge } from "@/components/permits/permit-state-badge";
import { DueBadge } from "@/components/ui/due-badge";
import { Panel, panelActionLink } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { rowFocus } from "@/components/ui/table";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { SeasonApplication, SeasonApplicationsLine } from "@/server/queries/permits";

/** One application inside an opened Ort line: title, state, who, deadline; the row opens the permit. */
function ApplicationRow({ permit, today }: { permit: SeasonApplication; today: string }) {
  const t = useTranslations("overview.seasonApplications");
  const href = `/genehmigungen?genehmigung=${permit.id}`;
  const who =
    permit.responsibleName && isModuleVisible("team")
      ? t("responsible", { name: permit.responsibleName })
      : null;
  return (
    <li
      data-row
      data-href={href}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter/Space (KeyboardRows)
      tabIndex={0}
      className={cn(
        "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-border-subtle border-t py-2 pr-4 pl-11 hover:bg-hover",
        rowFocus,
      )}
    >
      <span className="min-w-0 flex-1 break-words">
        <Link
          href={href as never}
          aria-label={t("openPermit", { title: permit.title })}
          className="font-medium hover:underline"
        >
          {permit.title}
        </Link>
        {who && <span className="text-muted-foreground text-small"> · {who}</span>}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <PermitStateBadge state={permit.state} />
        {permit.applyBy ? (
          <DueBadge dueOn={permit.applyBy} today={today} withDate />
        ) : (
          <span className="text-muted-foreground text-tiny">{t("noDeadline")}</span>
        )}
      </span>
    </li>
  );
}

/**
 * One Ort and season: a native disclosure whose summary says how many applications are open there, how many are
 * overdue and the soonest deadline; opened, it lists them (each opens its permit drawer) and links to the Ort's
 * permits in the logbook. The summary is a J/K row; Enter and Space open and close it.
 */
function OrtLine({ line, today }: { line: SeasonApplicationsLine; today: string }) {
  const t = useTranslations("overview.seasonApplications");
  return (
    <li className="border-border-subtle border-b last:border-b-0">
      <details className="group" data-season-line={line.venueId}>
        <summary
          data-row
          className={cn(
            "flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-hover [&::-webkit-details-marker]:hidden",
            rowFocus,
          )}
        >
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          />
          <span className="min-w-0 flex-1 break-words">
            <span className="font-semibold">{line.venueName}</span>
            {line.season !== null && (
              <span className="text-muted-foreground text-small">
                {" "}
                · {t("season", { season: line.season })}
              </span>
            )}
            <span className="text-muted-foreground text-small">
              {" "}
              · {t("open", { count: line.permits.length })}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {line.overdue > 0 && (
              <StatusBadge tone="critical" icon={CircleAlert}>
                {t("overdue", { count: line.overdue })}
              </StatusBadge>
            )}
            {line.nextApplyBy && line.overdue === 0 && (
              <span className="inline-flex items-center gap-1.5 text-small">
                <span className="text-muted-foreground">{t("next")}</span>
                <DueBadge dueOn={line.nextApplyBy} today={today} withDate />
              </span>
            )}
          </span>
        </summary>
        <ul className="m-0 list-none p-0">
          {line.permits.map((p) => (
            <ApplicationRow key={p.id} permit={p} today={today} />
          ))}
          <li className="border-border-subtle border-t py-1.5 pr-4 pl-11">
            <Link
              href={`/genehmigungen?ort=${line.venueId}` as never}
              className="inline-flex items-center gap-1 text-small font-medium text-primary hover:underline"
            >
              {t("allOfOrt", { name: line.venueName })}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </li>
        </ul>
      </details>
    </li>
  );
}

/**
 * "Saison-Anträge" (Fahrplan SAI8): the season permits still to apply for (one per Ort and season, made when the
 * dates are planned), whatever their deadline, so they no longer hide among "Weitere Aufgaben". One line per Ort and
 * season, those with an overdue application first. Their own "… beantragen" tasks stay out of the task lists here.
 * Left out when there is nothing to apply for (and for roles that do not read permits).
 */
export async function SeasonApplicationsCard({
  lines,
  today,
  className,
}: {
  lines: SeasonApplicationsLine[];
  today: string;
  className?: string;
}) {
  if (lines.length === 0) return null;
  const t = await getTranslations("overview.seasonApplications");
  const total = lines.reduce((n, l) => n + l.permits.length, 0);
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <FileClock aria-hidden className="size-[18px] text-status-info" />
          {t("title")}
        </span>
      }
      titleId="season-applications-title"
      meta={t("count", { count: total, places: lines.length })}
      actions={
        <Link href="/genehmigungen" className={panelActionLink}>
          {t("toLogbook")}
        </Link>
      }
      className={className}
      cardClassName="overflow-hidden"
    >
      <ul className="m-0 list-none p-0">
        {lines.map((line) => (
          <OrtLine key={`${line.venueId}|${line.season ?? ""}`} line={line} today={today} />
        ))}
      </ul>
    </Panel>
  );
}
