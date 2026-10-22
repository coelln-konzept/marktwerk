import { addDays, can, weekday } from "@marktwerk/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { ApplySheet } from "@/components/templates/apply-sheet";
import { ItemDrawer } from "@/components/templates/item-drawer";
import { ItemGrid } from "@/components/templates/item-grid";
import { dateOfInstant, PHASES } from "@/components/templates/labels";
import { PresetLinks } from "@/components/templates/preset-links";
import { TemplateSettingsButton } from "@/components/templates/template-dialogs";
import { TimelineRuler } from "@/components/templates/timeline-ruler";
import type { ItemView } from "@/components/templates/types";
import { VersionBar } from "@/components/templates/version-bar";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { todayIn } from "@/lib/format";
import { param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { db } from "@/server/db";
import {
  getTemplateForEditor,
  getTemplateOptions,
  getVersionItems,
} from "@/server/queries/templates";
import { loadDueDefaults } from "@/server/services/task-instantiation";
import {
  previewTemplateApplication,
  TemplateApplyError,
} from "@/server/services/template-propagation";
import { itemFields } from "@/server/services/templates";
import { requirePermission } from "@/server/session";

export async function generateMetadata({
  params,
}: PageProps<"/vorlagen/ablauf/[id]">): Promise<Metadata> {
  const template = await getTemplateForEditor((await params).id);
  return { title: template?.name ?? (await getTranslations("taskTemplates"))("list.title") };
}

/** Next Saturday at least four weeks ahead: the sample event day for the due-date example. */
function sampleEventDay(today: string): string {
  const day = addDays(today, 28);
  return addDays(day, (6 - weekday(day) + 7) % 7);
}

/**
 * Timeline template editor (`/vorlagen/ablauf/[id]`): version chips, timeline ruler, the grid of rows and the
 * links to presets. Only the draft is editable (template:write); published versions are immutable.
 * Overlays are addressed by search params: `?v=<version>`, `?zeile=<key>|neu`, `?anwenden=1`.
 */
export default async function TemplateEditorPage({
  params,
  searchParams,
}: PageProps<"/vorlagen/ablauf/[id]">) {
  const user = await requirePermission("template", "read");
  const canWrite = can(user.role, "template", "write");
  const { id } = await params;
  const sp = await searchParams;
  const template = await getTemplateForEditor(id);
  if (!template) notFound();
  const t = await getTranslations("taskTemplates");
  const tList = await getTranslations("templates");
  const locale = await getLocale();

  // Default: the draft if there is one (work in progress), otherwise the published version.
  const wanted = Number(param(sp.v));
  const selected =
    template.versions.find((v) => v.version === wanted) ??
    template.versions.find((v) => v.status === "draft") ??
    template.versions.find((v) => v.status === "published") ??
    template.versions[0];
  if (!selected) notFound();
  const editable = canWrite && selected.status === "draft";

  const [rows, options, defaults] = await Promise.all([
    getVersionItems(selected.id),
    getTemplateOptions(),
    loadDueDefaults(db),
  ]);
  const items: ItemView[] = rows.map((row) => ({ key: row.stableKey, ...itemFields(row) }));
  const roles = options.roles.map((r) => ({
    id: r.id,
    name: locale === "en" ? r.nameEn : r.nameDe,
  }));
  const eventTypes = options.types.map((type) => ({
    key: type.key,
    name: locale === "en" ? type.nameEn : type.nameDe,
  }));

  const base = `/vorlagen/ablauf/${template.id}`;
  const baseHref = `${base}?v=${selected.version}`;
  const zeile = param(sp.zeile);
  const drawerItem = zeile && zeile !== "neu" ? items.find((i) => i.key === zeile) : undefined;
  const newPhase = PHASES.find((p) => p === param(sp.phase)) ?? "pre";
  const drawerOpen = Boolean(drawerItem) || (editable && zeile === "neu");
  const lastOfPhase = items.filter((i) => i.phase === newPhase).at(-1)?.key ?? null;

  let apply = null;
  if (canWrite && param(sp.anwenden) === "1" && selected.status === "published") {
    const actor = await getActor();
    try {
      apply = await previewTemplateApplication(actor, template.id);
    } catch (error) {
      if (!(error instanceof TemplateApplyError)) throw error;
    }
  }

  const total = items.reduce((sum, i) => sum + i.estimateMinutes, 0);
  const typeName = locale === "en" ? template.typeNameEn : template.typeNameDe;

  return (
    <Page
      wide
      crumbs={[
        { label: tList("title"), href: "/vorlagen" },
        { label: t("list.title"), href: "/vorlagen/ablauf" },
        { label: template.name },
      ]}
    >
      <PageHeader
        title={template.name}
        eyebrow={
          <Link href={"/vorlagen/ablauf" as never} className="hover:underline">
            {t("editor.back")}
          </Link>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {template.typeKey ? (
              <EventTypeTag typeKey={template.typeKey}>{typeName}</EventTypeTag>
            ) : (
              <span>{t("list.anyType")}</span>
            )}
            <span>
              {t("editor.summary", {
                count: items.length,
                hours: Math.round((total / 60) * 10) / 10,
              })}
            </span>
            {template.description && <span>· {template.description}</span>}
          </span>
        }
        actions={
          canWrite && (
            <TemplateSettingsButton
              template={{
                id: template.id,
                name: template.name,
                description: template.description,
                eventTypeId: template.eventTypeId,
              }}
              types={options.types.map((type) => ({
                id: type.id,
                nameDe: type.nameDe,
                nameEn: type.nameEn,
              }))}
            />
          )
        }
      />

      <VersionBar
        templateId={template.id}
        versions={template.versions.map((v) => ({
          id: v.id,
          version: v.version,
          status: v.status,
          publishedOn: v.publishedAt ? dateOfInstant(v.publishedAt) : null,
          itemCount: v.itemCount,
        }))}
        selected={{
          id: selected.id,
          version: selected.version,
          status: selected.status,
          publishedOn: selected.publishedAt ? dateOfInstant(selected.publishedAt) : null,
          itemCount: selected.itemCount,
        }}
        canWrite={canWrite}
      />

      {items.length > 0 && (
        <Panel>
          <PanelBody>
            <TimelineRuler
              items={items.map((i) => ({
                key: i.key,
                title: i.title,
                phase: i.phase,
                offsetDays: i.offsetDays,
                anchorKey: i.anchorKey,
              }))}
              hrefFor={(key) => `${baseHref}&zeile=${encodeURIComponent(key)}`}
            />
          </PanelBody>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader>
          <PanelTitle>{t("grid.title")}</PanelTitle>
          <span className="text-muted-foreground text-small">
            {editable ? t("grid.editHint") : t("grid.readOnlyHint")}
          </span>
        </PanelHeader>
        {items.length === 0 && !editable ? (
          <p className="px-4 py-8 text-center text-muted-foreground">{t("grid.empty")}</p>
        ) : (
          <ItemGrid
            versionId={selected.id}
            editable={editable}
            items={items}
            roles={roles}
            baseHref={baseHref}
            selectedKey={drawerItem?.key}
          />
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <PresetLinks
          templateId={template.id}
          canWrite={canWrite}
          linkedIds={template.presets.map((p) => p.id)}
          presets={options.presets.map((p) => ({
            id: p.id,
            name: p.name,
            typeKey: p.typeKey,
            typeName: locale === "en" ? p.typeNameEn : p.typeNameDe,
            active: p.active,
          }))}
        />
        <Panel>
          <PanelHeader>
            <PanelTitle>{t("rules.title")}</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-small text-foreground-2">
              <li>{t("rules.published")}</li>
              <li>{t("rules.newEvents")}</li>
              <li>{t("rules.apply")}</li>
              <li>{t("rules.followAnchors", { time: defaults.defaultDueTime })}</li>
            </ul>
          </PanelBody>
        </Panel>
      </div>

      {drawerOpen && (
        <ItemDrawer
          key={drawerItem ? `${drawerItem.key}:${selected.id}` : `neu:${newPhase}`}
          versionId={selected.id}
          editable={editable}
          item={drawerItem ?? null}
          newPhase={newPhase}
          afterKey={lastOfPhase}
          items={items}
          roles={roles}
          eventTypes={eventTypes}
          extraAnchors={[...new Set(items.map((i) => i.anchorKey))]}
          defaultDueTime={defaults.defaultDueTime}
          exampleDay={sampleEventDay(todayIn())}
          closeHref={baseHref}
        />
      )}

      {apply && (
        <ApplySheet
          templateId={template.id}
          templateName={template.name}
          version={{ version: apply.version.version, changeNote: apply.version.changeNote }}
          events={apply.events}
          closeHref={baseHref}
        />
      )}
    </Page>
  );
}
