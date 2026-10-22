import { obligationDedupeKey, obligationReminderPlan } from "@marktwerk/core";
import {
  type Database,
  escalationLog,
  insertNotifications,
  type NewNotification,
  obligation,
  staffMember,
  user,
  vehicle,
} from "@marktwerk/db";
import { and, eq, isNull } from "drizzle-orm";

const TIME_ZONE = "Europe/Berlin";

/** "2026-10-21" in the company's time zone. */
function berlinDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "2026-03-31" -> "31.03.2026". */
const germanDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/**
 * Reminders for recurring obligations (Firma tab): `obligation_due` notifications to the responsible person
 * `lead_days` before the due date (and on the day) and once it is overdue; the manager (login role `manager`)
 * is told as well once it has stayed overdue (`obligationReminderPlan` in @marktwerk/core, "+1 day -> manager").
 *
 * Idempotent: every notification carries a deterministic dedupe key per obligation, stage and due date/km, so
 * running it every 15 minutes or twice a day notifies once; moving the due date (or completing, which rolls it
 * forward) re-arms the reminders. The text is German, like the rest of the app; there is no per-person locale.
 */
export async function obligationReminders(
  db: Database,
  now: Date = new Date(),
): Promise<{ reminded: number; escalated: number }> {
  const today = berlinDate(now);

  const rows = await db
    .select({
      id: obligation.id,
      title: obligation.title,
      nextDueOn: obligation.nextDueOn,
      nextDueKm: obligation.nextDueKm,
      leadDays: obligation.leadDays,
      responsibleId: obligation.responsibleStaffMemberId,
      vehiclePlate: vehicle.plate,
      currentKm: vehicle.odometerKm,
    })
    .from(obligation)
    .leftJoin(vehicle, eq(vehicle.id, obligation.vehicleId))
    // The vehicle join is optional (company/venue obligations), but a retired vehicle's duties stay quiet.
    .where(and(isNull(obligation.archivedAt), isNull(vehicle.archivedAt)));

  const managers = await db
    .select({ id: staffMember.id })
    .from(staffMember)
    .innerJoin(user, eq(user.id, staffMember.userId))
    .where(
      and(eq(user.role, "manager"), eq(staffMember.active, true), isNull(staffMember.archivedAt)),
    );

  const reminders: NewNotification[] = [];
  const escalations: NewNotification[] = [];
  const logRows: (typeof escalationLog.$inferInsert)[] = [];

  for (const row of rows) {
    const plan = obligationReminderPlan({
      nextDueOn: row.nextDueOn,
      nextDueKm: row.nextDueKm,
      leadDays: row.leadDays,
      today,
      currentKm: row.currentKm,
    });
    if (!plan.stage) continue;

    const subject = row.vehiclePlate ? `${row.title} · ${row.vehiclePlate}` : row.title;
    const link = `/firma/pflichten/${row.id}`;
    const when = row.nextDueOn
      ? `fällig am ${germanDate(row.nextDueOn)}`
      : "beim Kilometerstand erreicht";
    const overdue = plan.stage === "overdue";
    reminders.push({
      recipientStaffMemberId: row.responsibleId,
      reason: "obligation_due",
      severity: overdue ? "warning" : "info",
      subjectType: "obligation",
      subjectId: row.id,
      title: overdue ? `Überfällig: ${subject}` : `Bald fällig: ${subject}`,
      body: overdue ? `Diese Pflicht war ${when}.` : `Diese Pflicht ist ${when}.`,
      link,
      dedupeKey: obligationDedupeKey(row.id, plan.stage, plan.dueKey),
    });

    if (!plan.escalate) continue;
    const dedupeKey = obligationDedupeKey(row.id, "escalated", plan.dueKey);
    for (const manager of managers) {
      if (manager.id === row.responsibleId) continue; // already told as the responsible person
      escalations.push({
        recipientStaffMemberId: manager.id,
        reason: "escalated",
        severity: "critical",
        subjectType: "obligation",
        subjectId: row.id,
        title: `Weiterhin überfällig: ${subject}`,
        body: `Diese Pflicht war ${when} und ist noch nicht erledigt.`,
        link,
        dedupeKey,
      });
      logRows.push({
        subjectType: "obligation",
        subjectId: row.id,
        level: 2,
        escalatedToStaffMemberId: manager.id,
        reason: "overdue",
        dedupeKey: `${dedupeKey}:${manager.id}`,
      });
    }
  }

  const reminded = await insertNotifications(db, reminders);
  const escalated = await insertNotifications(db, escalations);
  if (logRows.length > 0) await db.insert(escalationLog).values(logRows).onConflictDoNothing();
  return { reminded, escalated };
}
