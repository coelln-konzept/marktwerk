import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A Termin in a Kalender day cell: icon, "09:00" or "ganztägig", then the title, in the neutral style of the
 * module layers. Links to its Vorschau (`?vorschau=termin:<id>`, the page's other parameters kept).
 */
export function AppointmentChip({
  href,
  title,
  startsAt,
  allDayLabel,
  kindLabel,
}: {
  href: string;
  title: string;
  startsAt: string | null;
  allDayLabel: string;
  kindLabel: string;
}) {
  const when = startsAt ?? allDayLabel;
  return (
    <Link
      href={href as never}
      scroll={false}
      title={`${kindLabel}: ${when} ${title}`}
      className={cn(
        "flex items-start gap-1 rounded-md bg-status-neutral-bg px-1 py-0.5 font-medium text-foreground-2 text-tiny leading-snug hover:brightness-95",
      )}
    >
      <CalendarClock aria-hidden className="mt-[2px] size-3 shrink-0" />
      <span className="sr-only">{kindLabel}: </span>
      <span className="line-clamp-2 min-w-0 break-words">
        <span className="tabular font-semibold">{when}</span> {title}
      </span>
    </Link>
  );
}
