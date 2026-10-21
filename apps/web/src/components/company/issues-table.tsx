import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUpload } from "@/components/documents/upload";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { getActor } from "@/server/actor";
import type { IssueRow } from "@/server/queries/company";
import { listLinkedDocuments } from "@/server/queries/documents";
import { IssueActions } from "./issue-actions";
import { IssueSeverityBadge, IssueStatusBadge } from "./status";

/** Defects of one or all vehicles; worst first. Status buttons only for people who may write. */
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
  // Berlin dates of the instants, so a late-evening report doesn't show the next day.
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);

  return (
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
            {showVehicle && (
              <TD className="whitespace-nowrap">
                <Link href={`/firma/fahrzeuge/${i.vehicleId}` as never} className="hover:underline">
                  {i.vehicleName}
                  <span className="tabular ml-1.5 text-muted-foreground text-small">
                    {i.vehiclePlate}
                  </span>
                </Link>
              </TD>
            )}
            <TD className="max-w-96">
              <span className="font-semibold">{i.title}</span>
              {i.description && (
                <span className="block whitespace-pre-line text-muted-foreground text-small">
                  {i.description}
                </span>
              )}
              <DocumentList documents={photos.get(i.id) ?? []} canWrite={canWrite} compact />
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
  );
}
