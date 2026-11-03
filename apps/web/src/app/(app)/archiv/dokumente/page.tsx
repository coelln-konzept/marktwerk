import { FileText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArchiveFrame } from "@/components/archive/archive-frame";
import { kb } from "@/components/documents/document-list";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { PAGE_SIZE, Pager, pageOf } from "@/components/ui/pager";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { type ArchiveDocument, listArchiveDocuments } from "@/server/queries/archive";
import { requireUser } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("archive"))("sections.documents") };
}

const PATH = "/archiv/dokumente";
const KINDS = ["permit", "contract", "invoice", "receipt", "photo", "export", "other"] as const;

/** Where a document belongs, as a link to that record (the first link it has). */
function owner(d: ArchiveDocument, taskLabel: (title: string) => string) {
  if (d.taskId && d.taskTitle && d.eventId)
    return {
      href: `/veranstaltungen/${d.eventId}?aufgabe=${d.taskId}`,
      label: taskLabel(d.taskTitle),
    };
  if (d.eventId && d.eventName)
    return { href: `/veranstaltungen/${d.eventId}/dokumente`, label: d.eventName };
  if (d.permitId && d.permitTitle)
    return { href: `/genehmigungen?genehmigung=${d.permitId}`, label: d.permitTitle };
  if (d.venueId && d.venueName) return { href: `/orte/${d.venueId}`, label: d.venueName };
  if (d.vehicleId && d.vehicleName)
    return { href: `/firma/fahrzeuge/${d.vehicleId}`, label: d.vehicleName };
  return null;
}

/**
 * Archiv › Dokumente: every document the person may read (events, tasks, permits, venues, vehicles …), newest
 * first, 50 per page; a search over file name and description and a select for the kind. A file opens through
 * `/api/documents/<id>`; "Gehört zu" opens the record it hangs on.
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
  // First pass for the total, so `?seite=` past the end lands on the last page.
  const first = await listArchiveDocuments(actor, { q, kind, page: 1, size: PAGE_SIZE });
  const page = pageOf(param(sp.seite), first.total);
  const { rows, total } =
    page === 1 ? first : await listArchiveDocuments(actor, { q, kind, page, size: PAGE_SIZE });

  return (
    <ArchiveFrame section="documents">
      <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="q">
          {t("search")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("search")}
          className="min-h-(--control-h) w-72 rounded-lg border border-input bg-card px-3 max-sm:w-full"
        />
        <label className="sr-only" htmlFor="art">
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
      </form>

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("empty")}>
            {(q || kind) && (
              <Link
                href={PATH as never}
                className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
              >
                {t("reset")}
              </Link>
            )}
          </EmptyState>
        ) : (
          <Table>
            <caption className="sr-only">{t("caption")}</caption>
            <THead>
              <tr>
                <TH>{t("cols.file")}</TH>
                <TH>{t("cols.kind")}</TH>
                <TH>{t("cols.for")}</TH>
                <TH>{t("cols.by")}</TH>
                <TH className="text-right">{t("cols.size")}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((d) => {
                const target = owner(d, (title) => t("task", { title }));
                const date = formatDate(d.createdAt.slice(0, 10), locale);
                return (
                  <TR key={d.id}>
                    <TD className="max-w-80">
                      <a
                        href={`/api/documents/${d.id}`}
                        aria-label={t("open", { name: d.fileName })}
                        className="inline-flex max-w-full items-center gap-1.5 font-medium text-accent-soft-foreground hover:underline"
                      >
                        <FileText aria-hidden className="size-4 shrink-0" />
                        <span className="truncate">{d.fileName}</span>
                      </a>
                      {d.caption && (
                        <div className="truncate text-muted-foreground text-tiny">{d.caption}</div>
                      )}
                    </TD>
                    <TD className="text-foreground-2 text-small">{tKinds(d.kind as never)}</TD>
                    <TD className="max-w-64 truncate text-small">
                      {target ? (
                        <Link href={target.href as never} className="hover:underline">
                          {target.label}
                        </Link>
                      ) : (
                        <span className="text-faint-foreground">{t("none")}</span>
                      )}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-muted-foreground text-small">
                      {d.uploadedByName
                        ? t("byOn", { name: d.uploadedByName, date })
                        : t("onlyDate", { date })}
                    </TD>
                    <TD className="tabular text-right text-muted-foreground text-small">
                      {kb(d.sizeBytes)}
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
