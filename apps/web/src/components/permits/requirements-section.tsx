import { can } from "@marktwerk/core";
import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Panel, PanelBody } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, formatMonthDay } from "@/lib/format";
import { getActor } from "@/server/actor";
import { listVenueRequirements } from "@/server/queries/permits";
import { ApplyRequirementsButton } from "./apply-requirements-button";
import { RemoveRequirementButton } from "./remove-requirement-button";

/**
 * "Genehmigungen und Zustimmungen" on the venue page: which permits an event here needs, how far ahead,
 * when the authority collects and decides, and what it usually costs. New events create the missing
 * permits (and their tasks) from this. Self-contained: the venue page only renders
 * `<RequirementsSection venueId={…} />`. Create / edit are pages (more than eight fields).
 */
export async function RequirementsSection({ venueId }: { venueId: string }) {
  const actor = await getActor();
  if (!can(actor.role, "permit", "read")) return null;
  const t = await getTranslations("requirements");
  const tTypes = await getTranslations("permitTypes");
  const tCat = await getTranslations("permitCategories");
  const tCad = await getTranslations("permitCadences");
  const locale = await getLocale();
  const canWrite = can(actor.role, "permit", "write");
  const canDelete = can(actor.role, "permit", "delete");
  const rows = await listVenueRequirements(venueId);
  const none = <span className="text-faint-foreground">–</span>;

  return (
    <section aria-labelledby="requirements-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="requirements-title" className="font-semibold text-[15px]">
            {t("title")}
          </h2>
          <p className="max-w-[70ch] text-muted-foreground text-small">{t("description")}</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            {rows.length > 0 && <ApplyRequirementsButton venueId={venueId} />}
            <Link
              href={`/orte/${venueId}/genehmigungen/neu` as never}
              className={buttonVariants({ variant: "default" })}
            >
              <Plus aria-hidden />
              {t("add")}
            </Link>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <Panel>
          <PanelBody>
            <p className="font-medium">{t("empty")}</p>
            <p className="text-muted-foreground text-small">{t("emptyHint")}</p>
          </PanelBody>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <Table>
            <caption className="sr-only">{t("caption")}</caption>
            <THead>
              <tr>
                <TH>{t("cols.permit")}</TH>
                <TH>{t("cols.cadence")}</TH>
                <TH className="text-right">{t("cols.leadTime")}</TH>
                <TH>{t("cols.window")}</TH>
                <TH>{t("cols.decision")}</TH>
                <TH className="text-right">{t("cols.fee")}</TH>
                <TH>{t("cols.authority")}</TH>
                <TH>{t("cols.scope")}</TH>
                {(canWrite || canDelete) && (
                  <TH>
                    <span className="sr-only">{t("cols.actions")}</span>
                  </TH>
                )}
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const stickers = r.deliverables.stickers;
                return (
                  <TR key={r.id}>
                    <TD className="max-w-64">
                      <div className="font-semibold">{r.title}</div>
                      <div className="text-muted-foreground text-tiny">
                        {tCat(r.category)} · {tTypes(r.permitType)}
                        {stickers ? ` · ${t("stickers", { count: stickers })}` : ""}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">{tCad(r.cadence)}</TD>
                    <TD className="tabular whitespace-nowrap text-right">
                      {t("leadTime", { days: r.leadTimeDays })}
                    </TD>
                    <TD className="tabular whitespace-nowrap">
                      {r.submissionWindowStartMd && r.submissionWindowEndMd
                        ? t("window", {
                            from: formatMonthDay(r.submissionWindowStartMd, locale),
                            to: formatMonthDay(r.submissionWindowEndMd, locale),
                          })
                        : r.submissionWindowStartMd
                          ? t("windowFrom", {
                              from: formatMonthDay(r.submissionWindowStartMd, locale),
                            })
                          : r.submissionWindowEndMd
                            ? t("windowUntil", {
                                to: formatMonthDay(r.submissionWindowEndMd, locale),
                              })
                            : none}
                    </TD>
                    <TD className="tabular whitespace-nowrap">
                      {r.expectedDecisionMd
                        ? t("decisionAround", {
                            date: formatMonthDay(r.expectedDecisionMd, locale),
                          })
                        : none}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right">
                      {r.typicalFeeCents !== null ? formatMoney(r.typicalFeeCents, locale) : none}
                    </TD>
                    <TD>
                      {r.authorityContactId && r.authorityName ? (
                        <Link
                          href={`/kontakte?vorschau=${r.authorityContactId}` as never}
                          className="font-medium text-accent-soft-foreground hover:underline"
                        >
                          {r.authorityName}
                        </Link>
                      ) : (
                        none
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {r.eventTypeId
                        ? locale === "en"
                          ? r.eventTypeNameEn
                          : r.eventTypeNameDe
                        : t("scopeAll")}
                    </TD>
                    {(canWrite || canDelete) && (
                      <TD className="w-24 whitespace-nowrap text-right">
                        {canWrite && (
                          <Link
                            href={`/orte/${venueId}/genehmigungen/${r.id}` as never}
                            aria-label={t("edit", { title: r.title })}
                            className="inline-grid size-7 place-items-center rounded-md hover:bg-hover"
                          >
                            <Pencil aria-hidden className="size-4" />
                          </Link>
                        )}
                        {canDelete && <RemoveRequirementButton id={r.id} title={r.title} />}
                      </TD>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Panel>
      )}
    </section>
  );
}
