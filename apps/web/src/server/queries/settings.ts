import "server-only";
import { PERMIT_HORIZON_DEFAULT_DAYS } from "@marktwerk/core";
import { legalParameter, session, settings, staffMember, user } from "@marktwerk/db/schema";
import { asc, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "../db";

export type CompanySettings = {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  taxNumber: string;
  vatId: string;
  iban: string;
  bic: string;
  timeZone: string;
  bundesland: string;
  defaultLocale: string;
  /** "HH:MM" */
  defaultDueTime: string;
  emailEnabled: boolean;
  dailyDigestEnabled: boolean;
  /** Days before the apply-by date that permits appear in the Übersicht. */
  permitHorizonDays: number;
  /** False until the settings row exists (fresh database without a seed). */
  exists: boolean;
};

/** The single company settings row, with empty strings for missing optional values (form-friendly). */
export async function getCompanySettings(): Promise<CompanySettings> {
  const row = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  return {
    companyName: row?.companyName ?? "",
    addressLine1: row?.addressLine1 ?? "",
    addressLine2: row?.addressLine2 ?? "",
    postalCode: row?.postalCode ?? "",
    city: row?.city ?? "",
    country: row?.country ?? "DE",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    taxNumber: row?.taxNumber ?? "",
    vatId: row?.vatId ?? "",
    iban: row?.iban ?? "",
    bic: row?.bic ?? "",
    timeZone: row?.timeZone ?? "Europe/Berlin",
    bundesland: row?.bundesland ?? "NW",
    defaultLocale: row?.defaultLocale ?? "de",
    defaultDueTime: (row?.defaultDueTime ?? "09:00").slice(0, 5),
    emailEnabled: row?.emailEnabled ?? false,
    dailyDigestEnabled: row?.dailyDigestEnabled ?? true,
    permitHorizonDays: row?.permitHorizonDays ?? PERMIT_HORIZON_DEFAULT_DAYS,
    exists: Boolean(row),
  };
}

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: Date;
  /** Most recent session start; sessions of deactivated logins are removed, so this is then null. */
  lastSignIn: Date | null;
  staffMember: { id: string; displayName: string } | null;
};

/** All logins (active first, then by name) with their linked staff member and last sign-in. */
export async function listUsers(): Promise<UserRow[]> {
  const lastSession = db
    .select({ userId: session.userId, lastSignIn: max(session.createdAt).as("last_sign_in") })
    .from(session)
    .groupBy(session.userId)
    .as("last_session");

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      lastSignIn: lastSession.lastSignIn,
      staffId: staffMember.id,
      staffName: staffMember.displayName,
    })
    .from(user)
    .leftJoin(lastSession, eq(lastSession.userId, user.id))
    .leftJoin(staffMember, eq(staffMember.userId, user.id))
    .orderBy(sql`coalesce(${user.banned}, false) asc`, asc(user.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    banned: r.banned === true,
    createdAt: r.createdAt,
    lastSignIn: r.lastSignIn,
    staffMember: r.staffId ? { id: r.staffId, displayName: r.staffName ?? "" } : null,
  }));
}

export type LinkableStaff = { id: string; displayName: string; userId: string | null };

/** Staff members that can be linked to a login (not archived), with who they belong to now. */
export async function listLinkableStaff(): Promise<LinkableStaff[]> {
  return db
    .select({
      id: staffMember.id,
      displayName: staffMember.displayName,
      userId: staffMember.userId,
    })
    .from(staffMember)
    .where(isNull(staffMember.archivedAt))
    .orderBy(asc(staffMember.displayName));
}

export type LegalRow = {
  id: string;
  key: string;
  value: number;
  validFrom: string;
  /** Last day this value applies (day before the next row of the same key); null = open-ended. */
  validUntil: string | null;
  note: string | null;
  state: "current" | "past" | "future";
};

const dayBefore = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Legal parameters grouped by key (A–Z), oldest value first. "Valid until" is derived from the next
 * row's `valid_from` (the table has no end column); the value in force on `today` is "current".
 */
export async function listLegalParameters(today: string): Promise<LegalRow[]> {
  const rows = await db
    .select()
    .from(legalParameter)
    .orderBy(asc(legalParameter.key), asc(legalParameter.validFrom));
  return rows.map((row, i) => {
    const next = rows[i + 1];
    const sameKeyNext = next && next.key === row.key ? next : null;
    const validUntil = sameKeyNext ? dayBefore(sameKeyNext.validFrom) : null;
    const state: LegalRow["state"] =
      row.validFrom > today
        ? "future"
        : validUntil !== null && validUntil < today
          ? "past"
          : "current";
    return {
      id: row.id,
      key: row.key,
      value: row.value,
      validFrom: row.validFrom,
      validUntil,
      note: row.note,
      state,
    };
  });
}
