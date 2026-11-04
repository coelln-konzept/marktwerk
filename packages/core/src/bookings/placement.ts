/**
 * Stall placement on rows (research 02, data-model "Phase 2 sketch"): a placement is a metre interval
 * `[startCm, endCm)` on one row. Fixed numbered pitches would just be pre-cut intervals. The map only
 * draws rows; it never changes this model. Pure functions, no I/O.
 */

export interface PlacementRow {
  id: string;
  label: string;
  lengthCm: number;
  carAllowed: boolean;
  /** How many cars fit behind stalls on this row. */
  carSlots: number;
  power: boolean;
}

export interface Placement {
  id: string;
  rowId: string;
  startCm: number;
  endCm: number;
  car: boolean;
}

export interface PlaceableRequest {
  id: string;
  lengthCm: number;
  carRequested: boolean;
  power: boolean;
  preferredRowLabel?: string | null;
  preferredOffsetCm?: number | null;
}

/** Drop and nudge positions snap to this grid (half a metre). */
export const SNAP_CM = 50;

export const snapCm = (cm: number, step = SNAP_CM) => Math.round(cm / step) * step;

export type FitProblem = "out_of_row" | "overlap" | "no_car_space" | "no_power" | "gap_rule";

/**
 * Optional rule against unsellable leftovers (seen at a competitor, configurable per event): a stall
 * either touches its neighbour / the row end, or leaves at least `minGapCm` (`edgeMinCm` at row ends).
 */
export interface GapRule {
  minGapCm: number;
  edgeMinCm: number;
}

export const DEFAULT_GAP_RULE: GapRule = { minGapCm: 200, edgeMinCm: 300 };

interface Candidate {
  startCm: number;
  lengthCm: number;
  car: boolean;
  power?: boolean;
}

/** Why a placement can't go there, or null when it fits. `ignoreId` skips the placement being moved. */
export function checkFit(
  row: PlacementRow,
  existing: readonly Placement[],
  candidate: Candidate,
  ignoreId?: string,
  gapRule: GapRule | null = null,
): FitProblem | null {
  const end = candidate.startCm + candidate.lengthCm;
  if (candidate.startCm < 0 || end > row.lengthCm) return "out_of_row";
  const onRow = existing.filter((p) => p.rowId === row.id && p.id !== ignoreId);
  if (onRow.some((p) => candidate.startCm < p.endCm && p.startCm < end)) return "overlap";
  if (candidate.car && (!row.carAllowed || onRow.filter((p) => p.car).length >= row.carSlots)) {
    return "no_car_space";
  }
  if (candidate.power && !row.power) return "no_power";
  if (gapRule) {
    const leftEnd = Math.max(
      0,
      ...onRow.filter((p) => p.endCm <= candidate.startCm).map((p) => p.endCm),
    );
    const rightStart = Math.min(
      row.lengthCm,
      ...onRow.filter((p) => p.startCm >= end).map((p) => p.startCm),
    );
    const ok = (gap: number, atEdge: boolean) =>
      gap === 0 || gap >= (atEdge ? gapRule.edgeMinCm : gapRule.minGapCm);
    const leftAtEdge = !onRow.some((p) => p.endCm <= candidate.startCm);
    const rightAtEdge = !onRow.some((p) => p.startCm >= end);
    if (!ok(candidate.startCm - leftEnd, leftAtEdge) || !ok(rightStart - end, rightAtEdge)) {
      return "gap_rule";
    }
  }
  return null;
}

/** Free gaps on a row, in order. */
export function freeGaps(row: PlacementRow, existing: readonly Placement[], ignoreId?: string) {
  const taken = existing
    .filter((p) => p.rowId === row.id && p.id !== ignoreId)
    .sort((a, b) => a.startCm - b.startCm);
  const gaps: { startCm: number; endCm: number }[] = [];
  let cursor = 0;
  for (const p of taken) {
    if (p.startCm > cursor) gaps.push({ startCm: cursor, endCm: p.startCm });
    cursor = Math.max(cursor, p.endCm);
  }
  if (cursor < row.lengthCm) gaps.push({ startCm: cursor, endCm: row.lengthCm });
  return gaps;
}

/**
 * The fitting start nearest to `wantedCm` on this row, or null when nothing fits. Used for drops: the
 * stall lands where it was dropped or slides to the closest valid spot. Tries every snapped position
 * plus the exact gap edges (rows are at most ~100 m, so this is a few hundred checks).
 */
export function nearestFit(
  row: PlacementRow,
  existing: readonly Placement[],
  candidate: Omit<Candidate, "startCm">,
  wantedCm: number,
  ignoreId?: string,
  gapRule: GapRule | null = null,
): number | null {
  const starts = new Set<number>();
  for (let s = 0; s + candidate.lengthCm <= row.lengthCm; s += SNAP_CM) starts.add(s);
  for (const g of freeGaps(row, existing, ignoreId)) {
    starts.add(g.startCm);
    starts.add(g.endCm - candidate.lengthCm);
  }
  let best: number | null = null;
  for (const s of [...starts].sort((a, b) => a - b)) {
    if (checkFit(row, existing, { ...candidate, startCm: s }, ignoreId, gapRule) !== null) continue;
    if (best === null || Math.abs(s - wantedCm) < Math.abs(best - wantedCm)) best = s;
  }
  return best;
}

export interface AutoPlaceResult {
  placed: Placement[];
  /** Requests that found no space, with the reason the last tried row gave. */
  unplaced: { requestId: string; reason: "no_space" | "no_car_space" | "no_power" }[];
}

/**
 * "Autoplatz": places requests in order, Stammplatz preference first (its row, nearest to the offset),
 * then the first row with room. Bigger stalls go first so they don't end up without a gap. The result is
 * only a proposal; a person confirms it (research 02: placement status `proposed`).
 */
