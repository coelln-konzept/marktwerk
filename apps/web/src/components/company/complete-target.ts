import type { ObligationRow } from "@/server/queries/company";
import type { CompleteTarget } from "./complete-dialog";

/** What the "Erledigt …" dialog needs to know about an obligation (checks and the next-due preview). */
export function completeTargetOf(o: ObligationRow): CompleteTarget {
  return {
    id: o.id,
    title: o.title,
    kind: o.kind,
    intervalKm: o.intervalKm,
    onVehicle: o.scope === "vehicle",
    createsPayable: o.createsPayable,
    currentKm: o.currentKm,
    currentKmOn: o.currentKmOn,
    intervalMonths: o.intervalMonths,
    nextDueOn: o.nextDueOn,
    nextDueKm: o.nextDueKm,
    leadDays: o.leadDays,
    lastDoneOn: o.lastDoneOn,
  };
}
