import Link from "next/link";
import { EventTypeSquare, eventTypeClasses } from "@/components/ui/event-type-tag";
import { cn } from "@/lib/utils";

/** Compact event entry for calendars: type square + name, opens the Vorschau. */
export function EventChip({
  href,
  typeKey,
  name,
  cancelled,
}: {
  href: string;
  typeKey: string;
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
      <EventTypeSquare typeKey={typeKey} className="size-2" />
      <span className="truncate">{name}</span>
    </Link>
  );
}
