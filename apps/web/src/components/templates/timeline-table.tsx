import { FilePen, GitBranch, ListChecks, Pencil } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { dateOfInstant } from "@/components/templates/labels";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowActions, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { EventTemplateRow } from "@/server/queries/templates";

/** The per-type timeline templates ("Weitere Ablaufvorlagen" in the Bibliothek) with their versions. */
export async function TimelineTable({ templates }: { templates: EventTemplateRow[] }) {
  const t = await getTranslations("taskTemplates");
  const locale = await getLocale();

  return (
    <Panel className="overflow-hidden">
      {templates.length === 0 ? (
        <EmptyState icon={ListChecks} title={t("list.empty")} hint={t("list.emptyHint")} />
      ) : (
        <Table>
          <caption className="sr-only">{t("list.caption")}</caption>
          <THead>
            <tr>
              <TH>{t("list.cols.name")}</TH>
              <TH>{t("list.cols.type")}</TH>
              <TH>{t("list.cols.version")}</TH>
              <TH className="text-right">{t("list.cols.items")}</TH>
              <TH>{t("list.cols.presets")}</TH>
              <TH>
                <span className="sr-only">{t("list.cols.actions")}</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {templates.map((tpl) => {
              const href = `/vorlagen/ablauf/${tpl.id}`;
              const shown = tpl.published ?? tpl.draft;
              return (
                <TR key={tpl.id}>
                  <TD>
                    <Link
                      href={href as never}
                      className="font-semibold text-accent-soft-foreground hover:underline"
                    >
                      {tpl.name}
                    </Link>
                    {tpl.description && (
                      <p
                        className="max-w-80 truncate text-muted-foreground text-tiny"
                        title={tpl.description}
                      >
                        {tpl.description}
                      </p>
                    )}
                  </TD>
                  <TD>
                    {tpl.typeKey ? (
                      <EventTypeTag typeKey={tpl.typeKey}>
                        {locale === "en" ? tpl.typeNameEn : tpl.typeNameDe}
                      </EventTypeTag>
                    ) : (
                      <span className="text-muted-foreground">{t("list.anyType")}</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {tpl.published ? (
                        <StatusBadge tone="ok" icon={GitBranch}>
                          {t("list.published", {
                            version: tpl.published.version,
                            date: tpl.published.publishedAt
                              ? formatDate(dateOfInstant(tpl.published.publishedAt), locale)
                              : "",
                          })}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral" icon={GitBranch} outline>
                          {t("list.notPublished")}
                        </StatusBadge>
                      )}
                      {tpl.draft && (
                        <StatusBadge tone="info" icon={FilePen} outline>
                          {t("list.draft", { version: tpl.draft.version })}
                        </StatusBadge>
                      )}
                    </div>
                  </TD>
                  <TD className="tabular text-right">{shown?.itemCount ?? 0}</TD>
                  <TD className="max-w-72">
                    {tpl.presets.length === 0 ? (
                      <span className="text-muted-foreground">{t("list.noPresets")}</span>
                    ) : (
                      <>
                        <span className="block font-medium">
                          {t("list.usedBy", { count: tpl.presets.length })}
                        </span>
                        <span
                          className="line-clamp-2 text-muted-foreground text-tiny"
                          title={tpl.presets.map((p) => p.name).join(", ")}
                        >
                          {tpl.presets.map((p) => p.name).join(", ")}
                        </span>
                      </>
                    )}
                  </TD>
                  <TD className="w-12">
                    <RowActions>
                      <Link
                        href={href as never}
                        tabIndex={-1}
                        aria-label={t("list.open", { name: tpl.name })}
                        className="grid size-7 place-items-center rounded-md hover:bg-hover"
                      >
                        <Pencil className="size-4" />
                      </Link>
                    </RowActions>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
