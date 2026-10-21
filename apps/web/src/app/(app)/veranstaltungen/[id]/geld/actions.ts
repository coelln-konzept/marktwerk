"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  addEventIncome,
  archiveEventIncome,
  EventBudgetInputError,
  type EventIncomeInput,
  setBudgetLine,
} from "@/server/services/event-budget";
import { requirePermission } from "@/server/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(
  work: (actor: Awaited<ReturnType<typeof getActor>>) => Promise<T>,
): Promise<ActionResult<T>> {
  await requirePermission("finance", "write");
  const actor = await getActor();
  try {
    const data = await work(actor);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof EventBudgetInputError) return { ok: false, error: error.code };
    throw error;
  }
}

/** Plan column: the planned cost of one category (`null` removes the line). */
export async function setBudgetLineAction(
  eventId: string,
  category: string,
  plannedCents: number | null,
) {
  return run((actor) => setBudgetLine(actor, eventId, category, plannedCents));
}

/** "Einnahme erfassen". */
export async function addIncomeAction(eventId: string, input: EventIncomeInput) {
  return run((actor) => addEventIncome(actor, eventId, input));
}

/** Removes an income line, or brings it back (undo toast). */
export async function archiveIncomeAction(incomeId: string, restore = false) {
  return run((actor) => archiveEventIncome(actor, incomeId, restore));
}
