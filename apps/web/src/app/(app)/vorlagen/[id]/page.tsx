import { can } from "@marktwerk/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PresetStatusBadge } from "@/components/catalogue/preset-status";
import { MarketNextTimeNotesPanel } from "@/components/next-time-notes/next-time-note-panels";
import { PresetForm } from "@/components/presets/preset-form";
import { SeasonPanels } from "@/components/presets/season-panel";
import { Page, PageHeader } from "@/components/shell/page";
import { TaskDrawer } from "@/components/task/task-drawer";
import { Drawer } from "@/components/ui/drawer";
import { todayIn } from "@/lib/format";
import { param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { listMarketColorUsage } from "@/server/queries/market-colors";
import { listShortCodeMarkets } from "@/server/queries/market-short-codes";
import { listNextTimeNotes } from "@/server/queries/next-time-notes";
import {
  getPresetForEdit,
  getPresetFormOptions,
  getPresetTaskTemplates,
} from "@/server/queries/presets";
import { getMarketSeasons } from "@/server/queries/seasons";
import { getTaskDetail, listStaffOptions } from "@/server/queries/tasks";
import { requirePermission } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/vorlagen/[id]">): Promise<Metadata> {
  const preset = await getPresetForEdit((await params).id);
  return { title: preset?.name ?? (await getTranslations("settings"))("tabs.library") };
}

/**
 * The market page (template:write): its Saison panels (current and next year, Fahrplan R12) above the edit form.
 * Form changes only apply to events generated afterwards. A season task opens its drawer here (`?aufgabe=<id>`).
 */
export default async function EditPresetPage({
  params,
  searchParams,
}: PageProps<"/vorlagen/[id]">) {
  await requirePermission("template", "write");
  const { id } = await params;
  const preset = await getPresetForEdit(id);
  if (!preset) notFound();
  const actor = await getActor();
  const today = todayIn();
  const [seasons, nextTimeNotes] = await Promise.all([
    getMarketSeasons(actor, preset.id, today),
    listNextTimeNotes(actor, preset.id),
  ]);
  const canWriteTasks = can(actor.role, "task", "write");
  const taskId = param((await searchParams).aufgabe);
  const closeHref = `/vorlagen/${preset.id}`;
  let drawer: React.ReactNode = null;
  if (taskId && can(actor.role, "task", "read")) {
    const tBoard = await getTranslations("board");
    const detail = await getTaskDetail(actor, taskId, today);
    drawer = detail ? (
      <TaskDrawer
        task={detail}
        staff={await listStaffOptions()}
        canWrite={canWriteTasks}
        canAssign={false}
        canDelete={can(actor.role, "task", "delete")}
        today={today}
        closeHref={closeHref}
      />
    ) : (
      <Drawer kind={tBoard("drawer.label")} title={tBoard("drawer.notFound")} closeHref={closeHref}>
        <p className="text-muted-foreground text-small">{tBoard("drawer.notFoundHint")}</p>
      </Drawer>
    );
  }
  const t = await getTranslations("templates");
  const tLib = await getTranslations("settings");
  const tNav = await getTranslations("nav");
  const taskTemplates = await getPresetTaskTemplates(preset.id);
  const colorUsage = await listMarketColorUsage(preset.id);
  const otherMarkets = (await listShortCodeMarkets()).filter((m) => m.id !== preset.id);
  const options = await getPresetFormOptions({
    eventTypeId: preset.eventTypeId,
    venueId: preset.venueId,
    staffIds: Object.values(preset.defaultDuties),
  });
  // Only roles that exist are editable; a leftover key of a removed role is dropped on the next save.
  const roleKeys = new Set(options.roles.map((r) => r.key));
  const defaultDuties = Object.fromEntries(
    Object.entries(preset.defaultDuties).filter(([key]) => roleKeys.has(key)),
  );

  return (
    <Page
      crumbs={[
        { label: tNav("settings"), href: "/einstellungen/firma" },
        { label: tLib("tabs.library"), href: "/einstellungen/bibliothek" },
        { label: preset.name, href: `/einstellungen/bibliothek?vorschau=${preset.id}` },
        { label: t("form.editCrumb") },
      ]}
    >
      <PageHeader
        title={t("form.editTitle")}
        subtitle={preset.name}
        eyebrow={
          <Link
            href={`/einstellungen/bibliothek?vorschau=${preset.id}` as never}
            className="hover:underline"
          >
            {t("form.back")}
          </Link>
        }
        actions={<PresetStatusBadge active={preset.active} />}
      />
      <p className="m-0 text-small text-foreground-2">
        {taskTemplates.own || taskTemplates.shared.length > 0 ? (
          <>
            {t("form.tasksLink")}{" "}
            {[
              ...(taskTemplates.own ? [{ ...taskTemplates.own, name: t("form.tasksOwn") }] : []),
              ...taskTemplates.shared,
            ].map((tpl, i) => (
              <span key={tpl.id}>
                {i > 0 && ", "}
                <Link
                  href={`/vorlagen/ablauf/${tpl.id}` as never}
                  className="font-medium text-accent-soft-foreground hover:underline"
                >
                  {tpl.name}
                </Link>
              </span>
            ))}
          </>
        ) : (
          t("vorschau.tasksNone")
        )}
      </p>
      <SeasonPanels
        presetId={preset.id}
        seasons={seasons}
        today={today}
        canWrite={can(actor.role, "event", "write")}
        canWriteTasks={canWriteTasks}
      />
      <MarketNextTimeNotesPanel
        presetId={preset.id}
        notes={nextTimeNotes}
        canWrite={can(actor.role, "nextTimeNote", "write")}
      />
      <PresetForm
        options={options}
        colorUsage={colorUsage}
        otherMarkets={otherMarkets}
        edit={{ id: preset.id, updatedAt: preset.updatedAt.toISOString() }}
        initial={{
          name: preset.name,
          eventTypeId: preset.eventTypeId,
          venueId: preset.venueId,
          durationDays: preset.durationDays,
          publicTitle: preset.publicTitle,
          publicText: preset.publicText,
          schedule: preset.schedule,
          pricePerMCents: preset.pricePerMCents,
          bookingFeeCents: preset.bookingFeeCents,
          rrule: preset.rrule,
          defaultDuties,
          active: preset.active,
          color: preset.color,
          shortCode: preset.shortCode,
        }}
      />
      {drawer}
    </Page>
  );
}
