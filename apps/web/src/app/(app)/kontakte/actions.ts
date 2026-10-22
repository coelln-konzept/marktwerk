"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  archiveContact,
  type ContactInput,
  ContactInputError,
  createContact,
  unarchiveContact,
  updateContact,
} from "@/server/services/contacts";
import { requirePermission } from "@/server/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** "Kontakt anlegen". */
export async function createContactAction(
  input: ContactInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("contact", "write");
  const actor = await getActor();
  try {
    const data = await createContact(actor, input);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ContactInputError) return { ok: false, error: error.code };
    throw error;
  }
}

/** Edit form: `expectedUpdatedAt` is the version the form was opened with (conflict check). */
export async function updateContactAction(
  id: string,
  input: ContactInput,
  expectedUpdatedAt: string,
): Promise<ActionResult<{ changed: boolean }>> {
  await requirePermission("contact", "write");
  const actor = await getActor();
  try {
    const { changed } = await updateContact(actor, id, input, expectedUpdatedAt);
    refresh();
    return { ok: true, data: { changed } };
  } catch (error) {
    if (error instanceof ContactInputError) {
      // The page may show an outdated version or a deleted contact; make it current again.
      if (error.code === "conflict" || error.code === "not_found") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** Archive with undo toast (references from venues and agreements stay). */
export async function archiveContactAction(id: string): Promise<ActionResult<{ name: string }>> {
  await requirePermission("contact", "delete");
  const actor = await getActor();
  try {
    const { name } = await archiveContact(actor, id);
    refresh();
    return { ok: true, data: { name } };
  } catch (error) {
    if (error instanceof ContactInputError) {
      refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** Undo of the archive toast. */
export async function unarchiveContactAction(id: string): Promise<ActionResult<{ name: string }>> {
  await requirePermission("contact", "delete");
  const actor = await getActor();
  try {
    const data = await unarchiveContact(actor, id);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ContactInputError) return { ok: false, error: error.code };
    throw error;
  }
}
