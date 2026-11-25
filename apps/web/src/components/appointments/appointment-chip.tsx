import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A Besprechung in a Kalender day cell: icon, the start time if it has one, then the title, in the neutral style of
 * the module layers. "ganztägig" is only spoken and in the tooltip: in a narrow cell it pushed the title out
 * (UT-11 #4). Links to its Vorschau (`?vorschau=besprechung:<id>`, the page's other parameters kept).
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
      <span className="sr-only">
        {kindLabel}
        {startsAt ? "" : `, ${allDayLabel}`}:{" "}
      </span>
      <span className="line-clamp-2 min-w-0 break-words">
        {startsAt && <span className="tabular font-semibold">{startsAt} </span>}
        {title}
      </span>
    </Link>
  );
}
