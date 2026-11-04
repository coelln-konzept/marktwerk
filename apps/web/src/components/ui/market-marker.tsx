import { isMarketColor, type MarketColor } from "@marktwerk/core";
import { cn } from "@/lib/utils";
import { EventTypeMarker } from "./event-type-tag";

/*
 * "Marktfarbe" (decision 2026-10-22): a thin marker in the market's colour next to its name, never the only
 * cue (the name always sits next to it). Not a background, except the tinted rows of the events list
 * (CF9-4, `marketRowClass`). Class names are static strings so Tailwind sees them; tokens live in
 * globals.css (`--market-<key>`).
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

const BORDER: Record<MarketColor, string> = {
  plum: "border-l-market-plum",
  rose: "border-l-market-rose",
  brown: "border-l-market-brown",
  sand: "border-l-market-sand",
  olive: "border-l-market-olive",
  petrol: "border-l-market-petrol",
  cyan: "border-l-market-cyan",
  slate: "border-l-market-slate",
  indigo: "border-l-market-indigo",
  graphite: "border-l-market-graphite",
};

const ROW: Record<MarketColor, string> = {
  plum: "[--row-tint:var(--market-plum)]",
  rose: "[--row-tint:var(--market-rose)]",
  brown: "[--row-tint:var(--market-brown)]",
  sand: "[--row-tint:var(--market-sand)]",
  olive: "[--row-tint:var(--market-olive)]",
  petrol: "[--row-tint:var(--market-petrol)]",
  cyan: "[--row-tint:var(--market-cyan)]",
  slate: "[--row-tint:var(--market-slate)]",
  indigo: "[--row-tint:var(--market-indigo)]",
  graphite: "[--row-tint:var(--market-graphite)]",
};

/**
 * Tinted list row in the market colour (events list only, CF9-4 option B; styles in globals.css
 * `.market-row`). Undefined = no tint (no colour set).
 */
export function marketRowClass(color: string | null | undefined): string | undefined {
  return isMarketColor(color) ? cn("market-row", ROW[color]) : undefined;
}

/** Background class of a market colour swatch (for the picker); neutral for an unknown value. */
export function marketColorClass(color: string | null | undefined): string {
  return isMarketColor(color) ? BAR[color] : "bg-status-neutral-dot";
}

/** Left-border colour class for a container that carries the market bar (use with `border-l-4`). */
export function marketBorderClass(color: string | null | undefined): string | undefined {
  return isMarketColor(color) ? BORDER[color] : undefined;
}

/**
 * A thin vertical bar in the market colour. Falls back to the event type's square when the event has no
 * preset colour, and renders nothing when neither is known. Decorative: the market name sits next to it.
 */
export function MarketMarker({
  color,
  typeKey,
  size = "md",
  className,
}: {
  color: string | null | undefined;
  typeKey?: string | null;
  /** `lg`: a taller, wider bar for lists where the market is the row's identity (Veranstaltungen). */
  size?: "md" | "lg";
  className?: string;
}) {
  if (isMarketColor(color))
    return (
      <span
        aria-hidden
        data-market-color={color}
        className={cn(
          "inline-block shrink-0 self-center rounded-full",
          size === "lg" ? "h-7 w-1.5" : "h-4 w-1",
          BAR[color],
          className,
        )}
      />
    );
  return <EventTypeMarker typeKey={typeKey} className={className} />;
}
