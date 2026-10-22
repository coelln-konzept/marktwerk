import { dueBucket } from "@marktwerk/core";
import { BellOff, CircleCheck, SearchX, Timer } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Page, PageHeader } from "@/components/shell/page";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { buttonVariants } from "@/components/ui/button";
import {
  FilterBar,
  FilterChip,
  FilterChips,
  FilterGroup,
  Segments,
} from "@/components/ui/filter-bar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { hrefWith, param } from "@/lib/url";
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
import { CompanyRow } from "./company-row";
import { MarkAllCompanyButton } from "./mark-all-company-button";

const PATH = "/benachrichtigungen" as const;
const GROUPS = ["overdue", "today", "soon", "later"] as const;

/**
 * Benachrichtigungen for owner and manager: every important item once (overdue and soon-due tasks, permit
 * deadlines), one shared state (offen · zurückgestellt · erledigt). Filters live in the URL.
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

  // Open items by urgency are grouped (overdue · today · this week · later); everything else is one list.
  const grouped = status === "open" && sort === "urgency";
  const groups: { key: string; rows: CompanyNotificationRow[] }[] = grouped
    ? GROUPS.map((key) => ({
        key,
        rows: center.rows.filter((r) => dueBucket(r.dueOn, center.today) === key),
      })).filter((g) => g.rows.length > 0)
    : [{ key: "all", rows: center.rows }];

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
        subtitle={t("subtitle")}
        actions={<MarkAllCompanyButton art={art} markt={markt} disabled={center.unread === 0} />}
      />

      <FilterBar>
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
          <form action={PATH} className="flex">
            {Object.entries(sp).map(([k, v]) =>
              k !== "markt" && typeof v === "string" ? (
                <input key={k} type="hidden" name={k} value={v} />
              ) : null,
            )}
            <label className="sr-only" htmlFor="f-markt">
              {t("market.label")}
            </label>
            <AutoSubmitSelect id="f-markt" name="markt" defaultValue={markt ?? ""}>
              <option value="">{t("market.all")}</option>
              {center.markets.map((m) => (
                <option key={m.presetId} value={m.presetId}>
                  {m.name}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
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
      </FilterBar>

      {center.rows.length === 0 ? (
        <Panel>{empty}</Panel>
      ) : (
        <KeyboardRows className="flex flex-col gap-4">
          {groups.map((group) => (
            <Panel key={group.key} className="overflow-hidden">
              {grouped && (
                <h2 className="flex items-center gap-2 border-border-subtle border-b bg-surface-2 px-4 py-2 font-semibold text-small">
                  {t(`groups.${group.key as (typeof GROUPS)[number]}`)}
                  <span className="tabular font-normal text-muted-foreground">
                    {group.rows.length}
                  </span>
                </h2>
              )}
              <ul aria-label={t("list")} className="m-0 list-none p-0">
                {group.rows.map((row) => (
                  <CompanyRow key={row.id} row={row} today={center.today} />
                ))}
              </ul>
            </Panel>
          ))}
          <p className="text-muted-foreground text-tiny">{t("keys")}</p>
        </KeyboardRows>
      )}
    </Page>
  );
}
