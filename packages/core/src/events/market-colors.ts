/**
 * Market colour labels ("Marktfarbe", decision 2026-10-22): each market (preset) gets one muted
 * colour, shown as a thin bar or marker next to its name across the app. The palette deliberately
 * avoids the status hues (red, amber, green, info blue, waiting purple) so a market never reads as a
 * status; colour is never the only cue (the name is always shown). CSS tokens: `--market-<key>` in
 * apps/web/src/app/globals.css.
 */
export const MARKET_COLORS = [
  "plum",
  "rose",
  "brown",
  "sand",
  "olive",
  "petrol",
  "cyan",
  "slate",
  "indigo",
  "graphite",
] as const;

export type MarketColor = (typeof MARKET_COLORS)[number];

export function isMarketColor(value: unknown): value is MarketColor {
  return typeof value === "string" && (MARKET_COLORS as readonly string[]).includes(value);
}

/**
 * The colour for a new market: the least used one among the markets that exist (ties in palette
 * order), so colours repeat only once all ten are taken.
 */
export function nextMarketColor(used: readonly (string | null)[]): MarketColor {
  const counts = new Map<MarketColor, number>(MARKET_COLORS.map((c) => [c, 0]));
  for (const color of used)
    if (isMarketColor(color)) counts.set(color, (counts.get(color) ?? 0) + 1);
  let best: MarketColor = MARKET_COLORS[0];
  for (const color of MARKET_COLORS)
    if ((counts.get(color) ?? 0) < (counts.get(best) ?? 0)) best = color;
  return best;
}
