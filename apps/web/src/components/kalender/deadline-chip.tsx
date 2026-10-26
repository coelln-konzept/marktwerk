import {
  CalendarClock,
  CircleCheck,
  type LucideIcon,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { OVERDUE_ICON, WARNING_ICON } from "@/lib/due-ui";
import { cn } from "@/lib/utils";
import type { CalendarItem, CalendarLayer } from "@/server/queries/due";

export const LAYER_ICONS: Record<CalendarLayer, LucideIcon> = {
  tasks: CircleCheck,
  permits: ShieldCheck,
  shifts: Users,
  installments: Wallet,
  obligations: Truck,
};

const TONE_CLASSES: Record<NonNullable<CalendarItem["tone"]>, string> = {
  ok: "bg-status-ok-bg text-status-ok",
  warn: "bg-status-warn-bg text-status-warn",
  critical: "bg-status-critical-bg text-status-critical",
  neutral: "bg-status-neutral-bg text-foreground-2",
};

/**
 * Compact entry of a module layer (task, permit, rate, shift, obligation) for the month grid. Layer =
 * icon, urgency = colour + the vocabulary icon (red octagon = überfällig, triangle = Achtung) + hidden text
 * (never colour alone); it links to the thing itself.
 */
export function DeadlineChip({
  item,
  layerLabel,
  toneLabel,
}: {
  item: CalendarItem;
  layerLabel: string;
  /** Spoken/hidden text for warn and critical, e.g. "Achtung". */
  toneLabel?: string;
}) {
  const Icon = LAYER_ICONS[item.layer] ?? CalendarClock;
  const tone = item.tone ?? "neutral";
  return (
    <Link
      href={item.href as never}
      title={`${layerLabel}: ${item.title}`}
      className={cn(
        "flex items-center gap-1 truncate rounded-md px-1 py-0.5 font-medium text-tiny hover:brightness-95",
        TONE_CLASSES[tone],
      )}
    >
      {tone === "critical" && <OVERDUE_ICON aria-hidden className="size-3 shrink-0" />}
      {tone === "warn" && <WARNING_ICON aria-hidden className="size-3 shrink-0" />}
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">
        {layerLabel}
        {toneLabel ? `, ${toneLabel}` : ""}:{" "}
      </span>
      <span className="truncate">{item.title}</span>
    </Link>
  );
}
