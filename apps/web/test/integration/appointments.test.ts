import { appointment, auditLog, contact, venue } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  type AppointmentDraft,
  AppointmentInputError,
  archiveAppointment,
  createAppointment,
  restoreAppointment,
  updateAppointment,
} from "@/server/services/appointments";
import { createActor, resetDatabase } from "../helpers/fixtures";

let owner: Awaited<ReturnType<typeof createActor>>;

beforeEach(async () => {
  await resetDatabase();
  owner = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const draft = (patch: Partial<AppointmentDraft> = {}): AppointmentDraft => ({
  title: "Ortstermin Rheinwiese",
  onDate: "2026-12-01",
  startsAt: "09:00",
  endsAt: "10:30",
  venueId: null,
  locationText: null,
  notes: null,
  contactId: null,
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  saveContact: false,
  ...patch,
});

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppointmentInputError) return error.code;
    throw error;
  }
  return null;
}

async function audits(action: string) {
  return (await db.select().from(auditLog)).filter((r) => r.action === action);
}

describe("createAppointment", () => {
  it("stores the appointment and audits it", async () => {
    const { id, title } = await createAppointment(owner, draft({ notes: "  Schlüssel  " }));
    expect(title).toBe("Ortstermin Rheinwiese");
    const [row] = await db.select().from(appointment).where(eq(appointment.id, id));
    expect(row).toMatchObject({
      onDate: "2026-12-01",
      startsAt: "09:00:00",
      endsAt: "10:30:00",
      notes: "Schlüssel",
    });
    const rows = await audits("appointment.create");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityType: "appointment", entityId: id, actorId: owner.id });
  });

  it("creates a saved contact for a typed one with saveContact", async () => {
    const { id } = await createAppointment(
      owner,
      draft({
        contactName: "Frau Meier",
        contactPhone: "0221 1234567",
        contactEmail: "meier@example.de",
        saveContact: true,
      }),
    );
    const contacts = await db.select().from(contact);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      kind: "other",
      name: "Frau Meier",
      phoneE164: "+492211234567",
      email: "meier@example.de",
    });
    const [row] = await db.select().from(appointment).where(eq(appointment.id, id));
    expect(row?.contactId).toBe(contacts[0]?.id);
    expect(row).toMatchObject({
      contactName: null,
      contactPhoneE164: null,
      contactEmail: null,
    });
    expect(await audits("contact.create")).toHaveLength(1);
  });

  it("keeps a typed contact inline without saveContact", async () => {
    const { id } = await createAppointment(
      owner,
      draft({ contactName: "Herr Kurz", contactPhone: "0221 1234567" }),
    );
    expect(await db.select().from(contact)).toHaveLength(0);
    const [row] = await db.select().from(appointment).where(eq(appointment.id, id));
    expect(row).toMatchObject({
      contactId: null,
      contactName: "Herr Kurz",
      contactPhoneE164: "+492211234567",
    });
  });

  it("links a saved contact and drops the inline fields", async () => {
    const [c] = await db.insert(contact).values({ kind: "other", name: "Amt" }).returning();
    const { id } = await createAppointment(
      owner,
      draft({ contactId: c?.id ?? null, contactName: "ignored", saveContact: true }),
    );
    const [row] = await db.select().from(appointment).where(eq(appointment.id, id));
    expect(row).toMatchObject({ contactId: c?.id, contactName: null });
    expect(await db.select().from(contact)).toHaveLength(1);
  });

  it("rejects bad input with the core problem code", async () => {
    expect(await codeOf(createAppointment(owner, draft({ title: " " })))).toBe("title_required");
    expect(await codeOf(createAppointment(owner, draft({ endsAt: "08:00" })))).toBe(
      "end_before_start",
    );
  });

  it("rejects an unreadable phone number", async () => {
    expect(
      await codeOf(createAppointment(owner, draft({ contactName: "X", contactPhone: "abc" }))),
    ).toBe("phone_invalid");
  });

  it("rejects a missing venue or contact", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await codeOf(createAppointment(owner, draft({ venueId: missing })))).toBe(
      "invalid_venue",
    );
    expect(await codeOf(createAppointment(owner, draft({ contactId: missing })))).toBe(
      "invalid_contact",
    );
  });

  it("rejects an archived venue", async () => {
    const [v] = await db
      .insert(venue)
      .values({
        name: "Alt",
        kind: "outdoor_public",
        city: "Köln",
        bundesland: "NW",
        archivedAt: new Date(),
      })
      .returning();
    expect(await codeOf(createAppointment(owner, draft({ venueId: v?.id ?? null })))).toBe(
      "invalid_venue",
    );
  });

  it("is forbidden without event write", async () => {
    const field = await createActor("field");
    await expect(createAppointment(field, draft())).rejects.toSatisfy(isForbidden);
    const staff = await createActor("staff");
    await expect(createAppointment(staff, draft())).rejects.toSatisfy(isForbidden);
    expect(await db.select().from(appointment)).toHaveLength(0);
  });
});

