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
import { HealthShape } from "@/components/ui/health";
import { cn } from "@/lib/utils";
import type { CalendarItem, CalendarLayer } from "@/server/queries/due";
import type { DisplayItem } from "./group-deadlines";

export const LAYER_ICONS: Record<CalendarLayer, LucideIcon> = {
  tasks: CircleCheck,
  permits: ShieldCheck,
  shifts: Users,
  installments: Wallet,
  obligations: Truck,
};

export const TONE_CLASSES: Record<NonNullable<CalendarItem["tone"]>, string> = {
  ok: "bg-status-ok-bg text-status-ok",
  warn: "bg-status-warn-bg text-status-warn",
  critical: "bg-status-critical-bg text-status-critical",
  neutral: "bg-status-neutral-bg text-foreground-2",
};

/**
 * Compact entry of a module layer (task, permit, rate, shift, obligation) for the month grid. Layer =
 * icon, urgency = colour + shape + hidden text (never colour alone); it links to the thing itself.
 * Same-day entries of one kind arrive as a single summary ("70 Genehmigungen: Entscheidung erwartet").
 */
export function DeadlineChip({
  item,
  layerLabel,
  toneLabel,
}: {
  item: DisplayItem;
  layerLabel: string;
  /** Spoken/hidden text for warn and critical, e.g. "Achtung". */
  toneLabel?: string;
}) {
  const Icon = LAYER_ICONS[item.layer] ?? CalendarClock;
  const tone = item.tone ?? "neutral";
  const grouped = item.group !== undefined;
  return (
    <Link
      href={item.href as never}
      title={`${layerLabel}: ${[item.kindLabel, item.text].filter(Boolean).join(": ")}`}
      className={cn(
        "flex items-start gap-1 rounded-md px-1 py-0.5 font-medium text-tiny leading-snug hover:brightness-95",
        TONE_CLASSES[tone],
        grouped && "font-semibold",
      )}
    >
      {(tone === "warn" || tone === "critical") && (
        <HealthShape level={tone} className="mt-[3px] size-2.5 shrink-0" />
      )}
      <Icon aria-hidden className="mt-[2px] size-3 shrink-0" />
      <span className="sr-only">
        {layerLabel}
        {toneLabel ? `, ${toneLabel}` : ""}:{" "}
      </span>
      {/* Object first, verb last: a chip cut after two lines still says where and what. */}
      <span className="line-clamp-2 min-w-0 break-words">
        {item.text}
        {item.kindLabel && !grouped && (
          <span className="font-normal opacity-80"> · {item.kindLabel}</span>
        )}
      </span>
    </Link>
  );
}
