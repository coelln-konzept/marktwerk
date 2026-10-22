import Link from "next/link";
import { eventTypeClasses } from "@/components/ui/event-type-tag";
import { MarketMarker } from "@/components/ui/market-marker";
import { cn } from "@/lib/utils";

/**
 * Compact event entry for calendars: market marker (falls back to the type square) + name, links to
 * `href`. The chip's tint stays the event type's. With `wrap` the full name shows on up to two lines
 * instead of being cut off (month view).
 */
export function EventChip({
  href,
  typeKey,
  color,
  name,
  cancelled,
  wrap,
}: {
  href: string;
  typeKey: string;
  color?: string | null;
  name: string;
  cancelled?: boolean;
  wrap?: boolean;
}) {
  return (
    <Link
      href={href as never}
      scroll={false}
      title={name}
      className={cn(
        "flex gap-1 rounded-md px-1 py-0.5 font-medium text-tiny hover:bg-hover",
        wrap ? "items-start break-words leading-snug" : "items-center truncate",
        eventTypeClasses(typeKey),
        cancelled && "line-through opacity-70",
      )}
    >
      <MarketMarker
        color={color}
        typeKey={typeKey}
        className={cn(color ? "h-3" : "size-2", wrap && "mt-[3px] shrink-0")}
      />
      <span className={wrap ? "min-w-0" : "truncate"}>{name}</span>
    </Link>
  );
}
