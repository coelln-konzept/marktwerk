import Link from "next/link";
import { eventTypeClasses } from "@/components/ui/event-type-tag";
import { MarketMarker } from "@/components/ui/market-marker";
import { EVENT_STATUS, type EventStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * Event entry of the Kalender month grid: market marker (bar in the market colour, or the type square),
 * status icon (hourglass = geplant, check = bestätigt, … the same icons as the status badge) and the
 * name on up to two lines. The chip's tint stays the event type's. A multi-day event shows "Tag 2/3"
 * and joins its neighbour days (square corners on the side where it continues).
 */
export function EventChip({
  href,
  typeKey,
  color,
  name,
  status,
  statusLabel,
  span,
  spanLabel,
}: {
  href: string;
  typeKey: string;
  color?: string | null;
  name: string;
  status: EventStatus;
  /** Spoken and tooltip text of the status ("bestätigt"). */
  statusLabel: string;
  /** Day `index` of `total` for events that last longer than a day. */
  span?: { index: number; total: number };
  /** "Tag 2/3" */
  spanLabel?: string;
}) {
  const cancelled = status === "cancelled";
  const Icon = EVENT_STATUS[status].icon;
  const continuesBefore = span !== undefined && span.index > 1;
  const continuesAfter = span !== undefined && span.index < span.total;
  return (
    <Link
      href={href as never}
      scroll={false}
      title={[name, statusLabel, spanLabel].filter(Boolean).join(" · ")}
      className={cn(
        "flex items-start gap-1 break-words rounded-md px-1 py-0.5 font-medium text-tiny leading-snug hover:bg-hover",
        eventTypeClasses(typeKey),
        cancelled && "opacity-70",
        continuesBefore && "-ml-1.5 rounded-l-none pl-2.5",
        continuesAfter && "-mr-1.5 rounded-r-none pr-2.5",
      )}
    >
      <MarketMarker
        color={color}
        typeKey={typeKey}
        className={cn(color ? "h-3" : "size-2", "mt-[3px] shrink-0")}
      />
      <Icon aria-hidden className="mt-[2px] size-3 shrink-0" strokeWidth={2.25} />
      <span className="sr-only">{statusLabel}: </span>
      <span className="min-w-0">
        <span className={cn(cancelled && "line-through")}>{name}</span>
        {spanLabel && <span className="tabular block font-normal opacity-80">{spanLabel}</span>}
      </span>
    </Link>
  );
}
