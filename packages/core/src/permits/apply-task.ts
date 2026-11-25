import type { PermitCadence } from "./status";

/**
 * Does a permit of this cadence cover several dates (season, year, multi-year, standing)? Such a permit is applied
 * for once per Ort and season (ADR 0024): it gets its own "… beantragen" task, and template tasks never apply for
 * it. Only `per_event` permits are applied for date by date (by a template task or their own task). A permit
 * without a requirement (cadence unknown) counts as a single-date one. Pure.
 */
export function permitCoversSeveralEvents(cadence: PermitCadence | null | undefined): boolean {
  return cadence != null && cadence !== "per_event";
}
