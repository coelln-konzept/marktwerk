import { formatPhone, type MapPlace, mapsSearchUrl } from "@marktwerk/core";
import { MapPin, Phone } from "lucide-react";

/**
 * Phone number as a tel: link with the readable German grouping ("+49 176 04069381"). Renders
 * `fallback` (dimmed) when there is no number. Shared by Kontakte, Orte, Team and Aussteller.
 */
export function PhoneLink({
  phone,
  fallback = null,
  icon,
}: {
  phone: string | null | undefined;
  fallback?: React.ReactNode;
  icon?: boolean;
}) {
  if (!phone) return <span className="text-faint-foreground">{fallback}</span>;
  return (
    <a
      href={`tel:${phone.replace(/\s+/g, "")}`}
      className="tabular inline-flex items-center gap-1.5 whitespace-nowrap hover:underline"
    >
      {icon && <Phone aria-hidden className="size-3.5 text-muted-foreground" />}
      {formatPhone(phone)}
    </a>
  );
}

export function MailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className="break-all text-accent-soft-foreground hover:underline">
      {email}
    </a>
  );
}

/**
 * The address as a link to the maps app (UX-016), opened in a new tab; stored coordinates are used when
 * there are some. Without a town it stays plain text; without any address it renders `fallback`.
 */
export function AddressLink({
  place,
  fallback = null,
  title,
}: {
  place: MapPlace;
  fallback?: React.ReactNode;
  /** Tooltip, e.g. "In Karte öffnen". */
  title?: string;
}) {
  const text = addressLine(place);
  const href = mapsSearchUrl(place);
  if (!text) return <span className="text-faint-foreground">{fallback}</span>;
  if (!href) return <span>{text}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="inline-flex items-start gap-1.5 text-accent-soft-foreground hover:underline"
    >
      <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {text}
    </a>
  );
}

/** "Straße 1, 50667 Köln" from whatever parts exist. */
export function addressLine(parts: {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string {
  const town = [parts.postalCode, parts.city].filter(Boolean).join(" ");
  return [parts.street, town].filter(Boolean).join(", ");
}
