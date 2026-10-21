/**
 * Schema check for migration 0002 (Phase 1 modules, M2-M6): one minimal row graph per area, plus the
 * constraints and foreign-key rules the later milestones rely on. Services come with the milestones;
 * this only proves the tables accept what the data model says they should and refuse what it forbids.
 */

import {
  checklist,
  checklistTemplate,
  document,
  employmentContract,
  event,
  eventPermit,
  expense,
  installment,
  notification,
  obligation,
  obligationCompletion,
  outboundMessage,
  payable,
  payrollPeriod,
  permit,
  permitRequirement,
  shift,
  shiftRevision,
  staffMember,
  task,
  taskCheckItem,
  taskComment,
  taskDependency,
  templateItem,
  templateVersion,
  vehicle,
  vehicleIssue,
} from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDatabase, seedCatalogue } from "../helpers/fixtures";

afterAll(async () => {
  await db.$client.end();
});

/** The constraint (or SQLSTATE) a rejected query failed on; Drizzle wraps the pg error as `cause`. */
async function violation(promise: PromiseLike<unknown>): Promise<string | null> {
  try {
    await promise;
  } catch (error) {
    let current: unknown = error;
    while (current && typeof current === "object") {
      const e = current as { constraint?: string; code?: string; cause?: unknown };
      if (e.constraint) return e.constraint;
      if (e.code?.length === 5) return e.code;
      current = e.cause;
    }
    throw error;
  }
  return null;
}

type Catalogue = Awaited<ReturnType<typeof seedCatalogue>>;
let cat: Catalogue;

async function insertEvent(name = "Flohmarkt Test", startsOn = "2027-05-02") {
  const [row] = await db
    .insert(event)
    .values({
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      name,
      season: Number(startsOn.slice(0, 4)),
      startsOn,
      endsOn: startsOn,
      times: cat.times,
      pricePerMCents: 1200,
      bookingFeeCents: 500,
    })
    .returning();
  if (!row) throw new Error("event insert failed");
  return row;
}

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
});