describe("updateAppointment", () => {
  it("records the changes", async () => {
    const { id } = await createAppointment(owner, draft());
    const result = await updateAppointment(owner, id, draft({ title: "Neu", endsAt: "11:00" }));
    expect(result).toEqual({ changed: true });
    const rows = await audits("appointment.update");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.diff).toEqual({
      changes: {
        title: { from: "Ortstermin Rheinwiese", to: "Neu" },
        endsAt: { from: "10:30", to: "11:00" },
      },
    });
  });

  it("does nothing when nothing changed", async () => {
    const { id } = await createAppointment(owner, draft());
    expect(await updateAppointment(owner, id, draft())).toEqual({ changed: false });
    expect(await audits("appointment.update")).toHaveLength(0);
  });

  it("reports an unknown id", async () => {
    expect(
      await codeOf(updateAppointment(owner, "00000000-0000-4000-8000-000000000000", draft())),
    ).toBe("not_found");
    expect(await codeOf(updateAppointment(owner, "nope", draft()))).toBe("not_found");
  });
});

describe("archive and restore", () => {
  it("archives and restores with audit entries", async () => {
    const { id } = await createAppointment(owner, draft());
    expect(await archiveAppointment(owner, id)).toEqual({ title: "Ortstermin Rheinwiese" });
    const [archived] = await db.select().from(appointment).where(eq(appointment.id, id));
    expect(archived?.archivedAt).not.toBeNull();
    expect(await restoreAppointment(owner, id)).toEqual({ title: "Ortstermin Rheinwiese" });
    const [restored] = await db.select().from(appointment).where(eq(appointment.id, id));
    expect(restored?.archivedAt).toBeNull();
    expect(await audits("appointment.archive")).toHaveLength(1);
    expect(await audits("appointment.restore")).toHaveLength(1);
  });

  it("restoring a live appointment is a conflict", async () => {
    const { id } = await createAppointment(owner, draft());
    expect(await codeOf(restoreAppointment(owner, id))).toBe("conflict");
  });

  it("reports unknown ids", async () => {
    expect(await codeOf(restoreAppointment(owner, "nope"))).toBe("not_found");
    expect(await codeOf(archiveAppointment(owner, "00000000-0000-4000-8000-000000000000"))).toBe(
      "not_found",
    );
  });

  it("archiving an archived appointment is a conflict", async () => {
    const { id } = await createAppointment(owner, draft());
    await archiveAppointment(owner, id);
    expect(await codeOf(archiveAppointment(owner, id))).toBe("conflict");
  });

  it("an archived appointment cannot be edited", async () => {
    const { id } = await createAppointment(owner, draft());
    await archiveAppointment(owner, id);
    expect(await codeOf(updateAppointment(owner, id, draft({ title: "Neu" })))).toBe("conflict");
    const [row] = await db.select().from(appointment).where(eq(appointment.id, id));
    expect(row?.title).toBe("Ortstermin Rheinwiese");
  });

  it("is forbidden without event write", async () => {
    const { id } = await createAppointment(owner, draft());
    const field = await createActor("field");
    await expect(archiveAppointment(field, id)).rejects.toSatisfy(isForbidden);
    await expect(restoreAppointment(field, id)).rejects.toSatisfy(isForbidden);
    await expect(updateAppointment(field, id, draft())).rejects.toSatisfy(isForbidden);
  });
});
