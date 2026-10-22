import { formatPhone } from "@marktwerk/core";
import { Phone } from "lucide-react";

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

/** "Straße 1, 50667 Köln" from whatever parts exist. */
export function addressLine(parts: {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string {
  const town = [parts.postalCode, parts.city].filter(Boolean).join(" ");
  return [parts.street, town].filter(Boolean).join(", ");
}
