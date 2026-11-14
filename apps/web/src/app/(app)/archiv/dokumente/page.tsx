import { FileText, RotateCcw, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArchiveFrame } from "@/components/archive/archive-frame";
import { LiveSearch } from "@/components/archive/live-search";
import { RestoreDocumentButton } from "@/components/archive/restore-document-button";
import { kb } from "@/components/documents/document-list";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { PAGE_SIZE, Pager, pageOf } from "@/components/ui/pager";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateRangeYear } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import {
  type ArchiveDocument,
  archiveDocumentFacets,
  listArchiveDocuments,
} from "@/server/queries/archive";
import { requireUser } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("archive"))("sections.documents") };
}

const PATH = "/archiv/dokumente";
const KINDS = ["permit", "contract", "invoice", "receipt", "photo", "export", "other"] as const;
const UUID = /^[0-9a-f-]{36}$/i;
/** `formatDateRangeYear` compares with "today" to drop the running year; in the Archiv the year always shows. */
const ALWAYS_YEAR = "0000-01-01";

type Owner = { href: string; label: string; detail?: string };

/** Where a document belongs, as a link to that record (the first link it has), with the event's dates. */
function owner(
  d: ArchiveDocument,
  labels: { task: (title: string) => string; season: (season: number) => string },
  locale: string,
): Owner | null {
  const eventDate =
    d.eventStartsOn && d.eventEndsOn
      ? formatDateRangeYear(d.eventStartsOn, d.eventEndsOn, locale, ALWAYS_YEAR)
      : undefined;
  if (d.taskId && d.taskTitle && d.eventId)
    return {
      href: `/veranstaltungen/${d.eventId}?aufgabe=${d.taskId}`,
      label: labels.task(d.taskTitle),
      detail: [d.eventName, eventDate].filter(Boolean).join(" · "),
    };
  if (d.eventId && d.eventName)
    return {
      href: `/veranstaltungen/${d.eventId}/dokumente`,
      label: d.eventName,
      detail: eventDate,
    };
  if (d.permitId && d.permitTitle)
    return {
      href: `/genehmigungen?genehmigung=${d.permitId}`,
      label: d.permitTitle,
      detail: d.permitSeason ? labels.season(d.permitSeason) : undefined,
    };
  if (d.venueId && d.venueName) return { href: `/orte/${d.venueId}`, label: d.venueName };
  if (d.vehicleId && d.vehicleName)
    return { href: `/firma/fahrzeuge/${d.vehicleId}`, label: d.vehicleName };
  return null;
}

/**
 * Archiv › Dokumente: every document the person may read (events, tasks, permits, venues, vehicles …), newest
 * first, 50 per page. The search (live, in `?q=`) covers file name, description and what the file belongs to
 * (event, Markt, task, permit, Ort, vehicle); Art, Markt and Jahr narrow it. A file opens through
 * `/api/documents/<id>`; "Gehört zu" opens the record it hangs on and shows the event's dates.
 * `?entfernt=1` lists the removed documents with "Wiederherstellen".
 */
