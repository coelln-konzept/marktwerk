/**
 * M6 seed: vehicles, obligations (HU, UVV, service, insurance, KSK report) and their history.
 *
 * Derived here, deterministically (not in the dataset): `obligation.kind` (from the title), one
 * `obligation_completion` per obligation with a `last_done_on`, `vehicle.odometer_recorded_on` (the
 * reference date) and two sample vehicle issues (one open, one resolved).
 */

import { schema } from "@marktwerk/db";
import { REFERENCE_DATE } from "@marktwerk/synthetic";
import { derivedId, insertAll, type SeedContext, type Tx } from "./shared";

type Kind = (typeof schema.obligationKind.enumValues)[number];

function kindOf(title: string): Kind {
  if (title.startsWith("HU")) return "hu";
  if (title.startsWith("UVV")) return "uvv";
  if (title.startsWith("Inspektion")) return "service";
  if (title.includes("versicherung") || title.includes("Versicherung")) return "insurance";
  if (title.startsWith("KSK")) return "report";
  return "other";
}

/** [key, months, valid from]: research 07 §D. HU: vans up to 3.5 t every 24 months, heavier every 12. UVV: yearly. */
const FLEET_PARAMETERS = [
  ["hu_interval_months_up_to_3500kg", 24, "2026-01-01"],
  ["hu_interval_months_over_3500kg", 12, "2026-01-01"],
  ["uvv_interval_months", 12, "2026-01-01"],
] as const;

export async function seedCompany(tx: Tx, { data }: SeedContext) {
  // The synthetic dataset carries the HU rows; the UVV interval is added here (data, not code).
  const have = new Set(data.legalParameters.map((p) => `${p.key}|${p.validFrom}`));
  const missing = FLEET_PARAMETERS.filter(([key, , from]) => !have.has(`${key}|${from}`));
  if (missing.length > 0) {
    await insertAll(
      tx,
      schema.legalParameter,
      missing.map(([key, value, validFrom]) => ({ key, value, validFrom })),
      "legal parameters (M6 gaps)",
    );
  }

  await insertAll(
    tx,
    schema.vehicle,
    data.vehicles.map((v) => ({
      id: v.id,
      name: v.name,
      plate: v.plate,
      make: v.make,
      model: v.model,
      vin: v.vin,
      firstRegistrationOn: v.firstRegistrationOn,
      grossWeightKg: v.grossWeightKg,
      odometerKm: v.odometerKm,
      odometerRecordedOn: REFERENCE_DATE,
      insurer: v.insurer,
      policyNumber: v.policyNumber,
      notes: v.notes,
    })),
    "vehicles",
  );

  await insertAll(
    tx,
    schema.obligation,
    data.obligations.map((o) => ({
      id: o.id,
      kind: kindOf(o.title),
      title: o.title,
      scope: o.scope,
      vehicleId: o.vehicleId,
      venueId: o.venueId,
      intervalMonths: o.intervalMonths,
      intervalKm: o.intervalKm,
      nextDueOn: o.nextDueOn,
      nextDueKm: o.nextDueKm,
      leadDays: o.leadDays,
      responsibleStaffMemberId: o.responsibleStaffMemberId,
      createsPayable: o.createsPayable,
      lastDoneOn: o.lastDoneOn,
    })),
    "obligations",
  );

  await insertAll(
    tx,
    schema.obligationCompletion,
    data.obligations.flatMap((o) =>
      o.lastDoneOn
        ? [
            {
              id: derivedId("obligation_completion", `${o.id}:${o.lastDoneOn}`),
              obligationId: o.id,
              doneOn: o.lastDoneOn,
              nextDueOnAfter: o.nextDueOn,
            },
          ]
        : [],
    ),
    "obligation completions",
  );

  const [first, second] = data.vehicles;
  const reporter = data.obligations[0]?.responsibleStaffMemberId ?? null;
  await insertAll(
    tx,
    schema.vehicleIssue,
    [
      second && {
        id: derivedId("vehicle_issue", `${second.id}:rear-light`),
        vehicleId: second.id,
        title: "Rücklicht links flackert",
        description: "Fällt bei Erschütterung kurz aus. Vor dem nächsten Markt prüfen.",
        severity: "major" as const,
        status: "open" as const,
        reportedByStaffMemberId: reporter,
        reportedAt: new Date("2026-10-17T07:30:00Z"),
      },
      first && {
        id: derivedId("vehicle_issue", `${first.id}:wiper`),
        vehicleId: first.id,
        title: "Scheibenwischer streift",
        severity: "minor" as const,
        status: "resolved" as const,
        reportedByStaffMemberId: reporter,
        reportedAt: new Date("2026-09-05T06:10:00Z"),
        resolvedAt: new Date("2026-09-08T12:00:00Z"),
        resolvedByStaffMemberId: reporter,
        resolutionNote: "Wischerblätter getauscht.",
      },
    ].filter((row): row is NonNullable<typeof row> => Boolean(row)),
    "vehicle issues",
  );
}
