"use client";

import { Menu } from "@base-ui/react/menu";
import { MAX_HEADCOUNT, normalizeClockTime } from "@marktwerk/core";
import { Ellipsis, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { applyPresetStaffingAction, updateNeedAction } from "@/app/(app)/team/planung/actions";
import { useShell } from "@/components/shell/shell-context";
import { ShiftDialog } from "@/components/team/shift-dialog";
import type { ShiftEnvironment, ShiftView } from "@/components/team/shift-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { formatDateWithWeekday, formatWeekdayDayMonth } from "@/lib/format";
import type {
  EventPlanningDay,
  EventPlanningShift,
  getEventPlanning,
} from "@/server/queries/planning";
import { CandidatePicker } from "./candidate-picker";
import { hasShiftItems, ShiftStatusItems } from "./cell-menu";
import { GapStatus } from "./day-header";
import { usePlanningActions, usePlanningErrorText } from "./planning-toasts";
import { ShiftChip } from "./shift-chip";

type Plan = Awaited<ReturnType<typeof getEventPlanning>>;
type Need = EventPlanningDay["needs"][number];
type Actions = ReturnType<typeof usePlanningActions>;
/** What "Zeiten ändern" needs: the shift dialog's environment and every shift of the event as it edits them. */
export type ShiftEditing = { env: ShiftEnvironment; shifts: Record<string, ShiftView> };

/**
 * Event › Team: one block per event day with its needs (role · times · headcount and the gap), the people on
 * them with their status, "+ Person" per open slot (ranked picker), "Bedarf ändern" for that day only, and
 * "Weitere Schichten" (shifts without a need). Without team:manage (`editing` null) it is read-only. Every
 * change acts at once with an undo toast. Also the phone view of a market's staffing.
 */
export function DayBlocks({
  eventId,
  plan,
  editing,
}: {
  eventId: string;
  plan: Plan;
  editing: ShiftEditing | null;
}) {
  const t = useTranslations("planning.event");
  const locale = useLocale();
  const actions = usePlanningActions();
  const [dialog, setDialog] = useState<{ shift: ShiftView; n: number } | null>(null);
  const canManage = editing !== null;
  const editTimes = (shiftId: string) => {
    const shift = editing?.shifts[shiftId];
    return shift ? () => setDialog((d) => ({ shift, n: (d?.n ?? 0) + 1 })) : undefined;
  };

  return (
    <>
      {plan.days.length === 0 ? (
        <NoNeeds eventId={eventId} canApply={canManage && plan.canApplyPreset} />
      ) : (
        plan.days.map((day) => {
          const open = day.needs.reduce((sum, n) => sum + n.open, 0);
          const over = day.needs.reduce((sum, n) => sum + n.over, 0);
          return (
            <Panel
              key={day.workDate}
              title={formatDateWithWeekday(day.workDate, locale)}
              meta={<GapStatus open={open} over={over} className="text-small" />}
            >
              <ul className="m-0 list-none divide-y divide-border-subtle p-0">
                {day.needs.map((need) => (
                  <NeedBlock
                    key={need.id}
                    need={need}
                    canManage={canManage}
                    actions={actions}
                    editTimes={editTimes}
                  />
                ))}
              </ul>
            </Panel>
          );
        })
      )}
      {plan.loose.length > 0 && (
        <Panel title={t("loose")} meta={plan.loose.length}>
          <ul className="m-0 flex list-none flex-col gap-1 p-3">
            {plan.loose.map((shift) => (
              <ShiftLine
                key={shift.id}
                shift={shift}
                date={formatWeekdayDayMonth(shift.workDate, locale)}
                canManage={canManage}
                actions={actions}
                onEditTimes={editTimes(shift.id)}
              />
            ))}
          </ul>
        </Panel>
      )}
      {actions.dialog}
      {dialog && editing && (
        <ShiftDialog
          key={dialog.n}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          env={editing.env}
          shift={dialog.shift}
          fixedEventId={eventId}
          defaults={{ workDate: dialog.shift.workDate }}
        />
      )}
    </>
  );
}

/** One need of a day: its line and gap, the people on it, the open slots and the inline need edit. */
function NeedBlock({
  need,
  canManage,
  actions,
  editTimes,
}: {
  need: Need;
  canManage: boolean;
  actions: Actions;
  editTimes: (shiftId: string) => (() => void) | undefined;
}) {
  const t = useTranslations("planning.event");
  const locale = useLocale();
  const [editingNeed, setEditingNeed] = useState(false);
  const role = locale === "en" ? need.roleNameEn : need.roleName;
  const date = formatWeekdayDayMonth(need.workDate, locale);
  const line =
    need.plannedStart && need.plannedEnd
      ? t("need", { role, from: need.plannedStart, to: need.plannedEnd, count: need.headcount })
      : t("needNoTimes", { role, count: need.headcount });

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="tabular font-semibold text-small">{line}</span>
          <GapStatus open={need.open} over={need.over} />
        </div>
        {canManage && !editingNeed && (
          <Button size="sm" variant="ghost" onClick={() => setEditingNeed(true)}>
            <Pencil aria-hidden />
            {t("edit")}
          </Button>
        )}
      </div>
      {editingNeed && <NeedEdit need={need} role={role} onDone={() => setEditingNeed(false)} />}
      {need.shifts.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {need.shifts.map((shift) => (
            <ShiftLine
              key={shift.id}
              shift={shift}
              canManage={canManage}
              actions={actions}
              onEditTimes={editTimes(shift.id)}
            />
          ))}
        </ul>
      )}
      {canManage && need.open > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: need.open }, (_, slot) => (
            <CandidatePicker
              // biome-ignore lint/suspicious/noArrayIndexKey: open slots are interchangeable.
              key={slot}
              needId={need.id}
              label={t("addPersonLabel", { role, date })}
              disabled={actions.pending}
              onPick={(c) =>
                actions.assign(
                  need.id,
                  c.staffMemberId,
                  need.workDate,
                  c.displayName,
                  c.unavailableNote,
                )
              }
            />
          ))}
        </div>
      )}
      {canManage && need.open > 0 && !(need.plannedStart && need.plannedEnd) && (
        <p className="m-0 text-faint-foreground text-tiny">{t("noTimesHint")}</p>
      )}
    </li>
  );
}

