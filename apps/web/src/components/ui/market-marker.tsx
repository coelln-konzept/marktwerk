import { isMarketColor, type MarketColor } from "@marktwerk/core";
import { cn } from "@/lib/utils";
import { EventTypeMarker } from "./event-type-tag";

/*
 * "Marktfarbe" (decision 2026-10-22): a thin bar (or, on the events list, a round dot) in the market's colour
 * next to its name. Never a background and never the only cue (the name always sits next to it). Class names
 * are static strings so Tailwind sees them; tokens live in globals.css (`--market-<key>`).
 */

const BAR: Record<MarketColor, string> = {
  plum: "bg-market-plum",
  rose: "bg-market-rose",
  brown: "bg-market-brown",
  sand: "bg-market-sand",
  olive: "bg-market-olive",
  petrol: "bg-market-petrol",
  cyan: "bg-market-cyan",
  slate: "bg-market-slate",
  indigo: "bg-market-indigo",
  graphite: "bg-market-graphite",
};

/** Background class of a market colour swatch (for the picker); neutral for an unknown value. */
export function marketColorClass(color: string | null | undefined): string {
  return isMarketColor(color) ? BAR[color] : "bg-status-neutral-dot";
}

/**
 * A thin vertical bar (`shape="dot"`: a 12px round dot, events list) in the market colour. Falls back to the event type's square when the event has no
 * preset colour, and renders nothing when neither is known. Decorative: the market name sits next to it.
 */
export function MarketMarker({
  color,
  typeKey,
  size = "md",
  shape = "bar",
  className,
}: {
  color: string | null | undefined;
  typeKey?: string | null;
  /** `lg`: a taller, wider bar for lists where the market is the row's identity (Veranstaltungen). */
  size?: "md" | "lg";
  /** `dot`: a round 12px dot instead of the bar (events list, CF9-4 option C); `size` is ignored. */
  shape?: "bar" | "dot";
  className?: string;
}) {
  if (isMarketColor(color))
    return (
      <span
        aria-hidden
        data-market-color={color}
        className={cn(
          "inline-block shrink-0 self-center rounded-full",
          shape === "dot" ? "size-3" : size === "lg" ? "h-7 w-1.5" : "h-4 w-1",
          BAR[color],
          className,
        )}
      />
    );
  return <EventTypeMarker typeKey={typeKey} className={className} />;
}

/**
 * The market's Kürzel (Fahrplan R15) joined to its colour marker: a short bar in the market colour (or the
 * type square) directly followed by the code in small, bold capitals ("▌ALT"). For places where space is
 * tight (Kalender month chips). Decorative like the marker: the market name sits next to it or in the
 * tooltip, so screen readers skip it.
 */
export function MarketCode({
  code,
  color,
  typeKey,
  className,
}: {
  code: string;
  color: string | null | undefined;
  typeKey?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-market-code={code}
      className={cn(
        "inline-flex shrink-0 items-center gap-[3px] whitespace-nowrap font-semibold text-[10px] leading-none tracking-wide",
        className,
      )}
    >
      <MarketMarker
        color={color}
        typeKey={typeKey}
        className={isMarketColor(color) ? "h-3" : "size-2"}
      />
      {code}
    </span>
  );
}
