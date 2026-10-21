import { Phone } from "lucide-react";

/** "+4917604069381" -> "+49 176 04069381" (German mobile numbers); anything else is shown as stored. */
export function formatPhone(e164: string): string {
  const m = /^\+49(1[567]\d)(\d+)$/.exec(e164);
  if (m) return `+49 ${m[1]} ${m[2]}`;
  const g = /^\+49(\d+)$/.exec(e164);
  if (g) return `+49 ${g[1]}`;
  return e164;
}

/** Phone number as a tel: link; renders `fallback` when there is none. */
export function PhoneLink({
  phone,
  fallback,
  icon,
}: {
  phone: string | null;
  fallback: React.ReactNode;
  icon?: boolean;
}) {
  if (!phone) return <span className="text-faint-foreground">{fallback}</span>;
  return (
    <a
      href={`tel:${phone}`}
      className="tabular inline-flex items-center gap-1.5 whitespace-nowrap hover:underline"
    >
      {icon && <Phone aria-hidden className="size-3.5 text-muted-foreground" />}
      {formatPhone(phone)}
    </a>
  );
}