export function autoPlace(
  rows: readonly PlacementRow[],
  existing: readonly Placement[],
  requests: readonly PlaceableRequest[],
  gapRule: GapRule | null = null,
): AutoPlaceResult {
  const all = [...existing];
  const placed: Placement[] = [];
  const unplaced: AutoPlaceResult["unplaced"] = [];
  const order = [...requests].sort(
    (a, b) =>
      Number(Boolean(b.preferredRowLabel)) - Number(Boolean(a.preferredRowLabel)) ||
      b.lengthCm - a.lengthCm,
  );
  for (const req of order) {
    const candidate = { lengthCm: req.lengthCm, car: req.carRequested, power: req.power };
    const preferred = rows.find(
      (r) => req.preferredRowLabel && r.label.toUpperCase() === req.preferredRowLabel.toUpperCase(),
    );
    const tryRows = preferred ? [preferred, ...rows.filter((r) => r !== preferred)] : rows;
    let done = false;
    for (const row of tryRows) {
      const wanted = row === preferred ? (req.preferredOffsetCm ?? 0) : 0;
      const start = nearestFit(row, all, candidate, wanted, undefined, gapRule);
      if (start === null) continue;
      const p: Placement = {
        id: req.id,
        rowId: row.id,
        startCm: start,
        endCm: start + req.lengthCm,
        car: req.carRequested,
      };
      all.push(p);
      placed.push(p);
      done = true;
      break;
    }
    if (!done) {
      const reason = req.carRequested
        ? "no_car_space"
        : req.power && !rows.some((r) => r.power)
          ? "no_power"
          : "no_space";
      unplaced.push({ requestId: req.id, reason });
    }
  }
  return { placed, unplaced };
}

/** Occupied share of a row (0..1), for the row header and utilisation. */
export function rowUtilisation(row: PlacementRow, existing: readonly Placement[]): number {
  const used = existing
    .filter((p) => p.rowId === row.id)
    .reduce((sum, p) => sum + (p.endCm - p.startCm), 0);
  return row.lengthCm > 0 ? Math.min(1, used / row.lengthCm) : 0;
}

/**
 * Price for one date: frontage × price per metre + booking fee. Started half metres count as half
 * metres (rounded up to 50 cm). Integer cents, gross (VAT shown separately by the invoice later).
 */
export function quoteStall(input: {
  lengthCm: number;
  pricePerMCents: number;
  bookingFeeCents: number;
}): { frontageCents: number; feeCents: number; totalCents: number; billedCm: number } {
  const billedCm = Math.ceil(input.lengthCm / 50) * 50;
  const frontageCents = Math.round((billedCm * input.pricePerMCents) / 100);
  return {
    frontageCents,
    feeCents: input.bookingFeeCents,
    totalCents: frontageCents + input.bookingFeeCents,
    billedCm,
  };
}

/** Stall number printed on the plan and the confirmation: row label + metre position ("A-12"). */
export function stallNumber(rowLabel: string, startCm: number): string {
  return `${rowLabel}-${Math.floor(startCm / 100) + 1}`;
}

/** Why a stall cannot go anywhere on a row (shown to the person placing; never guessed around). */
export type NoFitReason =
  | { kind: "no_power" }
  | { kind: "car_not_allowed" }
  | { kind: "car_slots_full"; slots: number }
  | { kind: "too_long"; rowLengthCm: number }
  | { kind: "no_gap"; largestGapCm: number }
  | { kind: "gap_rule"; largestGapCm: number };

/**
 * The reason a stall has no valid start on this row, or null when it fits somewhere. Checks the most
 * fundamental requirement first (power, car allowed, car spaces, row length), then free gaps, then the
 * optional gap rule.
 */
export function explainNoFit(
  row: PlacementRow,
  existing: readonly Placement[],
  candidate: { lengthCm: number; car: boolean; power?: boolean },
  ignoreId?: string,
  gapRule: GapRule | null = null,
): NoFitReason | null {
  if (candidate.power && !row.power) return { kind: "no_power" };
  if (candidate.car && !row.carAllowed) return { kind: "car_not_allowed" };
  const onRow = existing.filter((p) => p.rowId === row.id && p.id !== ignoreId);
  if (candidate.car && onRow.filter((p) => p.car).length >= row.carSlots) {
    return { kind: "car_slots_full", slots: row.carSlots };
  }
  if (candidate.lengthCm > row.lengthCm) return { kind: "too_long", rowLengthCm: row.lengthCm };
  const largestGapCm = Math.max(
    0,
    ...freeGaps(row, existing, ignoreId).map((g) => g.endCm - g.startCm),
  );
  if (largestGapCm < candidate.lengthCm) return { kind: "no_gap", largestGapCm };
  if (nearestFit(row, existing, candidate, 0, ignoreId, gapRule) === null) {
    return { kind: "gap_rule", largestGapCm };
  }
  return null;
}

/** Reasons over all rows, grouped (same reason → one entry with its row labels); empty if it fits. */
export function explainUnplaceable(
  rows: readonly PlacementRow[],
  existing: readonly Placement[],
  candidate: { lengthCm: number; car: boolean; power?: boolean },
  ignoreId?: string,
  gapRule: GapRule | null = null,
): { reason: NoFitReason; rowLabels: string[] }[] {
  const groups: { reason: NoFitReason; rowLabels: string[] }[] = [];
  for (const row of rows) {
    const reason = explainNoFit(row, existing, candidate, ignoreId, gapRule);
    if (!reason) return [];
    const same = groups.find((g) => JSON.stringify(g.reason) === JSON.stringify(reason));
    if (same) same.rowLabels.push(row.label);
    else groups.push({ reason, rowLabels: [row.label] });
  }
  return groups;
}
