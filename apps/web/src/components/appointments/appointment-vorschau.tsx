import { can } from "@marktwerk/core";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MailLink, PhoneLink } from "@/components/ui/phone";
import { Facts, Vorschau } from "@/components/ui/vorschau";
import { formatDateWithWeekday, formatWeek } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getAppointment } from "@/server/queries/appointments";
import { AppointmentActions } from "./appointment-actions";

/** `vorschau=termin:<id>`: the id of a Termin Vorschau, or null for any other value. */
export function terminVorschauId(value: string | undefined): string | null {
  return value?.startsWith("termin:") ? value.slice("termin:".length) : null;
}

/**
 * Vorschau of one Termin: title, date (weekday and KW), time, place, notes and the contact (phone and
 * e-mail as links, "In Kontakte öffnen" when the contact is a saved one). Bearbeiten opens the Termin
 * dialog (`editHref`), Archivieren shows an undo toast. Used on the Kalender and the Übersicht.
 */
export async function AppointmentVorschau({
  id,
  closeHref,
  editHref,
  reopenHref,
}: {
  id: string;
  closeHref: string;
  editHref: string;
  /** This Vorschau's own URL, where the undo toast leads back to. */
  reopenHref: string;
}) {
  const actor = await getActor();
  if (!can(actor.role, "event", "read")) return null;
  const termin = await getAppointment(id);
  if (!termin) return null;
  const t = await getTranslations("appointments.vorschau");
  const locale = await getLocale();
  const none = <span className="text-muted-foreground">{t("none")}</span>;
  const time = !termin.startsAt
    ? t("allDay")
    : termin.endsAt
      ? t("timeRange", { from: termin.startsAt, to: termin.endsAt })
      : t("timeFrom", { from: termin.startsAt });
  const place = termin.venueId ? (
    <Link
      href={`/orte/${termin.venueId}` as never}
      className="inline-flex items-center gap-1.5 font-medium text-accent-soft-foreground hover:underline"
    >
      {termin.venueName}
      <ExternalLink aria-hidden className="size-3.5" />
    </Link>
  ) : termin.locationText ? (
    <span className="break-words">{termin.locationText}</span>
  ) : (
    none
  );
  const person = termin.contact;
  return (
    <Vorschau
      kind={t("kind")}
      title={termin.title}
      closeHref={closeHref}
      openHref={person?.id ? `/kontakte?vorschau=${person.id}` : undefined}
      openLabel={t("openContact")}
    >
      <Facts
        items={[
          {
            label: t("date"),
            value: `${formatDateWithWeekday(termin.onDate, locale)} · ${formatWeek(termin.onDate, locale)}`,
          },
          { label: t("time"), value: <span className="tabular">{time}</span> },
          { label: t("where"), value: place },
          {
            label: t("notes"),
            value: termin.notes ? (
              <span className="whitespace-pre-wrap break-words text-small">{termin.notes}</span>
            ) : (
              none
            ),
          },
          {
            label: t("contact"),
            value: person ? (
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{person.name}</span>
                {person.phone && <PhoneLink phone={person.phone} icon />}
                {person.email && <MailLink email={person.email} />}
              </span>
            ) : (
              none
            ),
          },
        ]}
      />
      {can(actor.role, "event", "write") && (
        <AppointmentActions
          id={termin.id}
          title={termin.title}
          editHref={editHref}
          closeHref={closeHref}
          reopenHref={reopenHref}
        />
      )}
    </Vorschau>
  );
}
