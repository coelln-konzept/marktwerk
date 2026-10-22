import "server-only";
import { can } from "@marktwerk/core";
import type { Actor } from "@/server/actor";
import {
  listEventOptions,
  listShiftPeople,
  loadShiftList,
  type ShiftFilter,
  type ShiftList,
} from "@/server/queries/hours";
import { listDutyRoles } from "@/server/queries/team";
import type { ShiftEnvironment } from "./shift-types";

/**
 * The shifts of a filter plus everything the forms need: people, roles and events to pick from and
 * the live-warning context (which also covers people without a shift in the list yet).
 */
export async function loadShiftScreen(
  actor: Actor,
  filter: ShiftFilter,
  today: string,
  locale: string,
  opts: { months: string[]; range: { from: string; to: string } },
): Promise<{ list: ShiftList; env: ShiftEnvironment }> {
  const canManage = can(actor.role, "team", "manage");
  const people = canManage ? await listShiftPeople() : [];
  const list = await loadShiftList(actor, filter, today, {
    people: people.map((p) => p.id),
    months: opts.months,
  });
  if (!canManage) {
    return {
      list,
      env: { canManage, today, live: list.live, people: [], roles: [], events: [] },
    };
  }
  const [roles, events] = await Promise.all([
    listDutyRoles(),
    listEventOptions(actor, opts.range.from, opts.range.to),
  ]);
  return {
    list,
    env: {
      canManage,
      today,
      live: list.live,
      people,
      roles: roles.map((r) => ({ id: r.id, name: locale === "en" ? r.nameEn : r.nameDe })),
      events,
    },
  };
}
