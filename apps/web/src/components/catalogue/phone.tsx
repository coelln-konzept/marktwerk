/** +493023125555 → "+49 30 23125555". German area codes with two digits are known; others get three. */
const TWO_DIGIT_AREA_CODES = new Set(["30", "40", "69", "89"]);

export function formatPhone(e164: string): string {
  const match = /^\+49(\d{9,12})$/.exec(e164);
  if (!match) return e164;
  const national = match[1] as string;
  const area = TWO_DIGIT_AREA_CODES.has(national.slice(0, 2)) ? 2 : 3;
  return `+49 ${national.slice(0, area)} ${national.slice(area)}`;
}

/** Clickable phone number (tel: link on the E.164 form, readable text). */
export function PhoneLink({ e164 }: { e164: string }) {
  return (
    <a href={`tel:${e164}`} className="tabular whitespace-nowrap hover:underline">
      {formatPhone(e164)}
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

export function addressLine(parts: {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string {
  const town = [parts.postalCode, parts.city].filter(Boolean).join(" ");
  return [parts.street, town].filter(Boolean).join(", ");
}
