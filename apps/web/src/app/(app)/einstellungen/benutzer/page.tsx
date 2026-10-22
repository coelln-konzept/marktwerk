import { can } from "@marktwerk/core";
import { CircleCheck, CircleOff, Info, Lock, TriangleAlert, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatInstant } from "@/components/event-detail/format-instant";
import { SettingsHeader } from "@/components/settings/settings-header";
import { ActiveToggle, RoleSelect, StaffLinkSelect } from "@/components/settings/user-controls";
import { Page } from "@/components/shell/page";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { listLinkableStaff, listUsers } from "@/server/queries/settings";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: `${t("tabs.users")} · ${t("title")}` };
}

export default async function UsersSettingsPage() {
  const me = await requirePermission("user", "read");
  const [t, tNav, tRoles, locale, users, staff] = await Promise.all([
    getTranslations("settings"),
    getTranslations("nav"),
    getTranslations("roles"),
    getLocale(),
    listUsers(),
    listLinkableStaff(),
  ]);
  const canManage = can(me.role, "user", "manage");

  // The company must keep one active owner: that row's role and status are locked in the UI
  // (the service refuses the change as well).
  const activeOwners = users.filter((u) => u.role === "owner" && !u.banned);
  const lastOwnerId = activeOwners.length === 1 ? (activeOwners[0]?.id ?? null) : null;

  const none = <span className="text-faint-foreground">{t("noValue")}</span>;

  return (
    <Page
      crumbs={[
        { label: tNav("settings"), href: "/einstellungen/firma" },
        { label: t("tabs.users") },
      ]}
    >
      <SettingsHeader
        actions={
          <>
            {/* Product decision open: invitation email vs. initial password. */}
            <Button variant="default" disabled aria-describedby="invite-soon">
              <UserPlus aria-hidden />
              {t("users.invite")}
            </Button>
            <span id="invite-soon" className="text-muted-foreground text-small">
              {t("users.inviteSoon")}
            </span>
          </>
        }
      />

      <p className="m-0 flex items-center gap-2 text-muted-foreground text-small">
        <Info aria-hidden className="size-4 shrink-0" />
        {canManage ? t("users.subtitle", { count: users.length }) : t("users.readOnly")}
      </p>

      <Panel className="overflow-hidden">
        {users.length === 0 ? (
          <EmptyState icon={Users} title={t("users.empty")} />
        ) : (
          <Table>
            <caption className="sr-only">{t("users.caption")}</caption>
            <THead>
              <tr>
                <TH>{t("users.cols.user")}</TH>
                <TH>{t("users.cols.role")}</TH>
                <TH>{t("users.cols.staff")}</TH>
                <TH>{t("users.cols.lastSignIn")}</TH>
                <TH>{t("users.cols.status")}</TH>
                {canManage && <TH className="text-right">{t("users.cols.actions")}</TH>}
              </tr>
            </THead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === me.id;
                const locked = u.id === lastOwnerId;
                const lockId = `lock-${u.id}`;
                const staffOptions = staff
                  .filter((s) => s.userId === null || s.userId === u.id)
                  .map(({ id, displayName }) => ({ id, displayName }));
                return (
                  <TR key={u.id} className={u.banned ? "text-muted-foreground" : undefined}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} />
                        <div className="min-w-0">
                          <div className="font-semibold">
                            {u.name}
                            {isMe && (
                              <span className="ml-1.5 font-normal text-muted-foreground text-small">
                                ({t("users.you")})
                              </span>
                            )}
                          </div>
                          <div className="truncate text-muted-foreground text-small">{u.email}</div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {canManage ? (
                        <>
                          <RoleSelect
                            userId={u.id}
                            name={u.name}
                            role={u.role}
                            locked={locked}
                            describedBy={locked ? lockId : undefined}
                          />
                          {locked && (
                            <p
                              id={lockId}
                              title={t("users.lastOwner")}
                              className="m-0 mt-1 inline-flex items-center gap-1 text-muted-foreground text-tiny"
                            >
                              <Lock aria-hidden className="size-3" />
                              {t("users.lastOwnerShort")}
                              <span className="sr-only">: {t("users.lastOwner")}</span>
                            </p>
                          )}
                        </>
                      ) : (
                        <span title={t(`users.roleHints.${u.role as "owner"}`)}>
                          {tRoles(u.role as never)}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {canManage ? (
                        <StaffLinkSelect
                          userId={u.id}
                          name={u.name}
                          staffId={u.staffMember?.id ?? null}
                          options={staffOptions}
                        />
                      ) : (
                        (u.staffMember?.displayName ?? none)
                      )}
                      {u.role === "field" && !u.staffMember && (
                        <p className="m-0 mt-1 flex items-center gap-1 text-status-warn text-tiny">
                          <TriangleAlert aria-hidden className="size-3 shrink-0" />
                          {t("users.fieldNoStaff")}
                        </p>
                      )}
                    </TD>
                    <TD className="tabular whitespace-nowrap">
                      {u.lastSignIn ? formatInstant(u.lastSignIn, locale) : t("users.never")}
                    </TD>
                    <TD>
                      {u.banned ? (
                        <StatusBadge tone="neutral" icon={CircleOff}>
                          {t("users.deactivated")}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="ok" icon={CircleCheck}>
                          {t("users.active")}
                        </StatusBadge>
                      )}
                    </TD>
                    {canManage && (
                      <TD className="text-right">
                        <ActiveToggle
                          userId={u.id}
                          name={u.name}
                          banned={u.banned}
                          locked={locked}
                          describedBy={locked ? lockId : undefined}
                        />
                      </TD>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </Page>
  );
}
