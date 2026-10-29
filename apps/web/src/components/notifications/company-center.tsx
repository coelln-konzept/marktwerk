import { can, dueBucket } from "@marktwerk/core";
import { BellOff, CalendarDays, CircleCheck, SearchX, Timer } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { TaskDrawer } from "@/components/task/task-drawer";
import { buttonVariants } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { dueLook } from "@/components/ui/due-badge";
import {
  FilterBar,
  FilterChip,
  FilterChips,
  FilterDisclosure,
  FilterGroup,
  Segments,
} from "@/components/ui/filter-bar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { isModuleHidden } from "@/lib/modules";
import { hrefWith, param } from "@/lib/url";
import { cn } from "@/lib/utils";
import { getActor } from "@/server/actor";
import {
  COMPANY_SORTS,
  COMPANY_STATUSES,
  type CompanyNotificationRow,
  isCompanyArt,
  isCompanySort,
  isCompanyStatus,
  listCompanyNotifications,
} from "@/server/queries/notifications";
import { getTaskDetail, listStaffOptions } from "@/server/queries/tasks";
import { DrawerFocusReturn, MarketFilter } from "./center-controls";
import { CompanyRow } from "./company-row";
import { MarkAllCompanyButton } from "./mark-all-company-button";

const PATH = "/benachrichtigungen" as const;
const GROUPS = ["overdue", "today", "soon", "later"] as const;
type Group = (typeof GROUPS)[number];

/** Each group opens with a band in its due colour, like the Übersicht's groups (colour + icon + text). */
const BAND: Record<Group, { icon: typeof CalendarDays; className: string }> = {
  overdue: {
    icon: dueLook("overdue").icon,
    className: "border-status-critical-dot/30 bg-status-critical-bg text-status-critical",
  },
  today: {
    icon: dueLook("today").icon,
    className: "border-status-warn-dot/30 bg-status-warn-bg text-status-warn",
  },
  soon: { icon: CalendarDays, className: "border-border bg-status-neutral-bg text-foreground" },
  later: { icon: CalendarDays, className: "border-border bg-status-neutral-bg text-foreground" },
};

/**
 * Benachrichtigungen for owner and manager: every important item once (overdue and soon-due tasks, permit
 * deadlines), one shared state (offen · zurückgestellt · erledigt), in the order of the Übersicht. Filters
 * live in the URL; on phones they sit behind one "Filter" button. A task opens its drawer in place
 * (`?aufgabe=<id>`), the list stays where it was.
 */
