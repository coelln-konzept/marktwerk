/**
 * M3 seed: permit requirements per venue, the permits made from them (per season / per event / multi-year)
 * and which events they cover. Permit fees are `payable`s and are seeded in money.ts.
 */

import { schema } from "@marktwerk/db";
import { insertAll, type SeedContext, type Tx } from "./shared";

export async function seedPermits(tx: Tx, { data }: SeedContext) {
  await insertAll(
    tx,
    schema.permitRequirement,
    data.permitRequirements.map((r) => ({
      id: r.id,
      venueId: r.venueId,
      category: r.category,
      permitType: r.permitType,
      title: r.title,
      authorityContactId: r.authorityContactId,
      cadence: r.cadence,
      leadTimeDays: r.leadTimeDays,
      submissionWindowStartMd: r.submissionWindowStartMd,
      submissionWindowEndMd: r.submissionWindowEndMd,
      expectedDecisionMd: r.expectedDecisionMd,
      typicalFeeCents: r.typicalFeeCents,
      deliverables: r.deliverables,
      notes: r.notes,
    })),
    "permit requirements",
  );

  await insertAll(
    tx,
    schema.permit,
    data.permits.map((p) => ({
      id: p.id,
      requirementId: p.requirementId,
      venueId: p.venueId,
      season: p.season,
      category: p.category,
      permitType: p.permitType,
      title: p.title,
      authorityContactId: p.authorityContactId,
      referenceNo: p.referenceNo,
      status: p.status,
      applyBy: p.applyBy,
      appliedAt: p.appliedAt,
      expectedDecisionOn: p.expectedDecisionOn,
      grantedAt: p.grantedAt,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
      conditions: p.conditions,
      deliverablesReceived: p.deliverablesReceived,
      responsibleStaffMemberId: p.responsibleStaffMemberId,
      notes: p.notes,
    })),
    "permits",
  );

  await insertAll(
    tx,
    schema.eventPermit,
    data.eventPermits.map(({ eventId, permitId, required }) => ({ eventId, permitId, required })),
    "event permits",
  );
}