/** A person on a need (or a loose shift): name, chip with status, and with team:manage the status menu. */
function ShiftLine({
  shift,
  date,
  canManage,
  actions,
  onEditTimes,
}: {
  shift: EventPlanningShift;
  /** Loose shifts show their day (they are not under a day block). */
  date?: string;
  canManage: boolean;
  actions: Actions;
  onEditTimes?: () => void;
}) {
  const t = useTranslations("planning");
  const tEvent = useTranslations("planning.event");
  return (
    <li className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 font-medium text-small">{shift.displayName}</span>
      {date && <span className="tabular text-muted-foreground text-tiny">{date}</span>}
      <ShiftChip shift={shift} />
      <span className="text-muted-foreground text-tiny" aria-hidden>
        {t(`status.${shift.status}`)}
      </span>
      {canManage && hasShiftItems(shift.status, onEditTimes !== undefined) && (
        <Menu.Root>
          <Menu.Trigger
            aria-label={tEvent("shiftMenu", { name: shift.displayName })}
            disabled={actions.pending}
            className="ml-auto grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed data-[popup-open]:bg-selected tap:size-11"
          >
            <Ellipsis aria-hidden className="size-4" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
              <Menu.Popup className="flex min-w-[220px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
                <ShiftStatusItems
                  shift={shift}
                  name={shift.displayName}
                  actions={actions}
                  onEditTimes={onEditTimes}
                />
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      )}
    </li>
  );
}