export default async function ArchiveDocumentsPage({
  searchParams,
}: PageProps<"/archiv/dokumente">) {
  await requireUser();
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("archive.documents");
  const tKinds = await getTranslations("documents.kinds");
  const locale = await getLocale();
  const q = param(sp.q)?.slice(0, 100);
  const kindParam = param(sp.art);
  const kind = (KINDS as readonly string[]).includes(kindParam ?? "") ? kindParam : undefined;
  const removed = param(sp.entfernt) === "1";
  const facets = await archiveDocumentFacets(actor);
  const marktParam = param(sp.markt);
  const presetId =
    marktParam && UUID.test(marktParam) && facets.presets.some((p) => p.id === marktParam)
      ? marktParam
      : undefined;
  const yearParam = Number(param(sp.jahr));
  const year = facets.years.includes(yearParam) ? yearParam : undefined;
  const filters = { q, kind, presetId, year, removed };
  // First pass for the total, so `?seite=` past the end lands on the last page.
  const first = await listArchiveDocuments(actor, { ...filters, page: 1, size: PAGE_SIZE });
  const page = pageOf(param(sp.seite), first.total);
  const { rows, total } =
    page === 1 ? first : await listArchiveDocuments(actor, { ...filters, page, size: PAGE_SIZE });
  const filtered = Boolean(q || kind || presetId || year);
  const resetHref = removed ? `${PATH}?entfernt=1` : PATH;
  const labels = {
    task: (title: string) => t("task", { title }),
    season: (season: number) => t("season", { season }),
  };

  return (
    <ArchiveFrame section="documents">
      <form method="get" action={PATH} className="flex flex-wrap items-end gap-x-2 gap-y-3">
        {removed && <input type="hidden" name="entfernt" value="1" />}
        <div className="flex flex-col gap-1 max-sm:basis-full">
          <label className="font-medium text-muted-foreground text-tiny" htmlFor="q">
            {t("searchLabel")}
          </label>
          <LiveSearch
            id="q"
            defaultValue={q}
            placeholder={t("search")}
            className="w-72 max-sm:w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-medium text-muted-foreground text-tiny" htmlFor="art">
            {t("kind")}
          </label>
          <AutoSubmitSelect id="art" name="art" defaultValue={kind ?? ""}>
            <option value="">{t("kindAll")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {tKinds(k)}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        {facets.presets.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1">
            <label className="font-medium text-muted-foreground text-tiny" htmlFor="markt">
              {t("market")}
            </label>
            <AutoSubmitSelect
              id="markt"
              name="markt"
              defaultValue={presetId ?? ""}
              className="max-w-64"
            >
              <option value="">{t("marketAll")}</option>
              {facets.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>
        )}
        {facets.years.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="font-medium text-muted-foreground text-tiny" htmlFor="jahr">
              {t("year")}
            </label>
            <AutoSubmitSelect id="jahr" name="jahr" defaultValue={year ? String(year) : ""}>
              <option value="">{t("yearAll")}</option>
              {facets.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>
        )}
        <Link
          href={
            (removed
              ? hrefWith(PATH, sp, { entfernt: undefined, seite: undefined })
              : hrefWith(PATH, sp, { entfernt: 1, seite: undefined })) as never
          }
          className="inline-flex min-h-(--control-h) items-center gap-1.5 rounded-lg border border-input bg-card px-3 font-medium text-small hover:bg-hover sm:ml-auto"
        >
          {removed ? (
            <>
              <FileText aria-hidden className="size-4 text-muted-foreground" />
              {t("showLive")}
            </>
          ) : (
            <>
              <RotateCcw aria-hidden className="size-4 text-muted-foreground" />
              {t("showRemoved")}
            </>
          )}
        </Link>
      </form>

      {removed && <p className="text-muted-foreground text-small">{t("removedHint")}</p>}
      <p className="text-muted-foreground text-small" aria-live="polite">
        {removed ? t("countRemoved", { count: total }) : t("count", { count: total })}
      </p>

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={SearchX} title={removed ? t("emptyRemoved") : t("empty")}>
            {filtered && (
              <Link
                href={resetHref as never}
                className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
              >
                {t("reset")}
              </Link>
            )}
          </EmptyState>
        ) : (
          <Table className="max-sm:block">
            <caption className="sr-only">{removed ? t("captionRemoved") : t("caption")}</caption>
            <THead className="max-sm:sr-only">
              <tr>
                <TH>{t("cols.file")}</TH>
                <TH>{t("cols.kind")}</TH>
                <TH>{t("cols.for")}</TH>
                <TH>{removed ? t("cols.removed") : t("cols.by")}</TH>
                <TH className="text-right">{removed ? t("cols.actions") : t("cols.size")}</TH>
              </tr>
            </THead>
            <tbody className="max-sm:block">
              {rows.map((d) => {
                const target = owner(d, labels, locale);
                const date = formatDate(d.createdAt.slice(0, 10), locale);
                const removedOn = d.archivedAt ? formatDate(d.archivedAt.slice(0, 10), locale) : "";
                return (
                  <TR
                    key={d.id}
                    className="max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2 max-sm:gap-y-1 max-sm:px-3 max-sm:py-2.5"
                  >
                    <TD className="max-w-80 max-sm:h-auto max-sm:max-w-full max-sm:basis-full max-sm:p-0">
                      {removed ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 font-medium">
                          <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{d.fileName}</span>
                        </span>
                      ) : (
                        <a
                          href={`/api/documents/${d.id}`}
                          aria-label={t("open", { name: d.fileName })}
                          className="inline-flex max-w-full items-center gap-1.5 font-medium text-accent-soft-foreground hover:underline"
                        >
                          <FileText aria-hidden className="size-4 shrink-0" />
                          <span className="truncate">{d.fileName}</span>
                        </a>
                      )}
                      {d.caption && (
                        <div className="truncate text-muted-foreground text-tiny">{d.caption}</div>
                      )}
                    </TD>
                    <TD className="text-foreground-2 text-small max-sm:h-auto max-sm:p-0">
                      {tKinds(d.kind as never)}
                    </TD>
                    <TD className="max-w-72 text-small max-sm:h-auto max-sm:max-w-full max-sm:min-w-0 max-sm:flex-1 max-sm:p-0">
                      {target ? (
                        <>
                          <Link
                            href={target.href as never}
                            className="block truncate hover:underline"
                          >
                            {target.label}
                          </Link>
                          {target.detail && (
                            <span className="tabular block truncate text-muted-foreground text-tiny">
                              {target.detail}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-faint-foreground">{t("none")}</span>
                      )}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-muted-foreground text-small max-sm:h-auto max-sm:basis-full max-sm:p-0">
                      {removed
                        ? d.archivedByName
                          ? t("byOn", { name: d.archivedByName, date: removedOn })
                          : t("onlyDate", { date: removedOn })
                        : d.uploadedByName
                          ? t("byOn", { name: d.uploadedByName, date })
                          : t("onlyDate", { date })}
                    </TD>
                    <TD className="tabular text-right text-muted-foreground text-small max-sm:h-auto max-sm:p-0">
                      {removed
                        ? d.canWrite && <RestoreDocumentButton id={d.id} fileName={d.fileName} />
                        : kb(d.sizeBytes)}
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
