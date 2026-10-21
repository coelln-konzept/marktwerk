import "server-only";
import { bundleFileName, can, csvAmount, safeFileName, toCsv } from "@marktwerk/core";
import { contact, document, event, expense, installment, payable } from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { getStorage } from "../storage";
import type { ZipEntry } from "../zip";
import { audit } from "./audit";
import { RECEIPT_KINDS } from "./documents";

/**
 * Monthly bundle for the tax advisor (ADR 0015: marktwerk forwards, the advisor keeps the books).
 * One row per payment of the month (a paid or part-paid rate by its payment date, an expense by its
 * date) with its receipts; receipts are renamed `YYYY-MM-DD_Lieferant_Betrag_Veranstaltung.ext`.
 */

export type BundleReceipt = {
  id: string;
  fileName: string;
  storageKey: string;
  ext: string;
};

export type BundleItem = {
  kind: "installment" | "expense";
  id: string;
  date: string;
  amountCents: number;
  /** Supplier / merchant. */
  counterparty: string | null;
  title: string;
  category: string;
  eventName: string | null;
  method: string | null;
  reference: string | null;
  receipts: BundleReceipt[];
};

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const extOf = (storageKey: string) => storageKey.slice(storageKey.lastIndexOf(".") + 1);

/** All payments of `month` (`YYYY-MM`) with their receipts. Needs `finance:read`. */
export async function collectReceiptMonth(actor: Actor, month: string): Promise<BundleItem[]> {
  if (!can(actor.role, "finance", "read")) forbidden();
  if (!MONTH_PATTERN.test(month)) return [];
  const [rates, expenses] = await Promise.all([
    db
      .select({
        id: installment.id,
        payableId: payable.id,
        date: installment.paidOn,
        amountCents: installment.paidAmountCents,
        counterparty: contact.name,
        title: payable.title,
        category: payable.category,
        eventName: event.name,
        method: installment.method,
        reference: installment.reference,
      })
      .from(installment)
      .innerJoin(payable, eq(payable.id, installment.payableId))
      .leftJoin(contact, eq(contact.id, payable.counterpartyContactId))
      .leftJoin(event, eq(event.id, payable.eventId))
      .where(
        and(
          inArray(installment.status, ["paid", "partially_paid"]),
          sql`to_char(${installment.paidOn}, 'YYYY-MM') = ${month}`,
          isNull(payable.archivedAt),
        ),
      )
      .orderBy(asc(installment.paidOn), asc(payable.title)),
    db
      .select({
        id: expense.id,
        date: expense.spentOn,
        amountCents: expense.amountCents,
        counterparty: expense.merchant,
        title: expense.description,
        category: expense.category,
        eventName: event.name,
        method: expense.method,
      })
      .from(expense)
      .leftJoin(event, eq(event.id, expense.eventId))
      .where(
        and(isNull(expense.archivedAt), sql`to_char(${expense.spentOn}, 'YYYY-MM') = ${month}`),
      )
      .orderBy(asc(expense.spentOn), asc(expense.description)),
  ]);

  const docs = await db
    .select({
      id: document.id,
      fileName: document.fileName,
      storageKey: document.storageKey,
      installmentId: document.installmentId,
      payableId: document.payableId,
      expenseId: document.expenseId,
    })
    .from(document)
    .where(
      and(
        isNull(document.archivedAt),
        inArray(document.kind, [...RECEIPT_KINDS]),
        or(
          rates.length
            ? inArray(
                document.installmentId,
                rates.map((r) => r.id),
              )
            : undefined,
          rates.length
            ? inArray(document.payableId, [...new Set(rates.map((r) => r.payableId))])
            : undefined,
          expenses.length
            ? inArray(
                document.expenseId,
                expenses.map((e) => e.id),
              )
            : undefined,
        ),
      ),
    )
    .orderBy(asc(document.createdAt));
  const receipt = (d: (typeof docs)[number]): BundleReceipt => ({
    id: d.id,
    fileName: d.fileName,
    storageKey: d.storageKey,
    ext: extOf(d.storageKey),
  });

  return [
    ...rates.map(
      (r): BundleItem => ({
        kind: "installment",
        id: r.id,
        date: r.date as string,
        amountCents: r.amountCents ?? 0,
        counterparty: r.counterparty,
        title: r.title,
        category: r.category,
        eventName: r.eventName,
        method: r.method,
        reference: r.reference,
        receipts: docs
          .filter((d) => d.installmentId === r.id || d.payableId === r.payableId)
          .map(receipt),
      }),
    ),
    ...expenses.map(
      (e): BundleItem => ({
        kind: "expense",
        id: e.id,
        date: e.date,
        amountCents: e.amountCents,
        counterparty: e.counterparty,
        title: e.title,
        category: e.category,
        eventName: e.eventName,
        method: e.method,
        reference: null,
        receipts: docs.filter((d) => d.expenseId === e.id).map(receipt),
      }),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Words for the CSV, from the messages (the file is always German for the advisor). */
export type BundleLabels = {
  header: [
    date: string,
    type: string,
    supplier: string,
    description: string,
    category: string,
    event: string,
    amount: string,
    method: string,
    reference: string,
    receipt: string,
    missing: string,
  ];
  type: { installment: string; expense: string };
  yes: string;
  no: string;
  category: (key: string) => string;
  method: (key: string) => string;
  /** Folder for the receipt files inside the zip. */
  folder: string;
  csvName: string;
};

/**
 * File names inside the bundle. The same document used by two rates of the month (an invoice on the
 * payable) appears once; a name that is taken gets `_2`, `_3`.
 */
export function planBundle(items: BundleItem[], labels: BundleLabels) {
  const taken = new Set<string>();
  const fileOf = new Map<string, string>(); // document id -> name in the zip
  const files: { documentId: string; storageKey: string; path: string }[] = [];
  const rows = items.map((item) => {
    const names: string[] = [];
    for (const r of item.receipts) {
      let path = fileOf.get(r.id);
      if (!path) {
        const base = bundleFileName({
          date: item.date,
          counterparty: item.counterparty,
          amountCents: item.amountCents,
          event: item.eventName,
          ext: r.ext,
        });
        let name = base;
        for (let n = 2; taken.has(`${labels.folder}/${name}`); n++)
          name = base.replace(/(\.[a-z0-9]+)$/, `_${n}$1`);
        path = `${labels.folder}/${name}`;
        taken.add(path);
        fileOf.set(r.id, path);
        files.push({ documentId: r.id, storageKey: r.storageKey, path });
      }
      names.push(path);
    }
    return { item, names };
  });
  const csv = toCsv(
    labels.header,
    rows.map(({ item, names }) => [
      item.date,
      labels.type[item.kind],
      item.counterparty,
      item.title,
      labels.category(item.category),
      item.eventName,
      csvAmount(item.amountCents),
      item.method ? labels.method(item.method) : "",
      item.reference,
      names.join(" | "),
      names.length === 0 ? labels.yes : labels.no,
    ]),
  );
  return { csv, files, missing: rows.filter((r) => r.names.length === 0).length };
}

/** The zip entries (CSV first, then the receipt files, read one at a time) and the numbers for the audit entry. */
export async function buildReceiptBundle(
  actor: Actor,
  month: string,
  labels: BundleLabels,
): Promise<{ entries: ZipEntry[]; csv: string; payments: number; files: number; missing: number }> {
  const items = await collectReceiptMonth(actor, month);
  const plan = planBundle(items, labels);
  const storage = getStorage();
  await db.transaction((tx) =>
    audit(tx, actor.id, [
      {
        action: "finance.export_receipts",
        entityType: "finance",
        entityId: null,
        diff: { month, payments: items.length, files: plan.files.length, missing: plan.missing },
      },
    ]),
  );
  const modifiedAt = new Date();
  return {
    csv: plan.csv,
    payments: items.length,
    files: plan.files.length,
    missing: plan.missing,
    entries: [
      {
        name: safeFileName(labels.csvName),
        read: () => new TextEncoder().encode(plan.csv),
        compress: true,
        modifiedAt,
      },
      ...plan.files.map((f) => ({
        name: f.path,
        read: () => storage.get(f.storageKey),
        modifiedAt,
      })),
    ],
  };
}
