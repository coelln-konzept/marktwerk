import "server-only";
import {
  type ContractTerms,
  can,
  checkContractTerms,
  type EmploymentType,
  findOverlappingContract,
  monthStart,
} from "@marktwerk/core";
import { employmentContract, payrollPeriod, shift, staffMember } from "@marktwerk/db/schema";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { loadLegalRows, minimumWageAt } from "../legal-params";
import { audit } from "./audit";

export type ContractError =
  | "not_found"
  | "invalid_person"
  | "invalid_type"
  | "invalid_dates"
  | "invalid_amount"
  | "rate_required"
  | "hours_required"
  | "fixed_pay_required"
  | "below_minimum_wage"
  | "overlap"
  | "period_locked";

export class ContractInputError extends Error {
  constructor(
    readonly code: ContractError,
    /** For `overlap`: start of the contract in the way. */
    readonly detail?: string,
  ) {
    super(code);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;

export type ContractInput = {
  type: EmploymentType;
  hourlyRateCents: number | null;
  contractedHoursPerWeek: number | null;
  fixedMonthlyPayCents: number | null;
  workingTimeAccount: boolean;
  otherMinijobDeclared: boolean;
  validFrom: string;
  validUntil: string | null;
  notes?: string | null;
};

/** Types the statutory minimum wage applies to (not freelancers). */
const MINIMUM_WAGE_TYPES: readonly EmploymentType[] = [
  "minijob",
  "midijob",
  "student",
  "part_time",
  "full_time",
];

const payFields = [
  "type",
  "hourlyRateCents",
  "fixedMonthlyPayCents",
  "workingTimeAccount",
  "validFrom",
  "validUntil",
] as const;

/**
 * Creates (`contractId` undefined) or edits a dated employment contract of one person. Contracts of a
 * person never overlap (open end = unlimited); Minijob and fixed-hours rules come from the pure
 * `checkContractTerms`; hourly rates below the minimum wage valid on the start date are refused.
 * Changing pay-relevant terms of a period that is already locked or approved is refused: unlock the
 * month first. Audited as "contract.create" / "contract.update" with the old and new terms.
 */
export async function saveContract(
  actor: Actor,
  staffMemberId: string,
  input: ContractInput,
  contractId?: string,
): Promise<{ id: string }> {
  if (!can(actor.role, "team", "manage")) forbidden();
  if (!UUID.test(staffMemberId)) throw new ContractInputError("invalid_person");
  if (contractId !== undefined && !UUID.test(contractId)) throw new ContractInputError("not_found");

  const terms: ContractTerms = {
    type: input.type,
    hourlyRateCents: input.hourlyRateCents,
    contractedHoursPerWeek: input.contractedHoursPerWeek,
    fixedMonthlyPayCents: input.fixedMonthlyPayCents,
    workingTimeAccount: input.workingTimeAccount,
    otherMinijobDeclared: input.otherMinijobDeclared,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
  };
  const invalid = checkContractTerms(terms);
  if (invalid) throw new ContractInputError(invalid);
  const notes = input.notes?.trim() ? input.notes.trim() : null;

  return db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: staffMember.id })
      .from(staffMember)
      .where(eq(staffMember.id, staffMemberId))
      .for("update");
    if (!person) throw new ContractInputError("invalid_person");

    const existing = await tx
      .select()
      .from(employmentContract)
      .where(eq(employmentContract.staffMemberId, staffMemberId));
    const previous = contractId ? existing.find((c) => c.id === contractId) : undefined;
    if (contractId && !previous) throw new ContractInputError("not_found");

    const clash = findOverlappingContract({ ...terms, id: contractId }, existing);
    if (clash) throw new ContractInputError("overlap", clash.validFrom);

    if (terms.hourlyRateCents !== null && MINIMUM_WAGE_TYPES.includes(terms.type)) {
      const minimum = minimumWageAt(await loadLegalRows(tx), terms.validFrom);
      if (minimum !== null && terms.hourlyRateCents < minimum)
        throw new ContractInputError("below_minimum_wage", String(minimum));
    }

    // Pay-relevant changes must not reach into a month that is already locked or approved.
    const payChanged = !previous || payFields.some((field) => previous[field] !== terms[field]);
    if (payChanged) {
      const ranges = [{ from: terms.validFrom, to: terms.validUntil }];
      if (previous) ranges.push({ from: previous.validFrom, to: previous.validUntil });
      const fixedPay =
        terms.fixedMonthlyPayCents !== null || previous?.fixedMonthlyPayCents != null;
      for (const range of ranges) {
        const locked = await tx
          .select({ month: payrollPeriod.month })
          .from(payrollPeriod)
          .where(
            and(
              ne(payrollPeriod.status, "open"),
              gte(payrollPeriod.month, monthStart(range.from)),
              range.to ? lte(payrollPeriod.month, range.to) : undefined,
            ),
          );
        for (const { month } of locked) {
          if (fixedPay) throw new ContractInputError("period_locked");
          const [work] = await tx
            .select({ id: shift.id })
            .from(shift)
            .where(
              and(
                eq(shift.staffMemberId, staffMemberId),
                sql`date_trunc('month', ${shift.workDate}) = ${month}::date`,
                range.to ? lte(shift.workDate, range.to) : undefined,
                gte(shift.workDate, range.from),
              ),
            )
            .limit(1);
          if (work) throw new ContractInputError("period_locked");
        }
      }
    }

    const values = {
      type: terms.type,
      hourlyRateCents: terms.hourlyRateCents,
      contractedHoursPerWeek: terms.contractedHoursPerWeek,
      fixedMonthlyPayCents: terms.fixedMonthlyPayCents,
      workingTimeAccount: terms.workingTimeAccount,
      otherMinijobDeclared: terms.otherMinijobDeclared,
      validFrom: terms.validFrom,
      validUntil: terms.validUntil,
      notes,
    };
    let id: string;
    if (previous) {
      await tx.update(employmentContract).set(values).where(eq(employmentContract.id, previous.id));
      id = previous.id;
    } else {
      const [created] = await tx
        .insert(employmentContract)
        .values({ staffMemberId, ...values })
        .returning({ id: employmentContract.id });
      if (!created) throw new Error("contract insert failed");
      id = created.id;
    }

    await audit(tx, actor.id, [
      {
        action: previous ? "contract.update" : "contract.create",
        entityType: "staff_member",
        entityId: staffMemberId,
        diff: {
          contractId: id,
          ...(previous
            ? {
                before: {
                  type: previous.type,
                  hourlyRateCents: previous.hourlyRateCents,
                  contractedHoursPerWeek: previous.contractedHoursPerWeek,
                  fixedMonthlyPayCents: previous.fixedMonthlyPayCents,
                  workingTimeAccount: previous.workingTimeAccount,
                  otherMinijobDeclared: previous.otherMinijobDeclared,
                  validFrom: previous.validFrom,
                  validUntil: previous.validUntil,
                  notes: previous.notes,
                },
              }
            : {}),
          after: values,
        },
      },
    ]);
    return { id };
  });
}
