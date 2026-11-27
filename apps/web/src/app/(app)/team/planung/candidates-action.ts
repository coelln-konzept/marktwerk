"use server";

import type { ShiftCandidate } from "@marktwerk/core";
import { listCandidates } from "@/server/queries/planning";
import { requirePermission } from "@/server/session";

/** The ranked people for one need ("+ Person" on the event's Team tab); reading needs team:read. */
export async function listCandidatesAction(needId: string): Promise<ShiftCandidate[]> {
  await requirePermission("team", "read");
  return listCandidates(needId);
}