describe("templates and tasks (M2)", () => {
  async function templateGraph() {
    const [template] = await db
      .insert(checklistTemplate)
      .values({ name: "Ablauf Flohmarkt", eventTypeId: cat.type.id })
      .returning();
    if (!template) throw new Error("template insert failed");
    const [version] = await db
      .insert(templateVersion)
      .values({ templateId: template.id, version: 1, status: "published", publishedAt: new Date() })
      .returning();
    if (!version) throw new Error("version insert failed");
    const [item] = await db
      .insert(templateItem)
      .values({
        versionId: version.id,
        stableKey: "permit.apply",
        title: "Genehmigung beantragen",
        category: "permits",
        anchorKey: "event_day",
        offsetDays: -120,
        dutyRoleId: cat.roles.lead.id,
        estimateMinutes: 45,
      })
      .returning();
    if (!item) throw new Error("item insert failed");
    return { template, version, item };
  }

  it("instantiates template → version → item → checklist → task with check item, comment and dependency", async () => {
    const { template, version, item } = await templateGraph();
    const ev = await insertEvent();
    const [list] = await db
      .insert(checklist)
      .values({
        eventId: ev.id,
        templateId: template.id,
        templateVersionId: version.id,
        name: template.name,
      })
      .returning();
    if (!list) throw new Error("checklist insert failed");

    const values = {
      eventId: ev.id,
      checklistId: list.id,
      templateItemId: item.id,
      templateStableKey: item.stableKey,
      source: "template" as const,
      title: item.title,
      category: item.category,
      assigneeId: cat.staff.anna.id,
      dueAt: new Date("2027-01-02T08:00:00Z"),
      estimateMinutes: item.estimateMinutes,
    };
    const [a] = await db.insert(task).values(values).returning();
    const [b] = await db
      .insert(task)
      .values({ ...values, templateStableKey: "permit.pay", title: "Gebühr zahlen" })
      .returning();
    if (!a || !b) throw new Error("task insert failed");
    expect(a.status).toBe("todo");
    expect(a.boardSort).toBe(0);
    expect(a.rolloverCount).toBe(0);

    await db.insert(taskCheckItem).values({ taskId: a.id, title: "Formular ausfüllen" });
    await db.insert(taskComment).values({
      taskId: a.id,
      authorStaffMemberId: cat.staff.ben.id,
      body: "Bitte bis Freitag",
      mentionedStaffMemberIds: [cat.staff.anna.id],
    });
    await db.insert(taskDependency).values({ taskId: b.id, dependsOnTaskId: a.id });

    // Deleting the checklist removes its tasks and, through them, check items, comments and dependencies.
    await db.delete(checklist).where(eq(checklist.id, list.id));
    expect(await db.select().from(task)).toHaveLength(0);
    expect(await db.select().from(taskCheckItem)).toHaveLength(0);
    expect(await db.select().from(taskComment)).toHaveLength(0);
    expect(await db.select().from(taskDependency)).toHaveLength(0);
  });

  it("keeps one task per template item in a checklist, but allows manual tasks freely", async () => {
    const { template, version, item } = await templateGraph();
    const ev = await insertEvent();
    const [list] = await db
      .insert(checklist)
      .values({ eventId: ev.id, templateId: template.id, templateVersionId: version.id, name: "x" })
      .returning();
    if (!list) throw new Error("checklist insert failed");
    const fromTemplate = {
      eventId: ev.id,
      checklistId: list.id,
      templateStableKey: item.stableKey,
      title: "A",
    };
    await db.insert(task).values(fromTemplate);
    expect(await violation(db.insert(task).values(fromTemplate))).toBe("task_checklist_stable_key");

    const manual = { eventId: ev.id, checklistId: list.id, title: "Eigene Aufgabe" };
    await db.insert(task).values([manual, manual]);
  });

  it("refuses a done task without completion time, a self-dependency and a second draft version", async () => {
    const { template, version } = await templateGraph();
    const ev = await insertEvent();
    expect(
      await violation(db.insert(task).values({ eventId: ev.id, title: "x", status: "done" })),
    ).toBe("task_done_completed");
    const [t] = await db.insert(task).values({ eventId: ev.id, title: "x" }).returning();
    if (!t) throw new Error("task insert failed");
    expect(
      await violation(db.insert(taskDependency).values({ taskId: t.id, dependsOnTaskId: t.id })),
    ).toBe("task_dependency_not_self");
    expect(
      await violation(db.insert(task).values({ eventId: ev.id, title: "x", estimateMinutes: -5 })),
    ).toBe("task_estimate");

    await db.insert(templateVersion).values({ templateId: template.id, version: 2 });
    expect(
      await violation(db.insert(templateVersion).values({ templateId: template.id, version: 3 })),
    ).toBe("template_version_one_draft");
    expect(
      await violation(
        db
          .insert(templateVersion)
          .values({ templateId: template.id, version: 4, status: "published" }),
      ),
    ).toBe("template_version_published_at");
    expect(
      await violation(
        db.insert(templateVersion).values({ templateId: template.id, version: version.version }),
      ),
    ).toBe("template_version_templateId_version_unique");
  });

  it("deletes a staff member's tasks assignment with set null, not the task", async () => {
    const ev = await insertEvent();
    const [t] = await db
      .insert(task)
      .values({ eventId: ev.id, title: "x", assigneeId: cat.staff.ben.id })
      .returning();
    if (!t) throw new Error("task insert failed");
    await db.delete(staffMember).where(eq(staffMember.id, cat.staff.ben.id));
    const [after] = await db.select().from(task).where(eq(task.id, t.id));
    expect(after?.assigneeId).toBeNull();
  });
});

