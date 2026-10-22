import {
  addDays,
  can,
  isRole,
  monthEnd,
  type PayrollReminderStage,
  payrollDeadline,
  payrollMonthToClose,
  payrollReminderStage,
  recordingAlertDate,
  recordingDeadline,
} from "@marktwerk/core";
import {
  type Database,
  employmentContract,
  event,
  insertNotifications,
  type NewNotification,
  payrollPeriod,
  shift,
  staffMember,
  user,
} from "@marktwerk/db";
import { and, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

/** How far back unrecorded shifts are looked at (older ones were reminded long ago). */
const LOOK_BACK_DAYS = 31;

const berlinDay = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);

/** People who run the month close: staff members whose login may manage hours (owner, manager). */
async function officeRecipients(db: Database): Promise<string[]> {
  const rows = await db
    .select({ id: staffMember.id, role: user.role })
    .from(staffMember)
    .innerJoin(user, eq(user.id, staffMember.userId))
    .where(
      and(eq(staffMember.active, true), isNull(staffMember.archivedAt), eq(user.banned, false)),
    );
  return rows.filter((r) => isRole(r.role) && can(r.role, "team", "manage")).map((r) => r.id);
}

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const monthLabel = (month: string) =>
  `${MONTHS_DE[Number(month.slice(5, 7)) - 1] ?? month.slice(5, 7)} ${month.slice(0, 4)}`;
const dayLabel = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.`;

const PAYROLL_TEXT: Record<
  Exclude<PayrollReminderStage, "none">,
  { severity: NewNotification["severity"]; title: (m: string, deadline: string) => string }
> = {
  remind: {
    severity: "warning",
    title: (m, d) => `${m} abschließen: Stunden prüfen, sperren und exportieren (bis ${d})`,
  },
  due: {
    severity: "warning",
    title: (m) => `${m} muss heute abgeschlossen werden`,
  },
  overdue: {
    severity: "critical",
    title: (m, d) => `${m} ist überfällig (Frist war ${d})`,
  },
};

/**
 * Month close reminders (M4): from the 12th the office is told to close the previous month, on the 15th
 * (deadline) and after that again, stronger. Done once the month is exported or has no hours at all.
 * One notification per person, month and stage (`dedupeKey`), so running it twice changes nothing.
 */
async function monthCloseReminders(
  db: Database,
  today: string,
  recipients: string[],
): Promise<number> {
  const stage = payrollReminderStage(today);
  if (stage === "none") return 0;
  const month = payrollMonthToClose(today);
  const [period] = await db
    .select({ id: payrollPeriod.id, status: payrollPeriod.status })
    .from(payrollPeriod)
    .where(eq(payrollPeriod.month, month));
  if (period?.status === "exported") return 0;

  const [work] = await db
    .select({ id: shift.id })
    .from(shift)
    .where(
      and(
        gte(shift.workDate, month),
        lte(shift.workDate, monthEnd(month)),
        inArray(shift.status, ["requested", "confirmed", "worked"]),
      ),
    )
    .limit(1);
  const [paid] = work
    ? [work]
    : await db
        .select({ id: employmentContract.id })
        .from(employmentContract)
        .where(
          and(
            lte(employmentContract.validFrom, monthEnd(month)),
            or(isNull(employmentContract.validUntil), gte(employmentContract.validUntil, month)),
            sql`${employmentContract.fixedMonthlyPayCents} is not null`,
          ),
        )
        .limit(1);
  if (!paid) return 0;

  const text = PAYROLL_TEXT[stage];
  const label = monthLabel(month);
  const deadline = payrollDeadline(month);
  return insertNotifications(
    db,
    recipients.map((recipientStaffMemberId) => ({
      recipientStaffMemberId,
      reason: "payroll_close" as const,
      severity: text.severity,
      subjectType: "payroll_period",
      subjectId: period?.id,
      title: text.title(label, dayLabel(deadline)),
      link: `/team/stunden/abschluss?month=${month.slice(0, 7)}`,
      dedupeKey: `payroll_close:${month.slice(0, 7)}:${stage}`,
    })),
  );
}

type MissingStage = "alert" | "deadline" | "overdue";

function missingStage(workDate: string, today: string): MissingStage | null {
  if (today < recordingAlertDate(workDate)) return null;
  const deadline = recordingDeadline(workDate);
  if (today < deadline) return "alert";
  return today === deadline ? "deadline" : "overdue";
}

/**
 * Shifts of the last month whose actual times are still missing (§17 MiLoG): day 5 after the work a
 * warning, on day 7 (the legal deadline) and after it a critical one. Grouped per event and day.
 */
async function missingHoursReminders(
  db: Database,
  today: string,
  recipients: string[],
): Promise<number> {
  const rows = await db
    .select({
      eventId: shift.eventId,
      eventName: event.name,
      workDate: shift.workDate,
      n: sql<number>`count(*)::int`,
    })
    .from(shift)
    .leftJoin(event, eq(event.id, shift.eventId))
    .where(
      and(
        lt(shift.workDate, today),
        gte(shift.workDate, addDays(today, -LOOK_BACK_DAYS)),
        inArray(shift.status, ["requested", "confirmed", "worked"]),
        or(isNull(shift.actualStart), isNull(shift.actualEnd)),
        or(isNull(event.id), ne(event.status, "cancelled")),
      ),
    )
    .groupBy(shift.eventId, event.name, shift.workDate);

  const items: NewNotification[] = [];
  for (const row of rows) {
    const stage = missingStage(row.workDate, today);
    if (!stage) continue;
    const where = row.eventName ?? "Büro";
    const deadline = dayLabel(recordingDeadline(row.workDate));
    const title =
      stage === "alert"
        ? `Arbeitszeiten fehlen: ${where} am ${dayLabel(row.workDate)} (${row.n}), Frist ${deadline}`
        : stage === "deadline"
          ? `Frist heute: Arbeitszeiten für ${where} am ${dayLabel(row.workDate)} (${row.n})`
          : `Frist verpasst: Arbeitszeiten für ${where} am ${dayLabel(row.workDate)} (${row.n})`;
    for (const recipientStaffMemberId of recipients) {
      items.push({
        recipientStaffMemberId,
        reason: "hours_missing",
        severity: stage === "alert" ? "warning" : "critical",
        subjectType: row.eventId ? "event" : "shifts",
        subjectId: row.eventId ?? undefined,
        title,
        link: row.eventId
          ? `/veranstaltungen/${row.eventId}/team`
          : `/team/schichten?month=${row.workDate.slice(0, 7)}`,
        dedupeKey: `hours_missing:${row.eventId ?? "office"}:${row.workDate}:${stage}`,
      });
    }
  }
  return insertNotifications(db, items);
}

/**
 * Daily (07:00): month close reminders from the 12th (deadline 15th) and missing-hours alerts on day 5
 * and day 7 after the work. Idempotent through deterministic dedupe keys.
 */
export async function payrollReminders(
  db: Database,
  now: Date = new Date(),
): Promise<{ created: number }> {
  const today = berlinDay(now);
  const recipients = await officeRecipients(db);
  if (recipients.length === 0) return { created: 0 };
  const created =
    (await monthCloseReminders(db, today, recipients)) +
    (await missingHoursReminders(db, today, recipients));
  return { created };
}
