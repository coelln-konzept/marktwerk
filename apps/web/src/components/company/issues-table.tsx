import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUpload } from "@/components/documents/upload";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { getActor } from "@/server/actor";
import type { IssueRow } from "@/server/queries/company";
import { type DocumentRow, listLinkedDocuments } from "@/server/queries/documents";
import { IssueActions } from "./issue-actions";
import { IssueSeverityBadge, IssueStatusBadge } from "./status";

/** Berlin date of an instant, so a late-evening report doesn't show the next day. */
const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);

/**
 * Defects of one or all vehicles; worst first. Status buttons only for people who may write.
 * Phones (< 640 px) get one card per defect with the status buttons and the photo upload in reach (UX-003:
 * field staff report defects from the phone, and the table cut "In Reparatur", "Behoben" and the photos off).
 */
export async function IssuesTable({
  rows,
  canWrite,
  showVehicle = true,
}: {
  rows: IssueRow[];
  canWrite: boolean;
  showVehicle?: boolean;
}) {
  const t = await getTranslations("company");
  const ti = await getTranslations("company.issues");
  const locale = await getLocale();
  // Photos of the defects: documents linked to the issue.
  const photos = await listLinkedDocuments(
    await getActor(),
    "vehicleIssueId",
    rows.map((r) => r.id),
  );

  const vehicleLink = (i: IssueRow) => (
    <Link href={`/firma/fahrzeuge/${i.vehicleId}` as never} className="hover:underline">
      {i.vehicleName}
      <span className="tabular ml-1.5 text-muted-foreground text-small">{i.vehiclePlate}</span>
    </Link>
  );
  const reported = (i: IssueRow) => (
    <>
      <span className="tabular">{formatDate(day(i.reportedAt), locale)}</span>{" "}
      <span className="text-muted-foreground">
        {i.reportedByName ? ti("reportedBy", { name: i.reportedByName }) : null}
      </span>
    </>
  );
  const details = (i: IssueRow, docs: DocumentRow[]) => (
    <>
      {i.description && (
        <span className="block whitespace-pre-line text-muted-foreground text-small">
          {i.description}
        </span>
      )}
      <DocumentList documents={docs} canWrite={canWrite} compact />
      {canWrite && (
        <DocumentUpload
          link={{ vehicleIssueId: i.id }}
          kind="photo"
          compact
          label={ti("addPhoto")}
          className="mt-1"
        />
      )}
      {i.status === "resolved" && i.resolvedAt && (
        <span className="block text-muted-foreground text-small">
          {ti("resolvedOn", { date: formatDate(day(i.resolvedAt), locale) })}
          {i.resolvedByName && ` ${ti("resolvedBy", { name: i.resolvedByName })}`}
          {i.resolutionNote && `: ${i.resolutionNote}`}
        </span>
      )}
    </>
  );

  return (
    <>
      <ul className="m-0 flex list-none flex-col p-0 sm:hidden">
        {rows.map((i) => (
          <li
            key={i.id}
            className="flex flex-col gap-2 border-border-subtle border-b px-4 py-3 last:border-b-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <IssueSeverityBadge severity={i.severity} />
              <IssueStatusBadge status={i.status} />
            </div>
            <div>
              <span className="font-semibold">{i.title}</span>
              {details(i, photos.get(i.id) ?? [])}
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
              {showVehicle && (
                <>
                  <dt className="text-muted-foreground">{ti("cols.vehicle")}</dt>
                  <dd className="m-0">{vehicleLink(i)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{ti("cols.reported")}</dt>
              <dd className="m-0">{reported(i)}</dd>
            </dl>
            {canWrite && <IssueActions issueId={i.id} title={i.title} status={i.status} touch />}
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <Table>
          <caption className="sr-only">{ti("caption")}</caption>
          <THead>
            <tr>
              <TH>{ti("cols.severity")}</TH>
              {showVehicle && <TH>{ti("cols.vehicle")}</TH>}
              <TH>{ti("cols.issue")}</TH>
              <TH>{ti("cols.reported")}</TH>
              <TH>{ti("cols.status")}</TH>
              {canWrite && (
                <TH>
                  <span className="sr-only">{ti("cols.actions")}</span>
                </TH>
              )}
            </tr>
          </THead>
          <tbody>
            {rows.map((i) => (
              <TR key={i.id}>
                <TD>
                  <IssueSeverityBadge severity={i.severity} />
                </TD>
                {showVehicle && <TD className="whitespace-nowrap">{vehicleLink(i)}</TD>}
                <TD className="max-w-96">
                  <span className="font-semibold">{i.title}</span>
                  {details(i, photos.get(i.id) ?? [])}
                </TD>
                <TD className="whitespace-nowrap text-small">
                  <span className="tabular block">{formatDate(day(i.reportedAt), locale)}</span>
                  <span className="block text-muted-foreground">
                    {i.reportedByName ? ti("reportedBy", { name: i.reportedByName }) : t("none")}
                  </span>
                </TD>
                <TD>
                  <IssueStatusBadge status={i.status} />
                </TD>
                {canWrite && (
                  <TD className="text-right">
                    <IssueActions issueId={i.id} title={i.title} status={i.status} />
                  </TD>
                )}
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
