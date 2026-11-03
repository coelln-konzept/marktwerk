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

type Diff = {
  to?: unknown;
  fileName?: unknown;
  name?: unknown;
  changes?: { name?: { to?: unknown } };
};

/** What an entry was about, as text and (when there is a page for it) a link. */
function about(e: ActivityEntry): { label: string; href?: string } | null {
  const diff = (e.diff && typeof e.diff === "object" ? e.diff : {}) as Diff;
  if (e.taskTitle)
    return {
      label: e.taskTitle,
      href: e.taskEventId ? `/veranstaltungen/${e.taskEventId}?aufgabe=${e.entityId}` : undefined,
    };
  if (e.permitTitle)
    return { label: e.permitTitle, href: `/genehmigungen?genehmigung=${e.entityId}` };
  if (e.eventName) return { label: e.eventName, href: `/veranstaltungen/${e.entityId}` };
  const text =
    typeof diff.fileName === "string"
      ? diff.fileName
      : typeof diff.changes?.name?.to === "string"
        ? diff.changes.name.to
        : typeof diff.name === "string"
          ? diff.name
          : null;
  return text ? { label: text } : null;
}

/**
 * Archiv › Aktivität: the company-wide log (who changed what, when) from the audit log, newest first, 50 per
 * page, narrowed by area. Owner and management only (`audit:read`); everyone else sees why it is empty.
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

  const statusText = (e: ActivityEntry) => {
    const to = (e.diff as { to?: unknown } | null)?.to;
    if (typeof to !== "string") return "?";
    if (e.entityType === "task" && tTask.has(to as never)) return tTask(to as never);
    if (e.entityType === "event" && tEvent.has(to as never)) return tEvent(to as never);
    if (e.entityType === "permit") {
      const key = to === "not_started" ? "missing" : to;
      if (tPermit.has(key as never)) return tPermit(key as never);
    }
    return to;
  };
  const describe = (e: ActivityEntry) => {
    const key = `actions.${e.action.replace(".", "_")}`;
    return t.has(key as never)
      ? t(key as never, { status: statusText(e) } as never)
      : t("other", { action: e.action });
  };

  return (
    <ArchiveFrame section="activity">
      <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="bereich">
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
      </form>

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={History} title={t("empty")} />
        ) : (
          <Table>
            <caption className="sr-only">{t("caption")}</caption>
            <THead>
              <tr>
                <TH>{t("cols.when")}</TH>
                <TH>{t("cols.who")}</TH>
                <TH>{t("cols.what")}</TH>
                <TH>{t("cols.about")}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((e) => {
                const target = about(e);
                return (
                  <TR key={e.id}>
                    <TD className="tabular whitespace-nowrap text-muted-foreground text-small">
                      {formatInstant(new Date(e.at), locale)}
                    </TD>
                    <TD className="whitespace-nowrap text-small">{e.actorName ?? t("system")}</TD>
                    <TD className="text-small">{describe(e)}</TD>
                    <TD className="max-w-72 truncate text-small">
                      {target?.href ? (
                        <Link
                          href={target.href as never}
                          className="text-accent-soft-foreground hover:underline"
                        >
                          {target.label}
                        </Link>
                      ) : (
                        (target?.label ?? "")
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
