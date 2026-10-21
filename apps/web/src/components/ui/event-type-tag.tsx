import { cn } from "@/lib/utils";

export const EVENT_TYPE_KEYS = ["flea", "antique", "city_festival", "food_wine"] as const;
export type EventTypeKey = (typeof EVENT_TYPE_KEYS)[number];

const STYLES: Record<EventTypeKey, string> = {
  flea: "bg-type-flea-bg text-type-flea",
  antique: "bg-type-antique-bg text-type-antique",
  city_festival: "bg-type-city-festival-bg text-type-city-festival",
  food_wine: "bg-type-food-wine-bg text-type-food-wine",
};

const SQUARE: Record<EventTypeKey, string> = {
  flea: "bg-type-flea",
  antique: "bg-type-antique",
  city_festival: "bg-type-city-festival",
  food_wine: "bg-type-food-wine",
};

function isKey(key: string): key is EventTypeKey {
  return (EVENT_TYPE_KEYS as readonly string[]).includes(key);
}

/** Background + text colour classes for an event type (static strings, so Tailwind sees them). */
export function eventTypeClasses(typeKey: string): string {
  return isKey(typeKey) ? STYLES[typeKey] : "bg-status-neutral-bg text-foreground-2";
}

/** Muted identity colour with a square marker; kept apart from status colours. */
export function EventTypeTag({
  typeKey,
  children,
  className,
}: {
  typeKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const key = isKey(typeKey) ? typeKey : null;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-2 font-semibold text-tiny",
        eventTypeClasses(typeKey),
        className,
      )}
    >
      {key && <span aria-hidden className={cn("size-2 rounded-[2px] opacity-85", SQUARE[key])} />}
      {children}
    </span>
  );
}

export function EventTypeSquare({ typeKey, className }: { typeKey: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-[2px]",
        isKey(typeKey) ? SQUARE[typeKey] : "bg-status-neutral-dot",
        className,
      )}
    />
  );
}
