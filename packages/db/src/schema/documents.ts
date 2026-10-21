import { sql } from "drizzle-orm";
import { bigint, check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./_columns";
import { app } from "./_schema";
import { locationAgreement, venue } from "./catalogue";
import { obligationCompletion, vehicle, vehicleIssue } from "./company";
import { event } from "./events";
import { expense, installment, payable } from "./money";
import { staffMember } from "./people";
import { permit } from "./permits";
import { employmentContract, payrollPeriod } from "./staff";
import { task } from "./tasks";

export const documentKind = app.enum("document_kind", [
  "receipt",
  "invoice",
  "e_invoice_xml",
  "contract",
  "permit",
  "photo",
  "export",
  "other",
]);

/**
 * An uploaded file (receipt, invoice, permit PDF, photo, payroll export). Immutable: the bytes never
 * change (`sha256`), e-invoice XML is stored byte-identical, deleting is `archived_at` + audit.
 * The file itself lives in the storage adapter under `storage_key` (S3-compatible bucket in production).
 *
 * A document is attached to at least one record. Foreign keys restrict deletion: evidence must outlive the
 * thing it proves (receipts are kept 8 years, time records 2 years).
 * (implemented 0002: links are direct nullable columns on this table instead of a separate link table.)
 * Nothing references `document`, so this file can import every other schema file without cycles.
 */
export const document = app.table(
  "document",
  {
    id: id(),
    kind: documentKind().notNull().default("other"),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    sha256: text().notNull(),
    storageKey: text().notNull().unique(),
    caption: text(),

    // links
    payableId: uuid().references(() => payable.id, { onDelete: "restrict" }),
    installmentId: uuid().references(() => installment.id, { onDelete: "restrict" }),
    expenseId: uuid().references(() => expense.id, { onDelete: "restrict" }),
    permitId: uuid().references(() => permit.id, { onDelete: "restrict" }),
    eventId: uuid().references(() => event.id, { onDelete: "restrict" }),
    venueId: uuid().references(() => venue.id, { onDelete: "restrict" }),
    locationAgreementId: uuid().references(() => locationAgreement.id, { onDelete: "restrict" }),
    vehicleId: uuid().references(() => vehicle.id, { onDelete: "restrict" }),
    vehicleIssueId: uuid().references(() => vehicleIssue.id, { onDelete: "restrict" }),
    obligationCompletionId: uuid().references(() => obligationCompletion.id, {
      onDelete: "restrict",
    }),
    taskId: uuid().references(() => task.id, { onDelete: "restrict" }),
    employmentContractId: uuid().references(() => employmentContract.id, {
      onDelete: "restrict",
    }),
    payrollPeriodId: uuid().references(() => payrollPeriod.id, { onDelete: "restrict" }),

    uploadedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp({ withTimezone: true }),
    archivedByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    archiveReason: text(),
  },
  (t) => [
    index().on(t.payableId),
    index().on(t.installmentId),
    index().on(t.expenseId),
    index().on(t.permitId),
    index().on(t.eventId),
    index().on(t.venueId),
    index().on(t.locationAgreementId),
    index().on(t.vehicleId),
    index().on(t.vehicleIssueId),
    index().on(t.obligationCompletionId),
    index().on(t.taskId),
    index().on(t.employmentContractId),
    index().on(t.payrollPeriodId),
    index().on(t.sha256),
    check("document_size", sql`${t.sizeBytes} >= 0`),
    check("document_sha256", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "document_has_link",
      sql`num_nonnulls(${t.payableId}, ${t.installmentId}, ${t.expenseId}, ${t.permitId}, ${t.eventId},
        ${t.venueId}, ${t.locationAgreementId}, ${t.vehicleId}, ${t.vehicleIssueId},
        ${t.obligationCompletionId}, ${t.taskId}, ${t.employmentContractId}, ${t.payrollPeriodId}) >= 1`,
    ),
  ],
);
