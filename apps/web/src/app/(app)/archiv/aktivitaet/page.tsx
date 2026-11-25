import { can } from "@marktwerk/core";
import { History, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArchiveFrame } from "@/components/archive/archive-frame";
import { formatInstant } from "@/components/event-detail/format-instant";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { PAGE_SIZE, Pager, pageOf } from "@/components/ui/pager";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import {
  ACTIVITY_AREAS,
  type ActivityArea,
  type ActivityEntry,
  listActivity,
} from "@/server/queries/archive";
import { requireUser } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("archive"))("sections.activity") };
}

const PATH = "/archiv/aktivitaet";

/**
 * Archiv › Aktivität: the company-wide log (who changed what, when) from the audit log, newest first, 50 per
 * page, narrowed by area. Every entry reads as German text: a wording for the action (`actions.*`), else the
 * kind of record plus what happened to it (`nouns.*` + `verbs.*`, "Kontakt angelegt"), else a plain
 * "Geändert" — never the raw code. "Betrifft" names the record and links to it. Owner and management only
 * (`audit:read`); everyone else sees why it is empty.
 */
export default async function ArchiveActivityPage({
  searchParams,
}: PageProps<"/archiv/aktivitaet">) {
  await requireUser();
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("archive.activity");
  const tTask = await getTranslations("tasks.status");
  const tPermit = await getTranslations("permitStatus");
  const tEvent = await getTranslations("status.event");
  const locale = await getLocale();

  if (!can(actor.role, "audit", "read")) {
    return (
      <ArchiveFrame section="activity">
        <Panel>
          <EmptyState icon={Lock} title={t("noAccess")} />
        </Panel>
      </ArchiveFrame>
    );
  }

  const areaParam = param(sp.bereich);
  const area = (ACTIVITY_AREAS as readonly string[]).includes(areaParam ?? "")
    ? (areaParam as ActivityArea)
    : undefined;
  const first = await listActivity(actor, { area, page: 1, size: PAGE_SIZE });
  const page = pageOf(param(sp.seite), first.total);
  const { rows, total } =
    page === 1 ? first : await listActivity(actor, { area, page, size: PAGE_SIZE });

  /** The new status in words, or null when there is no wording for it. */
  const statusText = (e: ActivityEntry): string | null => {
    const to = (e.diff as { to?: unknown } | null)?.to;
    if (typeof to !== "string") return null;
    if (e.entityType === "task" && tTask.has(to as never)) return tTask(to as never);
    if (e.entityType === "event" && tEvent.has(to as never)) return tEvent(to as never);
    if (e.entityType === "permit") {
      const key = to === "not_started" ? "missing" : to;
      if (tPermit.has(key as never)) return tPermit(key as never);
    }
    return null;
  };
  const describe = (e: ActivityEntry): string => {
    const status = statusText(e);
    const noun = t.has(`nouns.${e.entityType}` as never)
      ? t(`nouns.${e.entityType}` as never)
      : null;
    const verb = e.action.split(".").pop() ?? "";
    // "venue.zone.update" -> "venue_zone_update" (message keys have no dots).
    const key = `actions.${e.action.replaceAll(".", "_")}`;
    // Status wordings need the status; without one, fall through to "<noun>: Status geändert".
    if (t.has(key as never) && (verb !== "status" || status))
      return t(key as never, { status: status ?? "" } as never);
    if (noun && t.has(`verbs.${verb}` as never))
      return t(`verbs.${verb}` as never, { noun } as never);
    return noun ? t("changedNoun", { noun }) : t("other");
  };

  return (
    <ArchiveFrame section="activity">
      <form method="get" action={PATH} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="font-medium text-muted-foreground text-tiny" htmlFor="bereich">
            {t("area")}
          </label>
          <AutoSubmitSelect id="bereich" name="bereich" defaultValue={area ?? ""}>
            <option value="">{t("areaAll")}</option>
            {ACTIVITY_AREAS.map((a) => (
              <option key={a} value={a}>
                {t(`areas.${a}`)}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
      </form>

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={History} title={t("empty")} />
        ) : (
          <Table className="max-sm:block">
            <caption className="sr-only">{t("caption")}</caption>
            <THead className="max-sm:sr-only">
              <tr>
                <TH>{t("cols.when")}</TH>
                <TH>{t("cols.who")}</TH>
                <TH>{t("cols.what")}</TH>
                <TH>{t("cols.about")}</TH>
              </tr>
            </THead>
            <tbody className="max-sm:block">
              {rows.map((e) => {
                const target = e.target;
                return (
                  <TR
                    key={e.id}
                    className="max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2 max-sm:gap-y-0.5 max-sm:px-3 max-sm:py-2.5"
                  >
                    <TD className="tabular whitespace-nowrap text-muted-foreground text-small max-sm:h-auto max-sm:p-0">
                      {formatInstant(new Date(e.at), locale)}
                    </TD>
                    <TD className="whitespace-nowrap text-small max-sm:h-auto max-sm:p-0 max-sm:text-muted-foreground">
                      {e.actorName ?? t("system")}
                    </TD>
                    <TD className="text-small max-sm:h-auto max-sm:basis-full max-sm:p-0 max-sm:font-medium">
                      {describe(e)}
                    </TD>
                    <TD className="max-w-72 truncate text-small max-sm:h-auto max-sm:max-w-full max-sm:basis-full max-sm:p-0">
                      {target?.href ? (
                        <Link
                          href={target.href as never}
                          className="text-accent-soft-foreground hover:underline"
                        >
                          {target.label}
                        </Link>
                      ) : target ? (
                        target.label
                      ) : (
                        <span className="text-faint-foreground">{t("noTarget")}</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
      <Pager
        page={page}
        total={total}
        href={(n) => hrefWith(PATH, sp, { seite: n === 1 ? undefined : n })}
      />
    </ArchiveFrame>
  );
}
