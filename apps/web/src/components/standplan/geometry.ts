import type { RowGeom } from "./store";
import type { PlanVenue } from "./types";

/** Aisle between rows and gap between zones on the default plan (centimetres). */
const AISLE_CM = 500;
const ZONE_GAP_CM = 1200;
const ZONE_HEADER_CM = 450;

/**
 * Default plan when nobody has drawn the venue yet: zones side by side in two columns, rows stacked
 * with an aisle. True to scale (1 SVG unit = 1 cm), so a 4 m stall is 400 units long everywhere.
 */
export function defaultLayout(venue: PlanVenue): Record<string, RowGeom> {
  const out: Record<string, RowGeom> = {};
  const colWidth =
    Math.max(1000, ...venue.zones.flatMap((z) => z.rows.map((r) => r.lengthCm))) + ZONE_GAP_CM;
  const colY: [number, number] = [0, 0];
  for (const zone of venue.zones) {
    const col = colY[0] <= colY[1] ? 0 : 1;
    let y = colY[col] + ZONE_HEADER_CM;
    for (const row of zone.rows) {
      out[row.id] = { x: col * colWidth, y, angle: 0 };
      y += row.depthCm + AISLE_CM;
    }
    colY[col] = y + ZONE_GAP_CM;
  }
  return out;
}

/** Zone label position: above its first row. */
export function zoneLabelPos(venue: PlanVenue, rows: Record<string, RowGeom>) {
  return venue.zones.flatMap((z) => {
    const g = z.rows[0] && rows[z.rows[0].id];
    return g ? [{ zoneId: z.id, name: z.name, x: g.x, y: g.y - 180 }] : [];
  });
}

/** Bounding box of all rows (rotated corners included) plus a margin. */
export function planBounds(
  venue: PlanVenue,
  rows: Record<string, RowGeom>,
  margin = 600,
): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const z of venue.zones) {
    for (const r of z.rows) {
      const g = rows[r.id];
      if (!g) continue;
      const a = (g.angle * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      for (const [px, py] of [
        [0, -300],
        [r.lengthCm, -300],
        [0, r.depthCm],
        [r.lengthCm, r.depthCm],
      ] as const) {
        xs.push(g.x + px * cos - py * sin);
        ys.push(g.y + px * sin + py * cos);
      }
    }
  }
  if (xs.length === 0) return { x: 0, y: 0, w: 1000, h: 1000 };
  const x = Math.min(...xs) - margin;
  const y = Math.min(...ys) - margin;
  return { x, y, w: Math.max(...xs) + margin - x, h: Math.max(...ys) + margin - y };
}
