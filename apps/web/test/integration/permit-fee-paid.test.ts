import { auditLog, permit } from "@marktwerk/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  createPermit,
  PermitInputError,
  restorePermitFeePaid,
  setPermitFeePaid,
} from "@/server/services/permits";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let permitId: string;

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const read = async () => {
  const [row] = await db
    .select({ feePaidOn: permit.feePaidOn, by: permit.feePaidByStaffMemberId })
    .from(permit)
    .where(eq(permit.id, permitId));
  return row;
};

const auditRows = () =>
  db
    .select({ action: auditLog.action, diff: auditLog.diff })
    .from(auditLog)
    .where(and(eq(auditLog.entityId, permitId), eq(auditLog.action, "permit.fee_paid")))
    .orderBy(asc(auditLog.at));

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = { ...(await createActor("owner")), staffMemberId: cat.staff.anna.id };
  const created = await createPermit(owner, {
    venueId: cat.venue.id,
    category: "external",
    permitType: "landowner_ok",
    title: "Nutzungsrecht Parkplatz",
    season: 2027,
    applyBy: "2027-03-01",
  });
  permitId = created.id;
});

afterAll(async () => {
  await db.$client.end();
});

describe("permit fee paid toggle (UT-10)", () => {
  it("marks paid without an amount, stamps day and staff member, and is audited", async () => {
    const result = await setPermitFeePaid(owner, permitId, true, { today: "2026-11-10" });
    expect(result.changed).toBe(true);
    expect(result.previous).toEqual({ feePaidOn: null, feePaidByStaffMemberId: null });
    expect(await read()).toEqual({ feePaidOn: "2026-11-10", by: cat.staff.anna.id });

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.diff).toMatchObject({ paid: true, to: { feePaidOn: "2026-11-10" } });
  });

  it("switching to the state it already has changes nothing", async () => {
    await setPermitFeePaid(owner, permitId, true, { today: "2026-11-10" });
    const again = await setPermitFeePaid(owner, permitId, true, { today: "2026-11-12" });
    expect(again.changed).toBe(false);
    expect((await read())?.feePaidOn).toBe("2026-11-10");
    expect(await auditRows()).toHaveLength(1);
  });

  it("off clears the paid day; undo puts the earlier payment back", async () => {
    await setPermitFeePaid(owner, permitId, true, { today: "2026-11-10" });
    const off = await setPermitFeePaid(owner, permitId, false);
    expect(await read()).toEqual({ feePaidOn: null, by: null });

    await restorePermitFeePaid(owner, permitId, null, off.previous);
    expect(await read()).toEqual({ feePaidOn: "2026-11-10", by: cat.staff.anna.id });
    const rows = await auditRows();
    expect(rows).toHaveLength(3);
    expect(rows[2]?.diff).toMatchObject({ undo: true, paid: true });
  });

  it("undo refuses when the permit changed since the toast was created", async () => {
    const on = await setPermitFeePaid(owner, permitId, true, { today: "2026-11-10" });
    await setPermitFeePaid(owner, permitId, false);
    await expect(
      restorePermitFeePaid(owner, permitId, on.current.feePaidOn, on.previous),
    ).rejects.toSatisfy((e) => e instanceof PermitInputError && e.code === "conflict");
  });

  it("staff (permit:write) may toggle, field users may not", async () => {
    const staff = await createActor("staff");
    const field = await createActor("field");
    const result = await setPermitFeePaid(staff, permitId, true, { today: "2026-11-10" });
    expect(result.changed).toBe(true);
    expect(await read()).toEqual({ feePaidOn: "2026-11-10", by: null });
    await expect(setPermitFeePaid(field, permitId, false)).rejects.toSatisfy(isForbidden);
  });

  it("an unknown permit is not found", async () => {
    await expect(
      setPermitFeePaid(owner, "00000000-0000-4000-8000-000000000000", true),
    ).rejects.toSatisfy((e) => e instanceof PermitInputError && e.code === "not_found");
  });
});
