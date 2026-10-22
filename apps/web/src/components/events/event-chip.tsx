import Link from "next/link";
import { eventTypeClasses } from "@/components/ui/event-type-tag";
import { MarketMarker } from "@/components/ui/market-marker";
import { cn } from "@/lib/utils";

/**
 * Compact event entry for calendars: market marker (falls back to the type square) + name, opens the
 * Vorschau. The chip's tint stays the event type's.
 */
export function EventChip({
  href,
  typeKey,
  color,
  name,
  cancelled,
}: {
  href: string;
  typeKey: string;
  color?: string | null;
  name: string;
  cancelled?: boolean;
}) {
  return (
    <Link
      href={href as never}
      scroll={false}
      title={name}
      className={cn(
        "flex items-center gap-1 truncate rounded-md px-1 py-0.5 font-medium text-tiny hover:bg-hover",
        eventTypeClasses(typeKey),
        cancelled && "line-through opacity-70",
      )}
    >
      <MarketMarker color={color} typeKey={typeKey} className={color ? "h-3" : "size-2"} />
      <span className="truncate">{name}</span>
    </Link>
  );
}
