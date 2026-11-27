"use client";

import { Menu } from "@base-ui/react/menu";
import {
  CalendarCheck,
  CalendarOff,
  Check,
  Clock,
  RotateCcw,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { PlanningNeed, PlanningPerson, PlanningShift } from "@/server/queries/planning";
import type { usePlanningActions } from "./planning-toasts";
import { shortSpan } from "./shift-chip";

/** What a cell hands the shared menu when it opens it. */
export type CellPayload = { staffMemberId: string; day: string };

export const menuItemClass =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[highlighted]:bg-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
const ANSWERABLE = new Set(["requested", "confirmed", "declined"]);
/** Whether {@link ShiftStatusItems} has anything to offer (else the menu trigger is hidden). */
export const hasShiftItems = (status: string, canEditTimes: boolean) =>
  ANSWERABLE.has(status) || canEditTimes;
export const menuGroupLabelClass =
  "px-2 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider";

/**
 * The menu of one planning cell (same base-ui Menu as the event's duty menu): Einplanen for each open need
 * of the day, nicht verfügbar / wieder verfügbar, and per shift bestätigt / abgesagt / wieder angefragt /
 * Entfernen. Every item acts at once with an undo toast. Esc closes it and focus goes back to the cell.
 * "Zeiten ändern" lives in the event's day list (Task 9), not here.
 */
export function CellMenuItems({
  person,
  day,
  needs,
  actions,
}: {
  person: PlanningPerson;
  day: string;
  needs: readonly PlanningNeed[];
  actions: ReturnType<typeof usePlanningActions>;
}) {
  const t = useTranslations("planning");
  const tTeam = useTranslations("team.tabs");
  const locale = useLocale();
  const en = locale === "en";
  const name = person.displayName;
  const open = needs.filter((n) => n.open > 0);
  const away = day in person.unavailable;
  const note = person.unavailable[day] ?? null;
  const shifts = (person.shiftsByDay[day] ?? []).filter((s) => s.status !== "cancelled");

  return (
    <>
      {open.length > 0 && (
        <Menu.Group>
          <Menu.GroupLabel className={menuGroupLabelClass}>{tTeam("planning")}</Menu.GroupLabel>
          {open.map((need) => {
            const market = need.marketShortCode ?? need.eventName;
            const role = en ? need.roleNameEn : need.roleName;
            // A need without times can't be planned (no shift times, no suggestions): shown, not offered.
            if (!need.plannedStart || !need.plannedEnd)
              return (
                <Menu.Item key={need.id} className={menuItemClass} disabled>
                  <UserPlus aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span>{open.length === 1 ? t("menu.assign") : `${market} · ${role}`}</span>
                    <span className="text-faint-foreground text-tiny">
                      {t("event.noTimesHint")}
                    </span>
                  </span>
                </Menu.Item>
              );
            return (
              <Menu.Item
                key={need.id}
                className={menuItemClass}
                onClick={() => actions.assign(need.id, person.staffMemberId, day, name, note)}
              >
                <UserPlus aria-hidden />
                {open.length === 1
                  ? t("menu.assign")
                  : t("menu.assignTo", {
                      market,
                      role,
                      from: need.plannedStart,
                      to: need.plannedEnd,
                    })}
              </Menu.Item>
            );
          })}
        </Menu.Group>
      )}
      {away ? (
        <Menu.Item
          className={menuItemClass}
          onClick={() => actions.clearUnavailable(person.staffMemberId, day, note, name)}
        >
          <CalendarCheck aria-hidden />
          {t("menu.clearUnavailable")}
        </Menu.Item>
      ) : (
        <Menu.Item
          className={menuItemClass}
          onClick={() => actions.markUnavailable(person.staffMemberId, day, name)}
        >
          <CalendarOff aria-hidden />
          {t("menu.markUnavailable")}
        </Menu.Item>
      )}
      {shifts.map((s) => (
        <Menu.Group key={s.id}>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.GroupLabel className={menuGroupLabelClass}>
            {[
              s.marketShortCode,
              en ? (s.roleNameEn ?? s.roleName) : s.roleName,
              shortSpan(s.plannedStart, s.plannedEnd),
              t(`status.${s.status}`),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Menu.GroupLabel>
          <ShiftStatusItems shift={s} name={name} actions={actions} />
        </Menu.Group>
      ))}
    </>
  );
}

/**
 * The answers for one shift: bestätigt / abgesagt / wieder angefragt / Entfernen (each with an undo toast),
 * plus "Zeiten ändern" where the caller can open the shift dialog. Recorded shifts (gearbeitet, nicht
 * erschienen) are shown but not changed here (Stunden does that). Shared by the planning cell menu and the
 * event's day blocks.
 */
export function ShiftStatusItems({
  shift,
  name,
  actions,
  onEditTimes,
}: {
  shift: Pick<PlanningShift, "id" | "version" | "status">;
  name: string;
  actions: ReturnType<typeof usePlanningActions>;
  onEditTimes?: () => void;
}) {
  const t = useTranslations("planning");
  const answerable = ANSWERABLE.has(shift.status);
  return (
    <>
      {answerable && shift.status !== "confirmed" && (
        <Menu.Item
          className={menuItemClass}
          onClick={() => actions.setStatus(shift, "confirmed", name)}
        >
          <Check aria-hidden />
          {t("menu.confirm")}
        </Menu.Item>
      )}
      {answerable && shift.status !== "declined" && (
        <Menu.Item
          className={menuItemClass}
          onClick={() => actions.setStatus(shift, "declined", name)}
        >
          <X aria-hidden />
          {t("menu.decline")}
        </Menu.Item>
      )}
      {(shift.status === "confirmed" || shift.status === "declined") && (
        <Menu.Item
          className={menuItemClass}
          onClick={() => actions.setStatus(shift, "requested", name)}
        >
          <RotateCcw aria-hidden />
          {t("menu.request")}
        </Menu.Item>
      )}
      {answerable && (
        <Menu.Item
          className={menuItemClass}
          onClick={() => actions.setStatus(shift, "cancelled", name)}
        >
          <Trash2 aria-hidden />
          {t("menu.remove")}
        </Menu.Item>
      )}
      {onEditTimes && (
        <Menu.Item className={menuItemClass} onClick={onEditTimes}>
          <Clock aria-hidden />
          {t("menu.editTimes")}
        </Menu.Item>
      )}
    </>
  );
}
