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
import { appointmentAccess } from "./appointment-privacy";

/**
 * Vorschau of one Besprechung: title, date (weekday and KW), time, place, notes and the contact (phone and
 * e-mail as links, "In Kontakte öffnen" when the contact is a saved one). Bearbeiten opens the Besprechung
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
  if (!can(actor.role, "appointment", "read")) return null;
  const appointment = await getAppointment(id);
  if (!appointment) return null;
  const t = await getTranslations("appointments.vorschau");
  const locale = await getLocale();
  const none = <span className="text-muted-foreground">{t("none")}</span>;
  const time = !appointment.startsAt
    ? t("allDay")
    : appointment.endsAt
      ? t("timeRange", { from: appointment.startsAt, to: appointment.endsAt })
      : t("timeFrom", { from: appointment.startsAt });
  // Contact data and the link to the Ort need their own read permission (field users have neither).
  const access = appointmentAccess(actor.role, appointment);
  const canEdit = can(actor.role, "appointment", "write");
  const canArchive = can(actor.role, "appointment", "delete");
  const place =
    appointment.venueId && access.venueLink ? (
      <Link
        href={`/orte/${appointment.venueId}` as never}
        className="inline-flex items-center gap-1.5 font-medium text-accent-soft-foreground hover:underline"
      >
        {appointment.venueName}
        <ExternalLink aria-hidden className="size-3.5" />
      </Link>
    ) : appointment.venueName ? (
      <span className="break-words">{appointment.venueName}</span>
    ) : appointment.locationText ? (
      <span className="break-words">{appointment.locationText}</span>
    ) : (
      none
    );
  const person = access.contact;
  return (
    <Vorschau
      kind={t("kind")}
      title={appointment.title}
      closeHref={closeHref}
      openHref={person?.id ? `/kontakte?vorschau=${person.id}` : undefined}
      openLabel={t("openContact")}
    >
      <Facts
        items={[
          {
            label: t("date"),
            value: `${formatDateWithWeekday(appointment.onDate, locale)} · ${formatWeek(appointment.onDate, locale)}`,
          },
          { label: t("time"), value: <span className="tabular">{time}</span> },
          { label: t("where"), value: place },
          {
            label: t("notes"),
            value: appointment.notes ? (
              <span className="whitespace-pre-wrap break-words text-small">
                {appointment.notes}
              </span>
            ) : (
              none
            ),
          },
          ...(access.showContact
            ? [
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
              ]
            : []),
        ]}
      />
      {(canEdit || canArchive) && (
        <AppointmentActions
          canEdit={canEdit}
          canArchive={canArchive}
          id={appointment.id}
          title={appointment.title}
          editHref={editHref}
          closeHref={closeHref}
          reopenHref={reopenHref}
        />
      )}
    </Vorschau>
  );
}
