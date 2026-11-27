"use client";

import { Menu } from "@base-ui/react/menu";
import { CalendarCheck, CalendarOff, Check, RotateCcw, Trash2, UserPlus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { PlanningNeed, PlanningPerson } from "@/server/queries/planning";
import type { usePlanningActions } from "./planning-toasts";
import { shortSpan } from "./shift-chip";

/** What a cell hands the shared menu when it opens it. */
export type CellPayload = { staffMemberId: string; day: string };

const item =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[highlighted]:bg-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
const ANSWERABLE = new Set(["requested", "confirmed", "declined"]);
const groupLabel =
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
  // Recorded shifts (gearbeitet, nicht erschienen) are shown but not changed here (Stunden does that).
  const answerable = (status: string) => ANSWERABLE.has(status);

  return (
    <>
      {open.length > 0 && (
        <Menu.Group>
          <Menu.GroupLabel className={groupLabel}>{tTeam("planning")}</Menu.GroupLabel>
          {open.map((need) => (
            <Menu.Item
              key={need.id}
              className={item}
              onClick={() => actions.assign(need.id, person.staffMemberId, day, name, note)}
            >
              <UserPlus aria-hidden />
              {open.length === 1
                ? t("menu.assign")
                : t("menu.assignTo", {
                    market: need.marketShortCode ?? need.eventName,
                    role: en ? need.roleNameEn : need.roleName,
                    from: need.plannedStart ?? "",
                    to: need.plannedEnd ?? "",
                  })}
            </Menu.Item>
          ))}
        </Menu.Group>
      )}
      {away ? (
        <Menu.Item
          className={item}
          onClick={() => actions.clearUnavailable(person.staffMemberId, day, note, name)}
        >
          <CalendarCheck aria-hidden />
          {t("menu.clearUnavailable")}
        </Menu.Item>
      ) : (
        <Menu.Item
          className={item}
          onClick={() => actions.markUnavailable(person.staffMemberId, day, name)}
        >
          <CalendarOff aria-hidden />
          {t("menu.markUnavailable")}
        </Menu.Item>
      )}
      {shifts.map((s) => (
        <Menu.Group key={s.id}>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.GroupLabel className={groupLabel}>
            {[
              s.marketShortCode,
              en ? (s.roleNameEn ?? s.roleName) : s.roleName,
              shortSpan(s.plannedStart, s.plannedEnd),
              t(`status.${s.status}`),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Menu.GroupLabel>
          {answerable(s.status) && s.status !== "confirmed" && (
            <Menu.Item className={item} onClick={() => actions.setStatus(s, "confirmed", name)}>
              <Check aria-hidden />
              {t("menu.confirm")}
            </Menu.Item>
          )}
          {answerable(s.status) && s.status !== "declined" && (
            <Menu.Item className={item} onClick={() => actions.setStatus(s, "declined", name)}>
              <X aria-hidden />
              {t("menu.decline")}
            </Menu.Item>
          )}
          {(s.status === "confirmed" || s.status === "declined") && (
            <Menu.Item className={item} onClick={() => actions.setStatus(s, "requested", name)}>
              <RotateCcw aria-hidden />
              {t("menu.request")}
            </Menu.Item>
          )}
          {answerable(s.status) && (
            <Menu.Item className={item} onClick={() => actions.setStatus(s, "cancelled", name)}>
              <Trash2 aria-hidden />
              {t("menu.remove")}
            </Menu.Item>
          )}
        </Menu.Group>
      ))}
    </>
  );
}