/** "Bedarf ändern" for this day only: headcount and times; the toast's undo puts the old values back. */
function NeedEdit({ need, role, onDone }: { need: Need; role: string; onDone: () => void }) {
  const t = useTranslations("planning.event");
  const tPlanning = useTranslations("planning");
  const { showToast, showError } = useShell();
  const [pending, start] = useTransition();
  const id = useId();
  const [headcount, setHeadcount] = useState(String(need.headcount));
  const [from, setFrom] = useState(need.plannedStart ?? "");
  const [to, setTo] = useState(need.plannedEnd ?? "");
  const [invalid, setInvalid] = useState<string | null>(null);
  const errorText = usePlanningErrorText();
  const norm = (value: string) => (value.trim() === "" ? "" : (normalizeClockTime(value) ?? value));

  const save = () => {
    // An empty field is not "0" (that would close the need by accident).
    if (headcount.trim() === "") {
      setInvalid(t("headcountRequired"));
      return;
    }
    const count = Number(headcount);
    const start_ = norm(from);
    const end = norm(to);
    const timesOk =
      (start_ === "" && end === "") ||
      (normalizeClockTime(start_) !== null && normalizeClockTime(end) !== null);
    if (!Number.isInteger(count) || count < 0 || count > MAX_HEADCOUNT || !timesOk) {
      setInvalid(t("invalid", { max: MAX_HEADCOUNT }));
      return;
    }
    const previous = {
      headcount: need.headcount,
      plannedStart: need.plannedStart,
      plannedEnd: need.plannedEnd,
    };
    start(async () => {
      const result = await updateNeedAction(need.id, {
        headcount: count,
        plannedStart: start_ || null,
        plannedEnd: end || null,
      });
      if (!result.ok) {
        if (result.error === "invalid_input") setInvalid(t("invalid", { max: MAX_HEADCOUNT }));
        else showError(errorText(result.error));
        return;
      }
      onDone();
      showToast({
        message: t("saved", { role }),
        actionLabel: tPlanning("toast.undo"),
        onAction: async () => {
          const undone = await updateNeedAction(need.id, previous);
          if (!undone.ok) showError(errorText(undone.error));
        },
      });
    });
  };

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <div className="flex w-20 flex-col gap-1">
        <Label htmlFor={`${id}-count`} className="text-small">
          {t("headcount")}
        </Label>
        <Input
          id={`${id}-count`}
          // biome-ignore lint/a11y/noAutofocus: opened by "Bedarf ändern" to type at once.
          autoFocus
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_HEADCOUNT}
          value={headcount}
          onChange={(e) => setHeadcount(e.target.value)}
          aria-invalid={invalid !== null || undefined}
          className="tabular"
        />
      </div>
      {(
        [
          ["from", from, setFrom],
          ["to", to, setTo],
        ] as const
      ).map(([key, value, set]) => (
        <div key={key} className="flex w-24 flex-col gap-1">
          <Label htmlFor={`${id}-${key}`} className="text-small">
            {t(key)}
          </Label>
          <Input
            id={`${id}-${key}`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="HH:MM"
            maxLength={9}
            value={value}
            onChange={(e) => set(e.target.value)}
            onBlur={(e) => set(norm(e.target.value))}
            aria-invalid={invalid !== null || undefined}
            className="tabular"
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
          {t("save")}
        </Button>
      </div>
      {invalid && (
        <p role="alert" className="m-0 w-full text-small text-status-critical">
          {invalid}
        </p>
      )}
    </form>
  );
}

/** No needs yet: the hint, and for older events "Personalbedarf aus Vorlage übernehmen" (no undo: needs can be set to 0). */
function NoNeeds({ eventId, canApply }: { eventId: string; canApply: boolean }) {
  const t = useTranslations("planning.event");
  const errorText = usePlanningErrorText();
  const { showToast, showError } = useShell();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4">
      <p className="m-0 text-muted-foreground text-small">{t("none")}</p>
      {canApply && (
        <Button
          variant="default"
          aria-busy={pending}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await applyPresetStaffingAction(eventId);
              if (!result.ok) return showError(errorText(result.error));
              showToast({ message: t("applied", { count: result.data.created }) });
            })
          }
        >
          {t("applyPreset")}
        </Button>
      )}
    </div>
  );
}