export async function CompanyCenterPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams;
  const t = await getTranslations("notificationCenter");
  const actor = await getActor();
  const statusParam = param(sp.status);
  const status = isCompanyStatus(statusParam) ? statusParam : "open";
  const artParam = param(sp.art);
  const art = isCompanyArt(artParam) ? artParam : undefined;
  const sortParam = param(sp.sortierung);
  const sort = isCompanySort(sortParam) ? sortParam : "urgency";
  const markt = param(sp.markt);
  const center = await listCompanyNotifications(actor, { status, art, markt, sort });
  const filtered = Boolean(art || markt);

  // Open items by urgency are grouped (overdue · today · next 7 days · later); everything else is one list.
  const grouped = status === "open" && sort === "urgency";
  const groups: { key: string; rows: CompanyNotificationRow[] }[] = grouped
    ? GROUPS.map((key) => ({
        key,
        rows: center.rows.filter((r) => dueBucket(r.dueOn, center.today) === key),
      })).filter((g) => g.rows.length > 0)
    : [{ key: "all", rows: center.rows }];

  // ---- task drawer in place
  const closeHref = hrefWith(PATH, sp, { aufgabe: undefined, detail: undefined });
  const openTaskId = param(sp.aufgabe);
  const tBoard = await getTranslations("board");
  const detail = openTaskId ? await getTaskDetail(actor, openTaskId, center.today) : null;
  const drawerNode = openTaskId ? (
    detail ? (
      <>
        <TaskDrawer
          task={detail}
          staff={await listStaffOptions()}
          canWrite={can(actor.role, "task", "write")}
          canAssign={!isModuleHidden("team") && can(actor.role, "task", "assign")}
          today={center.today}
          closeHref={closeHref}
        />
        <DrawerFocusReturn taskId={openTaskId} />
      </>
    ) : (
      <Drawer kind={tBoard("drawer.label")} title={tBoard("drawer.notFound")} closeHref={closeHref}>
        <p className="text-muted-foreground text-small">{tBoard("drawer.notFoundHint")}</p>
      </Drawer>
    )
  ) : null;
  const openHrefOf = (row: CompanyNotificationRow) =>
    row.subjectType === "task" ? hrefWith(PATH, sp, { aufgabe: row.subjectId }) : row.href;

  // ---- filters
  const marketName = center.markets.find((m) => m.presetId === markt)?.name;
  const summary =
    [art && t(`art.${art}`), marketName, sort !== "urgency" && t(`sort.${sort}`)]
      .filter(Boolean)
      .join(" · ") || null;

  const statusFilter = (
    <FilterGroup label={t("status.label")}>
      <Segments
        items={COMPANY_STATUSES.map((s) => ({
          key: s,
          label: `${t(`status.${s}`)} ${center.statusCounts[s]}`,
          href: hrefWith(PATH, sp, { status: s === "open" ? undefined : s }),
          active: status === s,
        }))}
      />
    </FilterGroup>
  );
  /** Art, Markt, Sortierung: beside the status on wide screens, behind "Filter" on phones. */
  const otherFilters = (idPrefix: string) => (
    <>
      <FilterGroup label={t("art.label")}>
        <FilterChips>
          <FilterChip
            href={hrefWith(PATH, sp, { art: undefined })}
            active={!art}
            count={center.artCounts.tasks + center.artCounts.permits}
          >
            {t("art.all")}
          </FilterChip>
          {(["tasks", "permits"] as const).map((a) => (
            <FilterChip
              key={a}
              href={hrefWith(PATH, sp, { art: a })}
              active={art === a}
              count={center.artCounts[a]}
            >
              {t(`art.${a}`)}
            </FilterChip>
          ))}
        </FilterChips>
      </FilterGroup>
      <FilterGroup label={t("market.label")}>
        <MarketFilter
          id={`${idPrefix}-markt`}
          label={t("market.label")}
          allLabel={t("market.all")}
          value={markt ?? ""}
          markets={center.markets}
        />
      </FilterGroup>
      <FilterGroup label={t("sort.label")}>
        <Segments
          items={COMPANY_SORTS.map((s) => ({
            key: s,
            label: t(`sort.${s}`),
            href: hrefWith(PATH, sp, { sortierung: s === "urgency" ? undefined : s }),
            active: sort === s,
          }))}
        />
      </FilterGroup>
    </>
  );

  const empty = filtered ? (
    <EmptyState icon={SearchX} title={t("empty.filtered")}>
      <Link
        href={hrefWith(PATH, sp, { art: undefined, markt: undefined }) as never}
        className={buttonVariants({ variant: "outline" })}
      >
        {t("empty.reset")}
      </Link>
    </EmptyState>
  ) : (
    <EmptyState
      icon={status === "open" ? BellOff : status === "snoozed" ? Timer : CircleCheck}
      title={t(`empty.${status}.title`)}
      hint={t(`empty.${status}.hint`)}
    />
  );

  return (
    <Page crumbs={[{ label: t("title") }]}>
      <PageHeader
        title={t("title")}
        subtitle={<span className="max-sm:hidden">{t("subtitle")}</span>}
        actions={
          <MarkAllCompanyButton
            iconOnlyOnPhone
            art={art}
            markt={markt}
            disabled={status !== "open" || !center.rows.some((r) => r.unread)}
          />
        }
      />

      <FilterBar>
        {statusFilter}
        <div className="hidden md:contents">{otherFilters("f")}</div>
        <div className="basis-full md:hidden">
          <FilterDisclosure label={t("filter.button")} summary={summary}>
            <div className="flex flex-col gap-3">{otherFilters("fm")}</div>
          </FilterDisclosure>
        </div>
      </FilterBar>

      {center.rows.length === 0 ? (
        <Panel>{empty}</Panel>
      ) : (
        <KeyboardRows className="flex flex-col gap-4">
          <p className="max-md:hidden touch:hidden text-muted-foreground text-tiny">{t("keys")}</p>
          {groups.map((group) => {
            const band = grouped ? BAND[group.key as Group] : null;
            return (
              <Panel key={group.key} className="overflow-hidden">
                {band && (
                  <h2
                    className={cn(
                      "flex items-center gap-2 border-y-0 border-b px-4 py-2.5 font-semibold text-body",
                      band.className,
                    )}
                  >
                    <band.icon aria-hidden className="size-4 shrink-0" />
                    {t(`groups.${group.key as Group}`)}
                    <span className="tabular inline-grid h-5 min-w-6 place-items-center rounded-full bg-card/80 px-1.5 font-semibold text-tiny">
                      {group.rows.length}
                    </span>
                  </h2>
                )}
                <ul aria-label={t("list")} className="m-0 list-none p-0">
                  {group.rows.map((row) => (
                    <CompanyRow
                      key={row.id}
                      row={row}
                      today={center.today}
                      openHref={openHrefOf(row)}
                    />
                  ))}
                </ul>
              </Panel>
            );
          })}
        </KeyboardRows>
      )}
      {drawerNode}
    </Page>
  );
}
