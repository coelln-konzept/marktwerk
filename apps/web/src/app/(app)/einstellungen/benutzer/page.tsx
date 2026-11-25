import { can, ROLES } from "@marktwerk/core";
import {
  ChevronRight,
  CircleCheck,
  CircleOff,
  Info,
  Lock,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatInstant } from "@/components/event-detail/format-instant";
import { SettingsHeader } from "@/components/settings/settings-header";
import { ActiveToggle, RoleSelect, StaffLinkSelect } from "@/components/settings/user-controls";
import { Page } from "@/components/shell/page";
import { Avatar } from "@/components/ui/avatar";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listLinkableStaff, listUsers } from "@/server/queries/settings";
import { requirePermission } from "@/server/session";

/** A table cell that is a plain block in the phone card layout. */
const CARD_CELL = "max-sm:block max-sm:h-auto max-sm:p-0";

/**
 * The column name above a value in the phone card layout (the table header is hidden there). Above a
 * control it is visual only: the control carries its own accessible name.
 */
function PhoneLabel({ control, children }: { control: boolean; children: React.ReactNode }) {
  return (
    <span
      aria-hidden={control || undefined}
      className="mb-1 block font-semibold text-muted-foreground text-tiny sm:hidden"
    >
      {children}
    </span>
  );
}

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
      <SettingsHeader />

      <div className="flex flex-col gap-2">
        <p className="m-0 flex items-center gap-2 text-muted-foreground text-small">
          <Info aria-hidden className="size-4 shrink-0" />
          {canManage ? t("users.subtitle", { count: users.length }) : t("users.readOnly")}
        </p>
        {/* Product decision open (invitation email vs. initial password): until then, say how it works today. */}
        {canManage && (
          <p className="m-0 flex items-start gap-2 text-muted-foreground text-small">
            <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold text-foreground-2">{t("users.inviteTitle")}:</span>{" "}
              {t("users.inviteHow")}
            </span>
          </p>
        )}
        <details className="group max-w-3xl text-small">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md font-medium text-accent-soft-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform group-open:rotate-90"
            />
            {t("users.rolesTitle")}
          </summary>
          <dl className="m-0 mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border bg-card px-4 py-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
            {ROLES.map((r) => (
              <div key={r} className="contents">
                <dt className="font-semibold">{tRoles(r)}</dt>
                <dd className="m-0 text-foreground-2 max-sm:mb-1">{t(`users.roleHints.${r}`)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

      <Panel className="overflow-hidden">
        {users.length === 0 ? (
          <EmptyState icon={Users} title={t("users.empty")} />
        ) : (
          // Below 640 px every row becomes a card: name and status, then role, person, last sign-in and the
          // action, each with its label (UX-003: the role select and Deaktivieren were cut off on phones).
          <Table className="max-sm:block">
            <caption className="sr-only">{t("users.caption")}</caption>
            <THead className="max-sm:sr-only">
              <tr>
                <TH>{t("users.cols.user")}</TH>
                <TH>{t("users.cols.role")}</TH>
                <TH>{t("users.cols.staff")}</TH>
                <TH>{t("users.cols.lastSignIn")}</TH>
                <TH>{t("users.cols.status")}</TH>
                {canManage && <TH className="text-right">{t("users.cols.actions")}</TH>}
              </tr>
            </THead>
            <tbody className="max-sm:block">
              {users.map((u) => {
                const isMe = u.id === me.id;
                const locked = u.id === lastOwnerId;
                const lockId = `lock-${u.id}`;
                const roleHintId = `role-hint-${u.id}`;
                const staffOptions = staff
                  .filter((s) => s.userId === null || s.userId === u.id)
                  .map(({ id, displayName }) => ({ id, displayName }));
                return (
                  <TR
                    key={u.id}
                    className={cn(
                      "max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-3 max-sm:px-3 max-sm:py-3",
                      u.banned && "text-muted-foreground",
                    )}
                  >
                    <TD className={CARD_CELL}>
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
                    <TD className={cn(CARD_CELL, "max-sm:col-span-2")}>
                      <PhoneLabel control={canManage}>{t("users.cols.role")}</PhoneLabel>
                      {canManage ? (
                        <>
                          <RoleSelect
                            userId={u.id}
                            name={u.name}
                            role={u.role}
                            isMe={isMe}
                            locked={locked}
                            describedBy={locked ? `${roleHintId} ${lockId}` : roleHintId}
                          />
                          <p
                            id={roleHintId}
                            className="m-0 mt-1 max-w-64 text-muted-foreground text-tiny max-sm:max-w-none"
                          >
                            {t(`users.roleHints.${u.role as "owner"}`)}
                          </p>
                          {locked && (
                            // Short visible label on wide screens (full text as tooltip); phones have no
                            // tooltip and room for the sentence. Screen readers get the sentence once.
                            <p
                              id={lockId}
                              title={t("users.lastOwner")}
                              className="m-0 mt-1 flex items-start gap-1 text-muted-foreground text-tiny"
                            >
                              <Lock aria-hidden className="mt-px size-3 shrink-0" />
                              <span aria-hidden className="max-sm:hidden">
                                {t("users.lastOwnerShort")}
                              </span>
                              <span className="sm:sr-only">{t("users.lastOwner")}</span>
                            </p>
                          )}
                        </>
                      ) : (
                        <span title={t(`users.roleHints.${u.role as "owner"}`)}>
                          {tRoles(u.role as never)}
                        </span>
                      )}
                    </TD>
                    <TD className={cn(CARD_CELL, "max-sm:col-span-2")}>
                      <PhoneLabel control={canManage}>{t("users.cols.staff")}</PhoneLabel>
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
                    <TD
                      className={cn(
                        CARD_CELL,
                        "tabular whitespace-nowrap max-sm:col-span-2 max-sm:text-small",
                      )}
                    >
                      <span className="text-muted-foreground sm:hidden">
                        {t("users.cols.lastSignIn")}:{" "}
                      </span>
                      {u.lastSignIn ? formatInstant(u.lastSignIn, locale) : t("users.never")}
                    </TD>
                    <TD className={cn(CARD_CELL, "max-sm:col-start-2 max-sm:row-start-1")}>
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
                      <TD
                        className={cn(CARD_CELL, "text-right max-sm:col-span-2 max-sm:text-left")}
                      >
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
