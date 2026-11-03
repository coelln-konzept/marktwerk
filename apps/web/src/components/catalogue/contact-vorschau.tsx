import { can } from "@marktwerk/core";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ContactActions } from "@/components/contacts/contact-actions";
import { ContactReach } from "@/components/contacts/contact-reach";
import { addressLine, MailLink, PhoneLink } from "@/components/ui/phone";
import { Facts, Vorschau } from "@/components/ui/vorschau";
import { getActor } from "@/server/actor";
import { getContact } from "@/server/queries/contacts";
import { ContactKindBadge } from "./kinds";

/** Vorschau of one contact with all fields and the venues it owns. Has no detail page of its own. */
export async function ContactVorschau({ id, closeHref }: { id: string; closeHref: string }) {
  const contact = await getContact(id);
  if (!contact) return null;
  const t = await getTranslations("contacts");
  const actor = await getActor();
  const locale = await getLocale();
  // Every place that still points at this contact (landowner of a venue or party to an agreement).
  const places = [
    ...new Set([
      ...contact.venues.map((v) => v.name),
      ...contact.agreements.map((a) => a.venueName),
    ]),
  ];
  const address = addressLine(contact);
  return (
    <Vorschau
      kind={t("vorschau.kind")}
      title={contact.name}
      closeHref={closeHref}
      badges={<ContactKindBadge kind={contact.kind} label={t(`kinds.${contact.kind}`)} />}
    >
      <Facts
        items={[
          { label: t("vorschau.person"), value: contact.contactPerson ?? t("none") },
          {
            label: t("vorschau.phone"),
            value: contact.phone ? <PhoneLink phone={contact.phone} /> : t("none"),
          },
          {
            label: t("vorschau.email"),
            value: contact.email ? <MailLink email={contact.email} /> : t("none"),
          },
          { label: t("vorschau.address"), value: address || t("none") },
          {
            label: t("vorschau.notes"),
            value: contact.notes ? <span className="text-small">{contact.notes}</span> : t("none"),
          },
        ]}
      />
      <ContactReach name={contact.name} phone={contact.phone} email={contact.email} primary />
      <section aria-labelledby="vorschau-venues">
        <h3
          id="vorschau-venues"
          className="mb-1.5 font-semibold text-muted-foreground text-tiny uppercase tracking-wide"
        >
          {t("vorschau.venues")}
        </h3>
        {contact.venues.length === 0 ? (
          <p className="text-muted-foreground text-small">{t("vorschau.noVenues")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {contact.venues.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/orte/${v.id}` as never}
                  className="inline-flex items-center gap-1.5 font-medium text-accent-soft-foreground text-small hover:underline"
                >
                  {v.name}
                  <ExternalLink aria-hidden className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {contact.agreements.length > 0 && (
        <section aria-labelledby="vorschau-agreements">
          <h3
            id="vorschau-agreements"
            className="mb-1.5 font-semibold text-muted-foreground text-tiny uppercase tracking-wide"
          >
            {t("vorschau.agreements")}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {contact.agreements.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/orte/${a.venueId}` as never}
                  className="inline-flex items-center gap-1.5 font-medium text-accent-soft-foreground text-small hover:underline"
                >
                  {a.venueName}
                  <ExternalLink aria-hidden className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {places.length > 0 && (
        <p className="text-muted-foreground text-small">
          {t("vorschau.usedAt", {
            places: new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
              places,
            ),
          })}
        </p>
      )}
      <ContactActions
        id={contact.id}
        name={contact.name}
        closeHref={closeHref}
        canWrite={can(actor.role, "contact", "write")}
        canArchive={can(actor.role, "contact", "delete")}
      />
    </Vorschau>
  );
}
