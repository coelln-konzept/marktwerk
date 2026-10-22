import { BellOff, SearchX, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Page, PageHeader } from "@/components/shell/page";
import { buttonVariants } from "@/components/ui/button";
import {
  FilterBar,
  FilterChip,
  FilterChips,
  FilterGroup,
  Segments,
} from "@/components/ui/filter-bar";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { formatAgo } from "@/lib/format";
import { HIDDEN_MODULES } from "@/lib/modules";
import { isNotificationGroup, NOTIFICATION_GROUPS } from "@/lib/notification-reasons";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import {
  isNotificationView,
  listNotifications,
  NOTIFICATION_VIEWS,
} from "@/server/queries/notifications";
import { requireUser } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("notifications") };
}

const PATH = "/benachrichtigungen";

/**
 * Benachrichtigungen: the inbox of the signed-in person. States unread / read / done / saved, "Später"
 * snooze, "Alle gelesen", filter by kind. Notifications belong to a staff member, so a login without a
 * staff record sees an explanation instead of a list.
 */
export default async function NotificationsPage({
  searchParams,
}: PageProps<"/benachrichtigungen">) {
  await requireUser();
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("notificationsPage");
  const locale = await getLocale();
  const viewParam = param(sp.ansicht);
  const view = isNotificationView(viewParam) ? viewParam : "open";
  const groupParam = param(sp.art);
  const group = isNotificationGroup(groupParam) ? groupParam : undefined;
  const now = new Date();
  const page = await listNotifications(actor, { view, group }, now, HIDDEN_MODULES);

  if (!actor.staffMemberId) {
    return (
      <Page crumbs={[{ label: t("title") }]}>
        <PageHeader title={t("title")} />
        <Panel>
          <EmptyState icon={UserX} title={t("noStaffTitle")} hint={t("noStaffHint")} />
        </Panel>
      </Page>
    );
  }

  return (
    <Page crumbs={[{ label: t("title") }]}>
      <PageHeader
        title={t("title")}
        subtitle={
          <span className="flex flex-wrap gap-x-3">
            <span>{t("subtitle", { unread: page.unread })}</span>
            {page.snoozed > 0 && <span>{t("snoozed", { count: page.snoozed })}</span>}
          </span>
        }
        actions={<MarkAllReadButton group={group} disabled={page.unread === 0} />}
      />

      <FilterBar>
        <FilterGroup label={t("views.label")}>
          <Segments
            items={NOTIFICATION_VIEWS.map((v) => ({
              key: v,
              label: t(`views.${v}`),
              href: hrefWith(PATH, sp, { ansicht: v === "open" ? undefined : v }),
              active: view === v,
            }))}
          />
        </FilterGroup>
        <FilterGroup label={t("groups.label")} wide>
          <FilterChips>
            <FilterChip
              href={hrefWith(PATH, sp, { art: undefined })}
              active={!group}
              count={page.total}
            >
              {t("groups.all")}
            </FilterChip>
            {NOTIFICATION_GROUPS.map((g) => (
              <FilterChip
                key={g}
                href={hrefWith(PATH, sp, { art: g })}
                active={group === g}
                count={page.groupCounts[g]}
              >
                {t(`groups.${g}`)}
              </FilterChip>
            ))}
          </FilterChips>
        </FilterGroup>
      </FilterBar>

      <Panel className="overflow-hidden">
        {page.rows.length === 0 ? (
          group || view !== "open" ? (
            <EmptyState icon={SearchX} title={t("emptyFiltered")}>
              <Link href={PATH} className={buttonVariants({ variant: "outline" })}>
                {t("views.open")}
              </Link>
            </EmptyState>
          ) : (
            <EmptyState icon={BellOff} title={t("empty")} hint={t("emptyHint")} />
          )
        ) : (
          <ul aria-label={t("list")} className="m-0 list-none p-0">
            {page.rows.map((row) => (
              <NotificationItem
                key={row.id}
                row={row}
                ago={formatAgo(new Date(row.createdAt), now, locale)}
              />
            ))}
          </ul>
        )}
      </Panel>
      {page.hasMore && <p className="text-muted-foreground text-tiny">{t("more")}</p>}
    </Page>
  );
}
