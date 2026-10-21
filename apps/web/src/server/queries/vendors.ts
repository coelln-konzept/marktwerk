import "server-only";
import { vendor } from "@marktwerk/db/schema";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import { db } from "../db";

/** Vendor categories as stored in `vendor.categories`; labels live in the `vendors` namespace. */
export const VENDOR_CATEGORIES = [
  "antik",
  "trödel",
  "kleidung",
  "bücher_medien",
  "haushalt",
  "kinder",
  "design_handmade",
  "food",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export const VENDOR_PAGE_SIZE = 50;

export type VendorFilters = {
  q?: string;
  category?: string;
  regular?: boolean;
  car?: boolean;
};

/** Same folding as the command palette search: "koln" finds "Köln", "muller" finds "Müller". */
function fold(column: unknown) {
  return sql`translate(lower(${column}), 'äöüßéèêáàâóòôíìîúùûç', 'aousseeeaaaoooiiiuuuc')`;
}

function foldQuery(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "s")
    .replace(/[%_\\]/g, (c) => `\\${c}`);
}

function whereFor(f: VendorFilters, withCategory = true) {
  const parts = [];
  const q = f.q?.trim();
  if (q) {
    const like = `%${foldQuery(q)}%`;
    parts.push(
      sql`(${fold(vendor.displayName)} like ${like} or ${fold(sql`coalesce(${vendor.companyName}, '')`)} like ${like} or ${fold(sql`coalesce(${vendor.city}, '')`)} like ${like} or ${fold(sql`coalesce(${vendor.email}, '')`)} like ${like})`,
    );
  }
  if (withCategory && f.category) parts.push(sql`${f.category} = any(${vendor.categories})`);
  if (f.regular) parts.push(eq(vendor.isRegular, true));
  if (f.car) parts.push(eq(vendor.hasCar, true));
  return and(...parts);
}

const listColumns = {
  id: vendor.id,
  displayName: vendor.displayName,
  companyName: vendor.companyName,
  kind: vendor.kind,
  categories: vendor.categories,
  city: vendor.city,
  defaultLengthCm: vendor.defaultLengthCm,
  hasCar: vendor.hasCar,
  carLengthCm: vendor.carLengthCm,
  isRegular: vendor.isRegular,
  regularSpot: vendor.regularSpot,
  newsletterConsent: vendor.newsletterConsent,
  createdOn: vendor.createdOn,
};

export type VendorRow = Awaited<ReturnType<typeof listVendors>>["rows"][number];

/** One page of vendors, name order, plus the total for the current filters. */
export async function listVendors(filters: VendorFilters, page: number) {
  const where = whereFor(filters);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select(listColumns)
      .from(vendor)
      .where(where)
      .orderBy(asc(sql`lower(${vendor.displayName})`), asc(vendor.legacyId))
      .limit(VENDOR_PAGE_SIZE)
      .offset((page - 1) * VENDOR_PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(vendor).where(where),
  ]);
  return { rows, total: totalRow?.n ?? 0 };
}

/** Counts per category for the chips: other filters apply, the category filter itself does not. */
export async function countByCategory(filters: VendorFilters) {
  const perCategory = Object.fromEntries(
    VENDOR_CATEGORIES.map((c) => [
      c,
      sql<number>`(count(*) filter (where ${c} = any(${vendor.categories})))::int`,
    ]),
  ) as Record<VendorCategory, SQL<number>>;
  const [row] = await db
    .select({ total: sql<number>`count(*)::int`, ...perCategory })
    .from(vendor)
    .where(whereFor(filters, false));
  const { total, ...byCategory } = row ?? { total: 0 };
  return {
    total: Number(total),
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, Number(v)]),
    ) as Record<string, number>,
  };
}

/** Number of imported vendors, unfiltered (page header). */
export async function countVendors(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(vendor);
  return row?.n ?? 0;
}

export async function getVendor(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const [row] = await db.select().from(vendor).where(eq(vendor.id, id)).limit(1);
  return row ?? null;
}
