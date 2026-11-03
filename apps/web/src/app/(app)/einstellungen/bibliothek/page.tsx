import { can } from "@marktwerk/core";
import { Eye, FilePen, GitBranch, ListChecks, Pencil, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PresetStatusBadge } from "@/components/catalogue/preset-status";
import { PresetVorschau } from "@/components/catalogue/preset-vorschau";
import { SettingsHeader } from "@/components/settings/settings-header";
import { Page } from "@/components/shell/page";
import { CreateMasterButton } from "@/components/templates/create-master-button";
import { dateOfInstant } from "@/components/templates/labels";
import { NewTemplateButton } from "@/components/templates/template-dialogs";
import { TimelineTable } from "@/components/templates/timeline-table";
import { buttonVariants } from "@/components/ui/button";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { MarketMarker } from "@/components/ui/market-marker";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowActions, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { rruleText } from "@/lib/rrule-text";
import { hrefWith, param } from "@/lib/url";
import { cn } from "@/lib/utils";
import { listPresets } from "@/server/queries/presets";
import {
  getMasterTemplate,
  getTemplateOptions,
  getTemplateSummaries,
  listEventTemplates,
} from "@/server/queries/templates";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("tabs.library")} · ${t("title")}` };
}

const PATH = "/einstellungen/bibliothek";

/**
 * Einstellungen → Bibliothek: the Grundvorlage (master task template every new market starts from), the
 * markets (presets, each with its own task template) and the older per-type templates. Needs
 * template:read; editing needs template:write. `?vorschau=<market id>` opens the market's Vorschau.
 */
export default async function LibraryPage({
  searchParams,
}: PageProps<"/einstellungen/bibliothek">) {
  const user = await requirePermission("template", "read");
  const canWrite = can(user.role, "template", "write");
  const sp = await searchParams;
  const [t, tSettings, tNav, tTpl, locale] = await Promise.all([
    getTranslations("library"),
    getTranslations("settings"),
    getTranslations("nav"),
    getTranslations("templates"),
    getLocale(),
  ]);
  const [master, markets, templates, options] = await Promise.all([
    getMasterTemplate(),
    listPresets(),
    listEventTemplates(),
    getTemplateOptions(),
  ]);
  const summaries = await getTemplateSummaries(
    markets.flatMap((m) => [
      ...(m.ownTemplate ? [m.ownTemplate.id] : []),
      ...m.sharedTemplates.map((x) => x.id),
    ]),
  );
  // Templates that markets actually use are the working ones; the rest is parked in a closed section.
  const inUse = templates.filter((tpl) => tpl.presets.length > 0);
  const unused = templates.filter((tpl) => tpl.presets.length === 0);
  const templateMeta = (id: string, kind: "own" | "shared") => {
    const sum = summaries.get(id);
    return t("markets.tplMeta", {
      kind: t(kind === "own" ? "markets.tplOwn" : "markets.tplShared"),
      version: sum?.version ? `v${sum.version}` : t("markets.tplDraft"),
      count: sum?.itemCount ?? 0,
    });
  };
  const vorschauId = param(sp.vorschau);
  const selected = markets.find((m) => m.id === vorschauId);
  const shown = master?.published ?? master?.draft ?? null;

  return (
    <Page
      crumbs={[
        { label: tNav("settings"), href: "/einstellungen/firma" },
        { label: tSettings("tabs.library") },
      ]}
    >
      <SettingsHeader />
      <p className="m-0 text-muted-foreground text-small">{t("subtitle")}</p>

      <Panel aria-labelledby="library-master-title">
        <PanelHeader>
          <PanelTitle id="library-master-title">{t("master.title")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          {master ? (
            <>
              <p className="m-0 max-w-3xl text-foreground-2">{t("master.description")}</p>
              <div className="flex flex-wrap items-center gap-2">
                {master.published ? (
                  <StatusBadge tone="ok" icon={GitBranch}>
                    {t("master.published", {
                      version: master.published.version,
                      date: master.published.publishedAt
                        ? formatDate(dateOfInstant(master.published.publishedAt), locale)
                        : "",
                    })}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral" icon={GitBranch} outline>
                    {t("master.notPublished")}
                  </StatusBadge>
                )}
                {master.draft && (
                  <StatusBadge tone="info" icon={FilePen} outline>
                    {t("master.draft", { version: master.draft.version })}
                  </StatusBadge>
                )}
                <span className="text-muted-foreground text-small">
                  {t("master.items", { count: shown?.itemCount ?? 0 })}
                </span>
              </div>
              <div>
                <Link
                  href={`/vorlagen/ablauf/${master.id}` as never}
                  className={buttonVariants({ variant: canWrite ? "default" : "outline" })}
                >
                  {canWrite ? <Pencil aria-hidden /> : <Eye aria-hidden />}
                  {canWrite ? t("master.edit") : t("master.view")}
                </Link>
              </div>
              <p className="m-0 text-muted-foreground text-small">{t("master.rule")}</p>
            </>
          ) : (
            <EmptyState icon={ListChecks} title={t("master.none")} hint={t("master.noneHint")}>
              {canWrite && <CreateMasterButton />}
            </EmptyState>
          )}
        </PanelBody>
      </Panel>

      {inUse.length > 0 && (
        <section aria-labelledby="library-inuse-title" className="flex flex-col gap-2">
          <div>
            <h2 id="library-inuse-title" className="m-0 font-semibold text-[15px]">
              {t("inUse.title")}
            </h2>
            <p className="m-0 max-w-3xl text-muted-foreground text-small">{t("inUse.hint")}</p>
          </div>
          <TimelineTable templates={inUse} />
        </section>
      )}

      <Panel aria-labelledby="library-markets-title" className="overflow-hidden">
        <PanelHeader>
          <PanelTitle id="library-markets-title">{t("markets.title")}</PanelTitle>
          <span className="text-muted-foreground text-small">
            {t("markets.count", {
              count: markets.length,
              active: markets.filter((m) => m.active).length,
            })}
          </span>
        </PanelHeader>
        {markets.length === 0 ? (
          <EmptyState icon={Store} title={t("markets.empty")} hint={t("markets.emptyHint")} />
        ) : (
          <KeyboardRows>
            <Table>
              <caption className="sr-only">{t("markets.caption")}</caption>
              <THead>
                <tr>
                  <TH>{tTpl("cols.name")}</TH>
                  <TH>{tTpl("cols.type")}</TH>
                  <TH>{tTpl("cols.venue")}</TH>
                  <TH>{tTpl("cols.rhythm")}</TH>
                  <TH>{t("markets.cols.tasks")}</TH>
                  <TH>{tTpl("cols.status")}</TH>
                  <TH>
                    <span className="sr-only">{tTpl("cols.actions")}</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {markets.map((m) => {
                  const peek = hrefWith(PATH, sp, { vorschau: m.id });
                  return (
                    <TR
                      key={m.id}
                      tabIndex={0}
                      data-row
                      data-peek={peek}
                      aria-selected={vorschauId === m.id}
                      className={cn(
                        "outline-hidden focus-visible:bg-selected",
                        !m.active && "text-muted-foreground",
                      )}
                    >
                      <TD>
                        <span className="flex items-center gap-2">
                          <MarketMarker color={m.color} typeKey={m.typeKey} />
                          <Link
                            href={peek as never}
                            scroll={false}
                            tabIndex={-1}
                            className="whitespace-nowrap font-semibold text-accent-soft-foreground hover:underline"
                          >
                            {m.name}
                          </Link>
                        </span>
                      </TD>
                      <TD>
                        <EventTypeTag typeKey={m.typeKey}>
                          {locale === "en" ? m.typeNameEn : m.typeNameDe}
                        </EventTypeTag>
                      </TD>
                      <TD className="max-w-48 truncate" title={m.venueName}>
                        <Link
                          href={`/orte/${m.venueId}` as never}
                          tabIndex={-1}
                          className="hover:underline"
                        >
                          {m.venueName}
                        </Link>
                      </TD>
                      <TD className="max-w-60">{rruleText(m.rrule, locale)}</TD>
                      <TD className="min-w-44">
                        {m.ownTemplate ? (
                          <>
                            <Link
                              href={`/vorlagen/ablauf/${m.ownTemplate.id}` as never}
                              tabIndex={-1}
                              className="font-medium text-accent-soft-foreground hover:underline"
                            >
                              {t("markets.tplOwn")}
                            </Link>
                            <span className="block text-muted-foreground text-tiny">
                              {templateMeta(m.ownTemplate.id, "own")}
                            </span>
                          </>
                        ) : m.sharedTemplates.length > 0 ? (
                          m.sharedTemplates.map((x) => (
                            <span key={x.id} className="block">
                              <Link
                                href={`/vorlagen/ablauf/${x.id}` as never}
                                tabIndex={-1}
                                className="font-medium text-accent-soft-foreground hover:underline"
                              >
                                {x.name}
                              </Link>
                              <span className="block text-muted-foreground text-tiny">
                                {templateMeta(x.id, "shared")}
                              </span>
                            </span>
                          ))
                        ) : (
                          <span className="text-faint-foreground">–</span>
                        )}
                      </TD>
                      <TD>
                        <PresetStatusBadge active={m.active} />
                      </TD>
                      <TD className="w-24">
                        <RowActions>
                          <Link
                            href={peek as never}
                            scroll={false}
                            tabIndex={-1}
                            aria-label={tTpl("preview", { name: m.name })}
                            className="grid size-7 place-items-center rounded-md hover:bg-hover"
                          >
                            <Eye className="size-4" />
                          </Link>
                          {m.ownTemplate && (
                            <Link
                              href={`/vorlagen/ablauf/${m.ownTemplate.id}` as never}
                              tabIndex={-1}
                              aria-label={t("markets.tasksLabel", { name: m.name })}
                              className="grid size-7 place-items-center rounded-md hover:bg-hover"
                            >
                              <ListChecks className="size-4" />
                            </Link>
                          )}
                          {canWrite && (
                            <Link
                              href={`/vorlagen/${m.id}` as never}
                              tabIndex={-1}
                              aria-label={tTpl("editLabel", { name: m.name })}
                              className="grid size-7 place-items-center rounded-md hover:bg-hover"
                            >
                              <Pencil className="size-4" />
                            </Link>
                          )}
                        </RowActions>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </KeyboardRows>
        )}
        <p className="m-0 border-border-subtle border-t px-4 py-3 text-muted-foreground text-tiny">
          {t("markets.hint")} {tTpl("keys")}
        </p>
      </Panel>

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold text-[15px]">{t("others.title")}</span>
          <span className="text-muted-foreground text-small">
            {t("others.summary", { count: unused.length })}
          </span>
        </summary>
        <div className="flex flex-col gap-3 border-border-subtle border-t p-4">
          <p className="m-0 max-w-3xl text-muted-foreground text-small">{t("others.hint")}</p>
          {canWrite && (
            <div>
              <NewTemplateButton types={options.types} />
            </div>
          )}
          <TimelineTable templates={unused} />
        </div>
      </details>

      {selected && (
        <PresetVorschau
          preset={selected}
          closeHref={hrefWith(PATH, sp, { vorschau: undefined })}
          canEdit={canWrite}
        />
      )}
    </Page>
  );
}