describe("permits (M3)", () => {
  it("links requirement → permit → event_permit and cascades from the event", async () => {
    const [req] = await db
      .insert(permitRequirement)
      .values({
        venueId: cat.venue.id,
        category: "city",
        permitType: "market_permit",
        title: "Marktgenehmigung",
        cadence: "per_season",
        leadTimeDays: 120,
        submissionWindowStartMd: "10-01",
        submissionWindowEndMd: "11-30",
        expectedDecisionMd: "01-15",
        deliverables: { stickers: 100 },
      })
      .returning();
    if (!req) throw new Error("requirement insert failed");
    const [p] = await db
      .insert(permit)
      .values({
        requirementId: req.id,
        venueId: cat.venue.id,
        season: 2027,
        category: req.category,
        permitType: req.permitType,
        title: req.title,
        applyBy: "2026-11-30",
        validFrom: "2027-01-01",
        validUntil: "2027-12-31",
        conditions: ["Müll bis 18 Uhr entfernen"],
      })
      .returning();
    if (!p) throw new Error("permit insert failed");
    expect(p.status).toBe("not_started");

    const e1 = await insertEvent("Flohmarkt 1", "2027-05-02");
    const e2 = await insertEvent("Flohmarkt 2", "2027-06-06");
    await db.insert(eventPermit).values([
      { eventId: e1.id, permitId: p.id },
      { eventId: e2.id, permitId: p.id, required: false },
    ]);
    expect(await violation(db.insert(eventPermit).values({ eventId: e1.id, permitId: p.id }))).toBe(
      "event_permit_event_id_permit_id_pk",
    );

    await db.delete(eventPermit).where(eq(eventPermit.eventId, e1.id));
    expect(await db.select().from(eventPermit)).toHaveLength(1);

    // A renewal can point at the permit it replaces; deleting the old one just detaches it.
    const [renewal] = await db
      .insert(permit)
      .values({
        supersedesId: p.id,
        category: "city",
        permitType: "market_permit",
        title: "Marktgenehmigung 2028",
      })
      .returning();
    await db.delete(eventPermit);
    await db.delete(permit).where(eq(permit.id, p.id));
    const [kept] = await db
      .select()
      .from(permit)
      .where(eq(permit.id, renewal?.id ?? ""));
    expect(kept?.supersedesId).toBeNull();
  });

  it("refuses malformed month-days and a validity range that ends before it starts", async () => {
    const base = {
      venueId: cat.venue.id,
      category: "city" as const,
      permitType: "water" as const,
      title: "Wasser",
      cadence: "per_event" as const,
    };
    expect(
      await violation(
        db.insert(permitRequirement).values({ ...base, submissionWindowEndMd: "13-01" }),
      ),
    ).toBe("permit_requirement_month_days");
    expect(
      await violation(db.insert(permitRequirement).values({ ...base, leadTimeDays: -1 })),
    ).toBe("permit_requirement_lead_time");
    expect(
      await violation(
        db.insert(permit).values({
          category: "city",
          permitType: "water",
          title: "Wasser",
          validFrom: "2027-02-01",
          validUntil: "2027-01-01",
        }),
      ),
    ).toBe("permit_validity");
  });
});

describe("staff hours (M4)", () => {
  it("records contract → shift → revision and protects time records", async () => {
    const ev = await insertEvent();
    const [contract] = await db
      .insert(employmentContract)
      .values({
        staffMemberId: cat.staff.anna.id,
        type: "minijob",
        hourlyRateCents: 1390,
        contractedHoursPerWeek: 10.5,
        validFrom: "2026-01-01",
      })
      .returning();
    expect(contract?.contractedHoursPerWeek).toBe(10.5);

    const [s] = await db
      .insert(shift)
      .values({
        eventId: ev.id,
        staffMemberId: cat.staff.anna.id,
        dutyRoleId: cat.roles.setup.id,
        workDate: "2027-05-02",
        plannedStart: "06:00",
        plannedEnd: "15:30",
        breakMinutes: 30,
      })
      .returning();
    if (!s) throw new Error("shift insert failed");
    expect(s.status).toBe("requested");
    expect(s.version).toBe(1);

    await db.insert(shiftRevision).values({
      shiftId: s.id,
      version: 1,
      reason: "Ende korrigiert",
      before: { actualEnd: "15:00" },
      changedByStaffMemberId: cat.staff.ben.id,
    });
    expect(
      await violation(
        db.insert(shiftRevision).values({ shiftId: s.id, version: 1, reason: "x", before: {} }),
      ),
    ).toBe("shift_revision_shiftId_version_unique");

    // Time records outlive people and events: neither can be deleted while a shift points at it.
    expect(
      await violation(db.delete(staffMember).where(eq(staffMember.id, cat.staff.anna.id))),
    ).toBe("shift_staff_member_id_staff_member_id_fk");
    expect(await violation(db.delete(event).where(eq(event.id, ev.id)))).toBe(
      "shift_event_id_event_id_fk",
    );

    // Deleting the shift takes its revisions along.
    await db.delete(shift).where(eq(shift.id, s.id));
    expect(await db.select().from(shiftRevision)).toHaveLength(0);
  });

  it("refuses overlapping-looking nonsense: bad validity, negative break, mid-month payroll", async () => {
    expect(
      await violation(
        db.insert(employmentContract).values({
          staffMemberId: cat.staff.anna.id,
          type: "student",
          validFrom: "2026-06-01",
          validUntil: "2026-05-31",
        }),
      ),
    ).toBe("employment_contract_validity");
    expect(
      await violation(
        db
          .insert(shift)
          .values({ staffMemberId: cat.staff.anna.id, workDate: "2027-05-02", breakMinutes: -1 }),
      ),
    ).toBe("shift_break");
    expect(await violation(db.insert(payrollPeriod).values({ month: "2026-09-15" }))).toBe(
      "payroll_period_month",
    );
    expect(
      await violation(db.insert(payrollPeriod).values({ month: "2026-09-01", status: "exported" })),
    ).toBe("payroll_period_status_dates");
    await db.insert(payrollPeriod).values({ month: "2026-09-01" });
    expect(await violation(db.insert(payrollPeriod).values({ month: "2026-09-01" }))).toBe(
      "payroll_period_month_unique",
    );
  });
});

