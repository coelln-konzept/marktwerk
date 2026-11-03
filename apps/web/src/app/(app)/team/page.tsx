import { CircleCheck, CircleOff, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TagList } from "@/components/people/duty-tags";
import { PersonVorschau } from "@/components/people/person-vorschau";
import { Page, PageHeader } from "@/components/shell/page";
import { TeamTabs } from "@/components/team/team-nav";
import { Avatar } from "@/components/ui/avatar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PhoneLink } from "@/components/ui/phone";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { todayIn } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { cn } from "@/lib/utils";
import { getActor } from "@/server/actor";
import { listDutyRoles, listStaff } from "@/server/queries/team";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("team") };
}

const PATH = "/team";

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  await requirePermission("team", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const [t, tNav, tRoles, locale] = await Promise.all([
    getTranslations("team"),
    getTranslations("nav"),
    getTranslations("roles"),
    getLocale(),
  ]);
  const today = todayIn();
  const [people, dutyRoles] = await Promise.all([listStaff(actor, today), listDutyRoles()]);
  const roleName = (r: { nameDe: string; nameEn: string }) =>
    locale === "en" ? r.nameEn : r.nameDe;
  const roleById = new Map(dutyRoles.map((r) => [r.id, r]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const personId = param(sp.person);
  const closeHref = hrefWith(PATH, sp, { person: undefined });
  const logins = people.filter((p) => p.loginRole).length;

  const view = people.map((p) => ({
    ...p,
    preferred: p.preferredDutyRoleIds.flatMap((id) => {
      const r = roleById.get(id);
      return r ? [roleName(r)] : [];
    }),
    defaultFor: dutyRoles.filter((r) => r.defaultStaffMemberId === p.id).map(roleName),
    peek: hrefWith(PATH, sp, { person: p.id }),
  }));

  const activeBadge = (active: boolean) =>
    active ? (
      <StatusBadge tone="ok" icon={CircleCheck}>
        {t("active")}
      </StatusBadge>
    ) : (
      <StatusBadge tone="neutral" icon={CircleOff}>
        {t("inactive")}
      </StatusBadge>
    );
  const login = (role: string | null) =>
    role ? (
      <span className="whitespace-nowrap">{tRoles(role as never)}</span>
    ) : (
      <span className="whitespace-nowrap text-muted-foreground">{t("noLogin")}</span>
    );
  const none = <span className="text-faint-foreground">{t("noValue")}</span>;

  return (
    <Page crumbs={[{ label: tNav("team") }]}>
      <PageHeader title={t("title")} subtitle={t("subtitle", { people: people.length, logins })} />

      <TeamTabs active="people" />

      <Panel className="overflow-hidden">
        {view.length === 0 ? (
          <EmptyState icon={Users} title={t("empty")} />
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden md:block">
              <KeyboardRows>
                <Table>
                  <caption className="sr-only">{t("caption")}</caption>
                  <THead>
                    <tr>
                      <TH>{t("cols.person")}</TH>
                      <TH>{t("cols.duties")}</TH>
                      <TH>{t("cols.login")}</TH>
                      <TH>{t("cols.phone")}</TH>
                      <TH>{t("cols.email")}</TH>
                      <TH>{t("cols.defaultFor")}</TH>
                      <TH className="w-28 whitespace-normal text-right">{t("cols.upcoming")}</TH>
                      <TH>{t("cols.status")}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {view.map((p) => (
                      <TR
                        key={p.id}
                        tabIndex={0}
                        data-row
                        data-href={p.peek}
                        data-peek={p.peek}
                        aria-selected={personId === p.id}
                        className={cn(
                          "outline-hidden focus-visible:bg-selected",
                          !p.active && "text-muted-foreground",
                        )}
                      >
                        <TD>
                          <Link
                            href={p.peek as never}
                            scroll={false}
                            tabIndex={-1}
                            className="inline-flex items-center gap-2 whitespace-nowrap font-semibold text-accent-soft-foreground hover:underline"
                          >
                            <Avatar name={p.displayName} />
                            {p.displayName}
                          </Link>
                        </TD>
                        <TD>
                          <TagList items={p.preferred} empty={t("noValue")} />
                        </TD>
                        <TD>{login(p.loginRole)}</TD>
                        <TD>
                          <PhoneLink phone={p.phoneE164} fallback={t("noValue")} />
                        </TD>
                        <TD className="max-w-44 truncate" title={p.email ?? undefined}>
                          {p.email ? (
                            <a href={`mailto:${p.email}`} className="hover:underline">
                              {p.email}
                            </a>
                          ) : (
                            none
                          )}
                        </TD>
                        <TD>
                          <TagList items={p.defaultFor} empty={t("noValue")} />
                        </TD>
                        <TD className="tabular text-right">
                          {p.upcomingCount > 0 ? p.upcomingCount : none}
                        </TD>
                        <TD>{activeBadge(p.active)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </KeyboardRows>
            </div>

            {/* Phone: one card per person */}
            <ul className="m-0 list-none p-0 md:hidden">
              {view.map((p) => (
                <li
                  key={p.id}
                  aria-current={personId === p.id ? "true" : undefined}
                  className={cn(
                    "flex flex-col gap-2 border-border-subtle border-b px-4 py-3 last:border-b-0 aria-[current=true]:bg-selected",
                    !p.active && "text-muted-foreground",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={p.peek as never}
                      scroll={false}
                      className="inline-flex min-h-8 items-center gap-2 font-semibold text-accent-soft-foreground"
                    >
                      <Avatar name={p.displayName} />
                      {p.displayName}
                    </Link>
                    {activeBadge(p.active)}
                  </div>
                  <TagList items={p.preferred} />
                  <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
                    <PhoneLink phone={p.phoneE164} fallback={t("noValue")} icon />
                    <span>{login(p.loginRole)}</span>
                    {p.upcomingCount > 0 && (
                      <span className="tabular">
                        {t("vorschau.upcomingCount", { count: p.upcomingCount })}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel aria-labelledby="duties-title">
        <PanelHeader>
          <PanelTitle id="duties-title">{t("dutiesPanel.title")}</PanelTitle>
          <p className="m-0 text-muted-foreground text-small">{t("dutiesPanel.hint")}</p>
        </PanelHeader>
        <PanelBody>
          <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {dutyRoles.map((r) => {
              const def = r.defaultStaffMemberId ? personById.get(r.defaultStaffMemberId) : null;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{roleName(r)}</span>
                  {def ? (
                    <Link
                      href={hrefWith(PATH, sp, { person: def.id }) as never}
                      scroll={false}
                      className="inline-flex items-center gap-2 text-accent-soft-foreground hover:underline"
                    >
                      <Avatar name={def.displayName} />
                      {def.displayName}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{t("dutiesPanel.none")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </PanelBody>
      </Panel>

      <p className="hidden text-muted-foreground text-tiny md:block">{t("keys")}</p>

      {personId && (
        <PersonVorschau id={personId} closeHref={closeHref} today={today} dutyRoles={dutyRoles} />
      )}
    </Page>
  );
}
