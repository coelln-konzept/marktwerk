import { eventTypeClasses } from "@/components/ui/event-type-tag";
import { MarketMarker } from "@/components/ui/market-marker";
import { EVENT_STATUS, type EventStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { EventPopoverTrigger } from "./event-popover";

/**
 * Event entry of the Kalender month grid: market marker (bar in the market colour, or the type square),
 * status icon (hourglass = geplant, check = bestätigt, … the same icons as the status badge) and the
 * name on up to two lines. The chip's tint stays the event type's. A multi-day event joins its neighbour
 * days into one bar (square corners where it continues); on a `continuation` day the content is kept but
 * invisible, so the bar has the same height, and "Tag 2/3" is only spoken and in the tooltip (UT-11 #1).
 * A click opens the event popover in place (UT2-08); the chip stays a link to the event for a new tab.
 */
export function EventChip({
  eventId,
  href,
  typeKey,
  color,
  name,
  status,
  statusLabel,
  span,
  spanLabel,
  continuation = false,
}: {
  eventId: string;
  /** The event page (middle-click, "open in new tab"). */
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
  /** A later day of a multi-day event inside the same week: the bar continues without repeating the name. */
  continuation?: boolean;
}) {
  const cancelled = status === "cancelled";
  const Icon = EVENT_STATUS[status].icon;
  const continuesBefore = span !== undefined && span.index > 1;
  const continuesAfter = span !== undefined && span.index < span.total;
  return (
    <EventPopoverTrigger
      eventId={eventId}
      href={href}
      title={[name, statusLabel, spanLabel].filter(Boolean).join(" · ")}
      className={cn(
        "flex cursor-pointer items-start gap-1 break-words rounded-md px-1 py-0.5 font-medium text-tiny leading-snug hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:outline-2 data-[popup-open]:outline-ring",
        eventTypeClasses(typeKey),
        cancelled && "opacity-70",
        continuesBefore && "-ml-1.5 rounded-l-none pl-2.5",
        continuesAfter && "-mr-1.5 rounded-r-none pr-2.5",
      )}
    >
      <span className="sr-only">{statusLabel}: </span>
      <span
        aria-hidden={continuation || undefined}
        className={cn("contents", continuation && "[&>*]:invisible")}
      >
        <MarketMarker
          color={color}
          typeKey={typeKey}
          className={cn(color ? "h-3" : "size-2", "mt-[3px] shrink-0")}
        />
        <Icon aria-hidden className="mt-[2px] size-3 shrink-0" strokeWidth={2.25} />
        <span className="min-w-0">
          <span className={cn(cancelled && "line-through")}>{name}</span>
        </span>
      </span>
      <span className="sr-only">
        {continuation ? name : ""}
        {spanLabel ? `, ${spanLabel}` : ""}
      </span>
    </EventPopoverTrigger>
  );
}
