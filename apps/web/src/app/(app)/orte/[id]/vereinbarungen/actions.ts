"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  type AgreementEventPlan,
  type AgreementInput,
  AgreementInputError,
  archiveAgreement,
  createAgreement,
  createEventsFromAgreement,
  restoreAgreement,
  updateAgreement,
} from "@/server/services/agreements";
import { EventInputError } from "@/server/services/events";
import { requirePermission } from "@/server/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Typed input errors become codes the form shows; anything else is a bug and propagates. */
async function guarded<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await run();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AgreementInputError) return { ok: false, error: error.code };
    if (error instanceof EventInputError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function addAgreement(
  venueId: string,
  input: AgreementInput,
): Promise<Result<{ id: string }>> {
  await requirePermission("venue", "write");
  const actor = await getActor();
  return guarded(() => createAgreement(actor, venueId, input));
}

export async function saveAgreement(
  id: string,
  input: AgreementInput,
  undo = false,
): Promise<Result<{ changed: boolean; previous: AgreementInput }>> {
  await requirePermission("venue", "write");
  const actor = await getActor();
  return guarded(() => updateAgreement(actor, id, input, { undo }));
}

export async function removeAgreement(id: string): Promise<Result<null>> {
  await requirePermission("venue", "write");
  const actor = await getActor();
  return guarded(async () => {
    await archiveAgreement(actor, id);
    return null;
  });
}

export async function undoRemoveAgreement(id: string): Promise<Result<null>> {
  await requirePermission("venue", "write");
  const actor = await getActor();
  return guarded(async () => {
    await restoreAgreement(actor, id);
    return null;
  });
}

/** "Termine erzeugen": events for the agreement's fixed dates that have none yet. */
export async function generateFromAgreement(
  agreementId: string,
  plan: AgreementEventPlan,
  dates: string[],
): Promise<Result<{ ids: string[]; skipped: string[] }>> {
  await requirePermission("event", "write");
  const actor = await getActor();
  return guarded(async () => {
    const { created, skipped } = await createEventsFromAgreement(actor, agreementId, plan, dates);
    return { ids: created.map((c) => c.id), skipped };
  });
}