describe("payables, instalments, receipts (M5)", () => {
  it("holds a payable with instalments and cascades them", async () => {
    const ev = await insertEvent();
    const [p] = await db
      .insert(payable)
      .values({
        title: "Sicherheitsdienst",
        scope: "event",
        eventId: ev.id,
        category: "security",
        totalGrossCents: 180000,
        vatRateBp: 1900,
      })
      .returning();
    if (!p) throw new Error("payable insert failed");
    const [first] = await db
      .insert(installment)
      .values([
        {
          payableId: p.id,
          sort: 1,
          dueOn: "2027-04-01",
          amountCents: 90000,
          status: "paid",
          paidOn: "2027-03-30",
          paidAmountCents: 90000,
          method: "bank_transfer",
        },
        { payableId: p.id, sort: 2, dueOn: "2027-04-27", amountCents: 90000 },
      ])
      .returning();
    if (!first) throw new Error("installment insert failed");

    await db.insert(expense).values({
      spentOn: "2027-05-02",
      amountCents: 1299,
      description: "Kabelbinder",
      eventId: ev.id,
    });

    // A receipt keeps its payable alive (evidence outlives the record).
    await db.insert(document).values({
      kind: "receipt",
      fileName: "rechnung.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1234,
      sha256: "a".repeat(64),
      storageKey: "receipts/rechnung.pdf",
      payableId: p.id,
    });
    expect(await violation(db.delete(payable).where(eq(payable.id, p.id)))).toBe(
      "document_payable_id_payable_id_fk",
    );
    await db.delete(document);
    await db.delete(payable).where(eq(payable.id, p.id));
    expect(await db.select().from(installment)).toHaveLength(0);
  });

  it("enforces scope targets, paid fields, amounts and the document rules", async () => {
    expect(
      await violation(
        db
          .insert(payable)
          .values({ title: "x", scope: "event", category: "other", totalGrossCents: 100 }),
      ),
    ).toBe("payable_scope_target");
    expect(
      await violation(
        db.insert(payable).values({
          title: "x",
          scope: "venue_season",
          venueId: cat.venue.id,
          category: "location",
          totalGrossCents: 100,
        }),
      ),
    ).toBe("payable_scope_target");
    await db.insert(payable).values({
      title: "Platzmiete 2027",
      scope: "venue_season",
      venueId: cat.venue.id,
      season: 2027,
      category: "location",
      totalGrossCents: 1_200_000,
      critical: true,
    });
    const [p] = await db
      .insert(payable)
      .values({
        title: "Haftpflicht",
        scope: "company",
        category: "insurance",
        totalGrossCents: 240000,
      })
      .returning();
    if (!p) throw new Error("payable insert failed");

    expect(
      await violation(
        db.insert(installment).values({ payableId: p.id, dueOn: "2027-01-15", amountCents: 0 }),
      ),
    ).toBe("installment_amount");
    expect(
      await violation(
        db
          .insert(installment)
          .values({ payableId: p.id, dueOn: "2027-01-15", amountCents: 100, status: "paid" }),
      ),
    ).toBe("installment_paid");
    expect(
      await violation(
        db.insert(installment).values([
          { payableId: p.id, sort: 1, dueOn: "2027-01-15", amountCents: 100 },
          { payableId: p.id, sort: 1, dueOn: "2027-04-15", amountCents: 100 },
        ]),
      ),
    ).toBe("installment_payableId_sort_unique");

    const file = {
      fileName: "a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      sha256: "b".repeat(64),
      storageKey: "k1",
    };
    expect(await violation(db.insert(document).values(file))).toBe("document_has_link");
    expect(
      await violation(db.insert(document).values({ ...file, sha256: "XYZ", payableId: p.id })),
    ).toBe("document_sha256");
  });
});

