"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import { getAppointment } from "@/server/queries/appointments";
import { listContactOptions } from "@/server/queries/contacts";
import { listVenueOptions } from "@/server/queries/venues";
import {
  type AppointmentDraft,
  AppointmentInputError,
  archiveAppointment,
  createAppointment,
  restoreAppointment,
  updateAppointment,
} from "@/server/services/appointments";
import { requirePermission } from "@/server/session";

export type AppointmentResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

/** Which form field a refused input belongs to. */
const FIELD_OF: Record<string, string> = {
  title_required: "title",
  date_invalid: "date",
  time_invalid: "start",
  end_without_start: "start",
  end_before_start: "end",
  two_locations: "location",
  invalid_venue: "location",
  contact_name_required: "contactName",
  phone_invalid: "contactPhone",
  email_invalid: "contactEmail",
  invalid_contact: "contact",
  title_too_long: "title",
  location_too_long: "location",
  notes_too_long: "notes",
  contact_too_long: "contactName",
};

/** Typed input errors become codes the dialog shows; anything else is a real error. */
async function guarded(id: string | null, run: () => Promise<string>): Promise<AppointmentResult> {
  try {
    const done = await run();
    refresh();
    return { ok: true, id: id ?? done };
  } catch (error) {
    if (error instanceof AppointmentInputError) {
      if (error.code === "conflict" || error.code === "not_found") refresh();
      return { ok: false, error: error.code, field: FIELD_OF[error.code] };
    }
    throw error;
  }
}

/** What the dialog needs when it opens: the pickers, today, and the Besprechung to edit. */
export async function loadAppointmentFormAction(id: string | null) {
  await requirePermission("event", "write");
  const [venues, contacts, existing] = await Promise.all([
    listVenueOptions(),
    listContactOptions(),
    id ? getAppointment(id) : Promise.resolve(null),
  ]);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  return {
    today,
    venues: venues.map((v) => ({ id: v.id, name: v.name, city: v.city })),
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    appointment: existing,
  };
}

export async function createAppointmentAction(draft: AppointmentDraft): Promise<AppointmentResult> {
  await requirePermission("event", "write");
  const actor = await getActor();
  return guarded(null, async () => (await createAppointment(actor, draft)).id);
}

export async function updateAppointmentAction(
  id: string,
  draft: AppointmentDraft,
): Promise<AppointmentResult> {
  await requirePermission("event", "write");
  const actor = await getActor();
  return guarded(id, async () => {
    await updateAppointment(actor, id, draft);
    return id;
  });
}

export async function archiveAppointmentAction(id: string): Promise<AppointmentResult> {
  await requirePermission("event", "write");
  const actor = await getActor();
  return guarded(id, async () => {
    await archiveAppointment(actor, id);
    return id;
  });
}

export async function restoreAppointmentAction(id: string): Promise<AppointmentResult> {
  await requirePermission("event", "write");
  const actor = await getActor();
  return guarded(id, async () => {
    await restoreAppointment(actor, id);
    return id;
  });
}
