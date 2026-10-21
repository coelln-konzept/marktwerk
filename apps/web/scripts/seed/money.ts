/**
 * M5 seed: payables with their instalments, plus a small derived sample for the event money tab.
 *
 * From the synthetic dataset: payables and instalments (ids kept). The payable status is not stored (derived
 * from the instalments). Scope: the generator marks venue/season fees (location fee, toilets, standpipe,
 * permit fee) as `company` with a venue and a season; the schema calls that `venue_season`.
 *
 * Derived here, deterministically (not in the dataset): `paid_by` of paid instalments (the office),
 * a cost plan and one sponsoring income for each Stadtfest, and a few fuel expenses per vehicle on past
 * event days. No `document` rows: there are no real files to point at, so every paid instalment counts as
 * "Beleg fehlt" until receipts are uploaded.
 */

import { schema } from "@marktwerk/db";
import { REFERENCE_DATE } from "@marktwerk/synthetic";
import { derivedId, insertAll, type SeedContext, type Tx } from "./shared";

type Scope = "event" | "company" | "vehicle" | "venue_season";

/** Planned cost per category for a Stadtfest, in cents (derived demo values). */
const FESTIVAL_PLAN: [
  category: "security" | "gema" | "cleaning_waste" | "toilets" | "marketing",
  cents: number,
][] = [
  ["security", 190000],
  ["gema", 50000],
  ["cleaning_waste", 60000],
  ["toilets", 90000],
  ["marketing", 40000],
];

export async function seedMoney(tx: Tx, { data, officeStaffId }: SeedContext) {
  const scopeOf = (p: (typeof data.payables)[number]): Scope =>
    p.scope === "company" && p.venueId && p.season ? "venue_season" : p.scope;

  await insertAll(
    tx,
    schema.payable,
    data.payables.map((p) => ({
      id: p.id,
      counterpartyContactId: p.counterpartyContactId,
      title: p.title,
      scope: scopeOf(p),
      eventId: p.eventId,
      venueId: p.venueId,
      season: p.season,
      vehicleId: p.vehicleId,
      permitId: p.permitId,
      category: p.category,
      totalGrossCents: p.totalGrossCents,
      vatRateBp: p.vatRateBp,
      critical: p.critical,
      notes: p.notes,
    })),
    "payables",
  );

  await insertAll(
    tx,
    schema.installment,
    data.installments.map((i) => ({
      id: i.id,
      payableId: i.payableId,
      sort: i.sort,
      dueOn: i.dueOn,
      amountCents: i.amountCents,
      status: i.status,
      paidOn: i.paidOn,
      paidAmountCents: i.paidAmountCents,
      paidByStaffMemberId: i.paidOn ? officeStaffId : null,
      method: i.method,
      reference: i.reference,
    })),
    "installments",
  );

  // Event money sample: plan + income for the (non-cancelled) Stadtfeste.
  const festivalTypeId = data.eventTypes.find((t) => t.key === "city_festival")?.id;
  const festivals = data.events.filter(
    (e) => e.eventTypeId === festivalTypeId && e.status !== "cancelled",
  );
  await insertAll(
    tx,
    schema.eventBudgetLine,
    festivals.flatMap((e) =>
      FESTIVAL_PLAN.map(([category, plannedCents]) => ({
        id: derivedId("event_budget_line", `${e.id}:${category}`),
        eventId: e.id,
        category,
        plannedCents,
      })),
    ),
    "event budget lines",
  );
  await insertAll(
    tx,
    schema.eventIncome,
    festivals.map((e) => ({
      id: derivedId("event_income", `${e.id}:sponsoring`),
      eventId: e.id,
      label: "Sponsoring Stadtwerke (Demo)",
      amountCents: 250000,
      receivedOn: e.startsOn < REFERENCE_DATE ? e.startsOn : null,
    })),
    "event income",
  );

  // Fuel expenses: two per vehicle, on the days of past events.
  const pastEvents = data.events
    .filter((e) => e.status !== "cancelled" && e.endsOn < REFERENCE_DATE)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
  const fuelPaidBy = data.obligations[0]?.responsibleStaffMemberId ?? officeStaffId;
  await insertAll(
    tx,
    schema.expense,
    data.vehicles.flatMap((vehicle, v) =>
      [v * 3, v * 3 + 5].flatMap((at, n) => {
        const event = pastEvents[at];
        if (!event) return [];
        return [
          {
            id: derivedId("expense", `${vehicle.id}:fuel:${n}`),
            spentOn: event.startsOn,
            amountCents: 6420 + v * 730 + n * 410,
            category: "transport_fuel" as const,
            description: `Tanken ${vehicle.name}`,
            merchant: "Tankstelle (Demo)",
            eventId: event.id,
            vehicleId: vehicle.id,
            paidByStaffMemberId: fuelPaidBy,
            method: "card" as const,
          },
        ];
      }),
    ),
    "expenses",
  );
}
