import { CircleCheck, CircleOff } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { Facts, Vorschau } from "@/components/ui/vorschau";
import { formatDateRange } from "@/lib/format";
import { getActor } from "@/server/actor";
import { type DutyRoleRow, listStaff, nextEventsOf } from "@/server/queries/team";
import { TagList } from "./duty-tags";
import { PhoneLink } from "./phone";

/** Vorschau of one staff member: contact, notes, duties, next events. */
export async function PersonVorschau({
  id,
  closeHref,
  today,
  dutyRoles,
}: {
  id: string;
  closeHref: string;
  today: string;
  dutyRoles: DutyRoleRow[];
}) {
  const actor = await getActor();
  const person = (await listStaff(actor, today)).find((p) => p.id === id);
  if (!person) return null;
  const [t, tRoles, locale, events] = await Promise.all([
    getTranslations("team.vorschau"),
    getTranslations("roles"),
    getLocale(),
    nextEventsOf(actor, id, today, 5),
  ]);
  const roleName = (r: { nameDe: string; nameEn: string }) =>
    locale === "en" ? r.nameEn : r.nameDe;
  const preferred = dutyRoles.filter((r) => person.preferredDutyRoleIds.includes(r.id));
  const defaultFor = dutyRoles.filter((r) => r.defaultStaffMemberId === person.id);
  const tTeam = await getTranslations("team");
  return (
    <Vorschau
      kind={t("kind")}
      title={person.displayName}
      closeHref={closeHref}
      badges={
        person.active ? (
          <StatusBadge tone="ok" icon={CircleCheck}>
            {tTeam("active")}
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral" icon={CircleOff}>
            {tTeam("inactive")}
          </StatusBadge>
        )
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={person.displayName} size="lg" />
        <p className="text-muted-foreground text-small">
          {t("upcomingCount", { count: person.upcomingCount })}
        </p>
      </div>
      <Facts
        items={[
          {
            label: t("phone"),
            value: <PhoneLink phone={person.phoneE164} fallback={tTeam("noValue")} />,
          },
          {
            label: t("email"),
            value: person.email ? (
              <a href={`mailto:${person.email}`} className="break-all hover:underline">
                {person.email}
              </a>
            ) : (
              <span className="text-faint-foreground">{tTeam("noValue")}</span>
            ),
          },
          {
            label: t("login"),
            value: person.loginRole ? (
              tRoles(person.loginRole as never)
            ) : (
              <span className="text-muted-foreground">{tTeam("noLogin")}</span>
            ),
          },
          {
            label: t("duties"),
            value: <TagList items={preferred.map(roleName)} empty={t("noDuties")} />,
          },
          ...(defaultFor.length > 0
            ? [{ label: t("defaultFor"), value: <TagList items={defaultFor.map(roleName)} /> }]
            : []),
        ]}
      />
      <section aria-labelledby="pv-notes">
        <h3 id="pv-notes" className="mb-1 font-semibold text-muted-foreground text-tiny">
          {t("notes")}
        </h3>
        <p className="m-0 whitespace-pre-line">
          {person.notes ?? <span className="text-faint-foreground">{t("noNotes")}</span>}
        </p>
      </section>
      <section aria-labelledby="pv-events">
        <h3 id="pv-events" className="mb-1 font-semibold text-muted-foreground text-tiny">
          {t("nextEvents")}
        </h3>
        {events.length === 0 ? (
          <p className="m-0 text-faint-foreground">{t("noEvents")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {events.map((e) => (
              <li
                key={`${e.eventId}-${e.dutyRoleNameDe}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0">
                  <Link
                    href={`/veranstaltungen/${e.eventId}` as never}
                    className="font-semibold text-accent-soft-foreground hover:underline"
                  >
                    {e.name}
                  </Link>
                  <span className="block text-muted-foreground text-small">
                    <span className="tabular">{formatDateRange(e.startsOn, e.endsOn, locale)}</span>
                    {" · "}
                    {e.city}
                  </span>
                </span>
                <span className="shrink-0 text-foreground-2 text-small">
                  {locale === "en" ? e.dutyRoleNameEn : e.dutyRoleNameDe}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Vorschau>
  );
}