describe("company (M6) and notifications (M3)", () => {
  it("records vehicle → obligation → completion and vehicle issue", async () => {
    const [v] = await db
      .insert(vehicle)
      .values({
        name: "Transporter 1",
        plate: "K-MW 1001",
        grossWeightKg: 3500,
        odometerKm: 120000,
      })
      .returning();
    if (!v) throw new Error("vehicle insert failed");
    expect(
      await violation(db.insert(vehicle).values({ name: "Doppelt", plate: "K-MW 1001" })),
    ).toBe("vehicle_plate_unique");

    const [o] = await db
      .insert(obligation)
      .values({
        kind: "hu",
        title: "HU / TÜV",
        scope: "vehicle",
        vehicleId: v.id,
        intervalMonths: 24,
        nextDueOn: "2027-03-20",
        responsibleStaffMemberId: cat.staff.anna.id,
      })
      .returning();
    if (!o) throw new Error("obligation insert failed");
    expect(o.leadDays).toBe(14);
    const [c] = await db
      .insert(obligationCompletion)
      .values({
        obligationId: o.id,
        doneOn: "2025-03-20",
        costCents: 12500,
        nextDueOnAfter: "2027-03-20",
      })
      .returning();
    if (!c) throw new Error("completion insert failed");
    await db.insert(vehicleIssue).values({ vehicleId: v.id, title: "Rücklicht defekt" });
    await db.insert(document).values({
      kind: "photo",
      fileName: "ruecklicht.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      sha256: "c".repeat(64),
      storageKey: "photos/ruecklicht.jpg",
      vehicleId: v.id,
    });

    expect(
      await violation(
        db
          .insert(obligation)
          .values({ title: "x", scope: "vehicle", responsibleStaffMemberId: cat.staff.anna.id }),
      ),
    ).toBe("obligation_scope_target");
    expect(
      await violation(
        db.insert(obligation).values({
          title: "x",
          scope: "company",
          intervalMonths: 0,
          responsibleStaffMemberId: cat.staff.anna.id,
        }),
      ),
    ).toBe("obligation_intervals");
    expect(
      await violation(
        db.insert(vehicleIssue).values({ vehicleId: v.id, title: "x", status: "resolved" }),
      ),
    ).toBe("vehicle_issue_resolved");

    // The completion history goes with its obligation; the vehicle stays while it has documents.
    await db.delete(obligation).where(eq(obligation.id, o.id));
    expect(await db.select().from(obligationCompletion)).toHaveLength(0);
    expect(await violation(db.delete(vehicle).where(eq(vehicle.id, v.id)))).toBe(
      "document_vehicle_id_vehicle_id_fk",
    );
  });

  it("dedupes notifications per recipient and cascades them with the person", async () => {
    const row = {
      recipientStaffMemberId: cat.staff.anna.id,
      reason: "overdue" as const,
      title: "Aufgabe überfällig",
      dedupeKey: "task:1:overdue:2027-05-02",
    };
    const [n] = await db.insert(notification).values(row).returning();
    expect(n?.state).toBe("unread");
    expect(await violation(db.insert(notification).values(row))).toBe(
      "notification_recipientStaffMemberId_dedupeKey_unique",
    );
    // Same key for someone else, and rows without a key, are fine.
    await db.insert(notification).values({ ...row, recipientStaffMemberId: cat.staff.ben.id });
    await db.insert(notification).values([
      { ...row, dedupeKey: undefined },
      { ...row, dedupeKey: undefined },
    ]);

    await db.insert(outboundMessage).values({
      channel: "email",
      recipientStaffMemberId: cat.staff.anna.id,
      notificationId: n?.id,
      templateKey: "digest.daily",
      renderedText: "Heute fällig: 3 Aufgaben",
    });
    const [msg] = await db.select().from(outboundMessage);
    expect(msg?.status).toBe("queued");
    await db.delete(notification).where(eq(notification.id, n?.id ?? ""));
    const [after] = await db.select().from(outboundMessage);
    expect(after?.notificationId).toBeNull();
  });
});
