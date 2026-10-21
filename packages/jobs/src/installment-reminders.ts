import {
  addDays,
  businessDate,
  can,
  installmentReminderKey,
  isRole,
  openAmountCents,
  type ReminderStage,
  reminderStage,
} from "@marktwerk/core";
import {
  contact,
  type Database,
  escalationLog,
  insertNotifications,
  installment,
  type NewNotification,
  payable,
  staffMember,
  user,
} from "@marktwerk/db";
import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";

/**
 * Internal payment reminders (M5): the office is told when a rate is 14 days away, 3 days away, due today
 * and overdue. Nobody outside the company is ever contacted (payment reminders to counterparties are
 * sent by a person, CLAUDE.md). A critical payable (landlord, permit, penalty) that is overdue is also
 * escalated to the manager(s).
 *
 * Runs repeatedly and must be idempotent: every notification has a dedupe key made of the rate, the stage
 * and the due date, so a sweep never notifies twice and moving a due date re-arms the reminders. A rate that
 * got paid or cancelled in the meantime simply isn't selected any more.
 */

type Locale = "de" | "en";

const TEXT = {
  de: {
    titles: {
      d14: (p: string) => `Rate bald fällig: ${p}`,
      d3: (p: string) => `Rate in wenigen Tagen fällig: ${p}`,
      due: (p: string) => `Rate heute fällig: ${p}`,
      overdue: (p: string) => `Rate überfällig: ${p}`,
    },
    body: (rate: string, due: string, amount: string, to: string | null) =>
      `Rate ${rate}, fällig am ${due}, offen ${amount}${to ? `, an ${to}` : ""}.`,
    escalationTitle: (p: string) => `Kritische Zahlung überfällig: ${p}`,
    escalationBody: (rate: string, due: string, amount: string) =>
      `Rate ${rate} war am ${due} fällig, offen ${amount}. Wird als kritisch geführt.`,
    date: (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`,
    money: (cents: number) =>
      `${new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100)}`,
  },
  en: {
    titles: {
      d14: (p: string) => `Instalment due soon: ${p}`,
      d3: (p: string) => `Instalment due in a few days: ${p}`,
      due: (p: string) => `Instalment due today: ${p}`,
      overdue: (p: string) => `Instalment overdue: ${p}`,
    },
    body: (rate: string, due: string, amount: string, to: string | null) =>
      `Instalment ${rate}, due ${due}, ${amount} open${to ? `, to ${to}` : ""}.`,
    escalationTitle: (p: string) => `Critical payment overdue: ${p}`,
    escalationBody: (rate: string, due: string, amount: string) =>
      `Instalment ${rate} was due ${due}, ${amount} open. Marked critical.`,
    date: (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
    money: (cents: number) =>
      `${new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100)}`,
  },
} as const;

const SEVERITY: Record<ReminderStage, NewNotification["severity"]> = {
  d14: "info",
  d3: "warning",
  due: "warning",
  overdue: "critical",
};

export type InstallmentReminderResult = {
  /** New reminder notifications. */
  created: number;
  /** New escalation notifications to the manager(s). */
  escalated: number;
};

export async function installmentReminders(
  db: Database,
  now: Date = new Date(),
): Promise<InstallmentReminderResult> {
  const today = businessDate(now);

  // Everyone with a login who may work with money (owner and manager today), with their language.
  const people = (
    await db
      .select({ id: staffMember.id, role: user.role, locale: user.locale, banned: user.banned })
      .from(staffMember)
      .innerJoin(user, eq(user.id, staffMember.userId))
      .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
      .orderBy(asc(staffMember.displayName))
  ).filter((p) => !p.banned && isRole(p.role) && can(p.role, "finance", "read"));
  if (people.length === 0) return { created: 0, escalated: 0 };
  const managers = people.filter((p) => p.role === "manager");
  const localeOf = (p: { locale: string }): Locale => (p.locale === "en" ? "en" : "de");

  const rates = await db
    .select({
      id: installment.id,
      payableId: payable.id,
      title: payable.title,
      critical: payable.critical,
      sort: installment.sort,
      dueOn: installment.dueOn,
      amountCents: installment.amountCents,
      paidAmountCents: installment.paidAmountCents,
      status: installment.status,
      counterparty: contact.name,
    })
    .from(installment)
    .innerJoin(payable, eq(payable.id, installment.payableId))
    .leftJoin(contact, eq(contact.id, payable.counterpartyContactId))
    .where(
      and(
        inArray(installment.status, ["open", "partially_paid"]),
        isNull(payable.archivedAt),
        lte(installment.dueOn, addDays(today, 14)),
      ),
    )
    .orderBy(asc(installment.dueOn));

  // Position "2/3" needs the number of rates of each payable.
  const counts = new Map<string, number>();
  if (rates.length > 0) {
    const all = await db
      .select({ payableId: installment.payableId, id: installment.id })
      .from(installment)
      .where(
        inArray(
          installment.payableId,
          rates.map((r) => r.payableId),
        ),
      );
    for (const r of all) counts.set(r.payableId, (counts.get(r.payableId) ?? 0) + 1);
  }

  const reminders: NewNotification[] = [];
  const escalations: NewNotification[] = [];
  const escalationRows: (typeof escalationLog.$inferInsert)[] = [];
  for (const rate of rates) {
    const stage = reminderStage(rate.dueOn, today);
    const open = openAmountCents(rate);
    if (stage === null || open <= 0) continue;
    const position = `${rate.sort}/${counts.get(rate.payableId) ?? rate.sort}`;
    const link = `/finanzen/posten/${rate.payableId}`;
    const base = {
      subjectType: "installment",
      subjectId: rate.id,
      link,
    } as const;

    for (const person of people) {
      const text = TEXT[localeOf(person)];
      reminders.push({
        ...base,
        recipientStaffMemberId: person.id,
        reason: "installment_due",
        severity: rate.critical && stage !== "d14" ? "critical" : SEVERITY[stage],
        title: text.titles[stage](rate.title),
        body: text.body(position, text.date(rate.dueOn), text.money(open), rate.counterparty),
        dedupeKey: installmentReminderKey(rate.id, stage, rate.dueOn),
      });
    }

    if (stage === "overdue" && rate.critical) {
      for (const manager of managers) {
        const text = TEXT[localeOf(manager)];
        const dedupeKey = `installment:${rate.id}:escalated:${rate.dueOn}`;
        escalations.push({
          ...base,
          recipientStaffMemberId: manager.id,
          reason: "escalated",
          severity: "critical",
          title: text.escalationTitle(rate.title),
          body: text.escalationBody(position, text.date(rate.dueOn), text.money(open)),
          dedupeKey,
        });
        escalationRows.push({
          subjectType: "installment",
          subjectId: rate.id,
          level: 2,
          escalatedToStaffMemberId: manager.id,
          reason: "critical installment overdue",
          dedupeKey: `${dedupeKey}:${manager.id}`,
        });
      }
    }
  }

  return db.transaction(async (tx) => {
    const created = await insertNotifications(tx, reminders);
    const escalated = await insertNotifications(tx, escalations);
    if (escalationRows.length > 0)
      await tx.insert(escalationLog).values(escalationRows).onConflictDoNothing();
    return { created, escalated };
  });
}
