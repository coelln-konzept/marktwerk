import { can } from "@marktwerk/core";
import { FilePen, GitBranch, ListChecks, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { dateOfInstant } from "@/components/templates/labels";
import { NewTemplateButton } from "@/components/templates/template-dialogs";
import { TemplateTabs } from "@/components/templates/template-tabs";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowActions, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { getTemplateOptions, listEventTemplates } from "@/server/queries/templates";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("taskTemplates"))("list.title") };
}

/** Tab "Ablaufvorlagen" of /vorlagen: the timeline templates with their versions. */
export default async function TimelineTemplatesPage() {
  const user = await requirePermission("template", "read");
  const canWrite = can(user.role, "template", "write");
  const t = await getTranslations("taskTemplates");
  const tList = await getTranslations("templates");
  const locale = await getLocale();
  const [templates, options] = await Promise.all([listEventTemplates(), getTemplateOptions()]);

  return (
    <Page crumbs={[{ label: tList("title"), href: "/vorlagen" }, { label: t("list.title") }]}>
      <PageHeader
        title={tList("title")}
        subtitle={t("list.subtitle", { count: templates.length })}
        actions={canWrite && <NewTemplateButton types={options.types} />}
      />

      <TemplateTabs current="timelines" />

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
                        <span
                          className="line-clamp-2"
                          title={tpl.presets.map((p) => p.name).join(", ")}
                        >
                          {tpl.presets.map((p) => p.name).join(", ")}
                        </span>
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
      <p className="text-muted-foreground text-tiny">{t("list.hint")}</p>
    </Page>
  );
}
