"use client";

import { Menu } from "@base-ui/react/menu";
import {
  addDays,
  expectedDecisionAfter,
  PERMIT_FLOW_STEPS,
  type PermitDateField,
  type PermitStatus,
  permitDateIssues,
  splitPermitTransitions,
} from "@marktwerk/core";
import { Check, Circle, CircleDot, Ellipsis } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  changePermitStatus,
  reinstatePermitAction,
  savePermitAction,
  undoPermitStatus,
} from "@/app/(app)/genehmigungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { dayMonthInput } from "@/lib/month-day";
import { cn } from "@/lib/utils";

const STEPS = PERMIT_FLOW_STEPS;

const MENU_POPUP =
  "flex min-w-[240px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden";
const MENU_ITEM =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-hover";

/** Days ahead a follow-up ("Nachgefragt") suggests for the new answer. */
const FOLLOW_UP_DAYS = 14;

export type PermitFlowDates = {
  appliedAt: string | null;
  expectedDecisionOn: string | null;
  grantedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  referenceNo: string | null;
};

/** The step a small inline form asks details for before it is saved. */
type StepForm = "applied" | "granted" | "followUp";

/** The field that takes focus when a step form opens. */
const FIRST_FIELD: Record<StepForm, "appliedAt" | "referenceNo" | "expectedDecisionOn"> = {
  applied: "appliedAt",
  granted: "referenceNo",
  followUp: "expectedDecisionOn",
};
type Values = {
  appliedAt: string;
  expectedDecisionOn: string;
  referenceNo: string;
  grantedAt: string;
  validFrom: string;
  validUntil: string;
};
type FieldName = keyof Values;

/** Server error code → the field to mark. */
const ERROR_FIELD: Record<string, FieldName> = {
  applied_in_future: "appliedAt",
  decision_before_applied: "expectedDecisionOn",
  granted_before_applied: "grantedAt",
  granted_in_future: "grantedAt",
  invalid_period: "validUntil",
  invalid_text: "referenceNo",
};

/**
 * The status flow of a permit: where it stands and the allowed next steps. Every change shows an undo
 * toast (UX concept §6) instead of asking for confirmation. Two steps ask for what belongs to them in
 * the same place (UX-017, UX-048): "Als beantragt markieren" opens "Beantragt am" and the optional
 * "Entscheidung erwartet bis" (prefilled from the requirement's usual decision day; left empty, the
 * answer is not watched), "Als genehmigt markieren" opens Aktenzeichen, "Erteilt am" and the validity.
 * A filed permit whose answer is overdue or not watched offers "Nachgefragt – neue Antwort bis …".
 */
export function PermitStatusFlow({
  permitId,
  status,
  canWrite,
  today,
  dates,
  typicalDecisionMd,
  answerOverdue,
}: {
  permitId: string;
  status: PermitStatus;
  canWrite: boolean;
  /** Berlin `YYYY-MM-DD`. */
  today: string;
  dates: PermitFlowDates;
  /** The requirement's usual decision day ("MM-DD"), if any. */
  typicalDecisionMd: string | null;
  /** Filed and the expected decision has passed ("Antwort überfällig"). */
  answerOverdue: boolean;
}) {
  const t = useTranslations("permitDrawer");
  const tState = useTranslations("permitStatus");
  const locale = useLocale();
  const uid = useId();
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<StepForm | null>(null);
  const [values, setValues] = useState<Values>(() => blankValues(dates));
  const [error, setError] = useState<{ field: FieldName | null; code: string } | null>(null);
  // The decision date the requirement suggested when the form opened (null: none was used).
  const [suggested, setSuggested] = useState<string | null>(null);
  // The button that opened the step form: focus goes back there when it closes.
  const opener = useRef<"primary" | "followUp" | null>(null);
  const { primary, secondary, menu } = splitPermitTransitions(status);
  const none = !primary && secondary.length === 0 && menu.length === 0;
  const index = (STEPS as readonly PermitStatus[]).indexOf(status);
  // One word per state (UX-034): the first step is "Fehlt", as in the lists and the matrix.
  const label = (s: PermitStatus) => (s === "not_started" ? tState("missing") : tState(s));
  const isBack = (to: PermitStatus) => {
    const target = (STEPS as readonly PermitStatus[]).indexOf(to);
    return index >= 0 && target >= 0 && target < index;
  };
  // A step back in the flow reads "Zurück auf „Beantragt“", a step forward "Als … markieren".
  const actionLabel = (to: PermitStatus) =>
    isBack(to) ? t("back", { status: label(to) }) : t(`actions.${to}` as never);
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  // A failed request (no connection, server error) must not take the page down (UX-007). Only the step
  // form keeps what was typed; a plain status change has nothing to keep.
  const failedText = (inForm = false) =>
    typeof navigator !== "undefined" && !navigator.onLine
      ? t(inForm ? "errors.offline" : "errors.offlineAction")
      : t("errors.server");
  const watchFollowUp = status === "applied" && (answerOverdue || !dates.expectedDecisionOn);

  function undoToast(message: string, to: PermitStatus, data: StatusResult) {
    showToast({
      message,
      actionLabel: t("undo"),
      onAction: async () => {
        try {
          const undone = await undoPermitStatus(permitId, to, data.previous, data.closedTaskIds);
          if (undone.ok) showToast({ message: t("reverted") });
          else showError(errorText(undone.error));
        } catch {
          showError(failedText());
        }
      },
    });
  }

  function statusMessage(to: PermitStatus, data: StatusResult, unwatched = false) {
    // "Status: Beantragt. 2 Aufgaben abgeschlossen. Antwort wird nicht überwacht."
    const parts = [t("statusSet", { status: label(to) })];
    if (data.closedTaskIds.length > 0)
      parts.push(t("tasksClosed", { count: data.closedTaskIds.length }));
    if (unwatched) parts.push(t("decisionUnwatched"));
    return parts.length > 1 ? `${parts.join(". ")}.` : parts.join("");
  }

  function move(to: PermitStatus) {
    // Forward to "Beantragt" or "Genehmigt": ask for the step's details first.
    if ((to === "applied" || to === "granted") && !isBack(to)) return open(to);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof changePermitStatus>>;
      try {
        result = await changePermitStatus(permitId, to);
      } catch {
        return showError(failedText());
      }
      if (!result.ok) return showError(errorText(result.error));
      if (!result.data.changed)
        return showToast({ message: t("statusUnchanged", { status: label(to) }) });
      undoToast(statusMessage(to, result.data), to, result.data);
    });
  }

  function open(which: StepForm) {
    const next = blankValues(dates);
    let suggestion: string | null = null;
    if (which === "applied") {
      next.appliedAt = dates.appliedAt ?? today;
      const prefill = decisionPrefill(next.appliedAt, dates, typicalDecisionMd);
      next.expectedDecisionOn = prefill.value;
      suggestion = prefill.suggested ? prefill.value : null;
    }
    if (which === "granted") next.grantedAt = dates.grantedAt ?? today;
    if (which === "followUp") next.expectedDecisionOn = addDays(today, FOLLOW_UP_DAYS);
    opener.current = which === "followUp" ? "followUp" : "primary";
    setValues(next);
    setSuggested(suggestion);
    setError(null);
    setForm(which);
  }

  // Focus moves into the form when it opens (its first field), and back to the button that opened it
  // when it closes, so Esc right away closes the form and not the drawer, and keyboard users stay put.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (form) {
      wasOpen.current = true;
      document.getElementById(`${uid}-${FIRST_FIELD[form]}`)?.focus();
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // After a step the opener may be gone (a new status has other buttons): then the first step button.
    const back =
      (opener.current && document.getElementById(`${uid}-open-${opener.current}`)) ||
      document.getElementById(`${uid}-open-primary`) ||
      document.querySelector<HTMLElement>(`[data-flow-actions="${uid}"] button`);
    back?.focus();
    opener.current = null;
  }, [form, uid]);

  /** "Beantragt am" changed: a decision date still holding the untouched suggestion follows it. */
  function changeAppliedAt(appliedAt: string) {
    if (suggested === null || values.expectedDecisionOn !== suggested || appliedAt === "")
      return setValues((prev) => ({ ...prev, appliedAt }));
    const next = expectedDecisionAfter(appliedAt, typicalDecisionMd) ?? "";
    setSuggested(next === "" ? null : next);
    setValues((prev) => ({ ...prev, appliedAt, expectedDecisionOn: next }));
  }

  /** The same checks as the service, at the field, before anything is sent (UX-008). */
  function check(which: StepForm): { field: FieldName; code: string } | null {
    const v = (key: FieldName) => (values[key] === "" ? null : values[key]);
    // "Beantragt am" is the one date this step needs (the field is not marked optional).
    if (which === "applied" && v("appliedAt") === null)
      return { field: "appliedAt", code: "invalid_date" };
    const merged =
      which === "applied"
        ? { ...dates, appliedAt: v("appliedAt"), expectedDecisionOn: v("expectedDecisionOn") }
        : which === "granted"
          ? {
              ...dates,
              grantedAt: v("grantedAt"),
              validFrom: v("validFrom"),
              validUntil: v("validUntil"),
            }
          : { ...dates, expectedDecisionOn: v("expectedDecisionOn") };
    const changed: PermitDateField[] =
      which === "applied"
        ? ["appliedAt", "expectedDecisionOn"]
        : which === "granted"
          ? ["grantedAt", "validFrom", "validUntil"]
          : ["expectedDecisionOn"];
    const issue = permitDateIssues(merged, today, changed)[0];
    return issue ? { field: issue.field as FieldName, code: issue.code } : null;
  }

  function fail(next: { field: FieldName | null; code: string }) {
    setError(next);
    if (next.field) document.getElementById(`${uid}-${next.field}`)?.focus();
  }

  function submit(which: StepForm) {
    const issue = check(which);
    if (issue) return fail(issue);
    setError(null);
    const nullable = (key: FieldName) => (values[key].trim() === "" ? null : values[key]);
    startTransition(async () => {
      try {
        if (which === "followUp") {
          const expectedDecisionOn = nullable("expectedDecisionOn");
          const result = await savePermitAction(permitId, { expectedDecisionOn });
          if (!result.ok)
            return fail({ field: ERROR_FIELD[result.error] ?? null, code: result.error });
          setForm(null);
          if (!result.data.changed) return showToast({ message: t("unchanged") });
          const { previous } = result.data;
          showToast({
            message: expectedDecisionOn
              ? t("followUp.saved", { date: formatDate(expectedDecisionOn, locale) })
              : `${t("saved")} ${t("decisionUnwatched")}.`,
            actionLabel: t("undo"),
            onAction: async () => {
              try {
                const undone = await savePermitAction(permitId, previous, true);
                if (undone.ok) showToast({ message: t("savedUndone") });
                else showError(errorText(undone.error));
              } catch {
                showError(failedText());
              }
            },
          });
          return;
        }
        const details =
          which === "applied"
            ? {
                appliedAt: nullable("appliedAt"),
                expectedDecisionOn: nullable("expectedDecisionOn"),
              }
            : {
                referenceNo: nullable("referenceNo"),
                grantedAt: nullable("grantedAt"),
                validFrom: nullable("validFrom"),
                validUntil: nullable("validUntil"),
              };
        const result = await changePermitStatus(permitId, which, details);
        if (!result.ok)
          return fail({ field: ERROR_FIELD[result.error] ?? null, code: result.error });
        setForm(null);
        if (!result.data.changed)
          return showToast({ message: t("statusUnchanged", { status: label(which) }) });
        const unwatched = which === "applied" && details.expectedDecisionOn === null;
        undoToast(statusMessage(which, result.data, unwatched), which, result.data);
      } catch {
        // No connection or a server error: the form stays open with what was typed.
        setError({ field: null, code: "failed" });
      }
    });
  }

  // "Als ersetzt markieren" clicked again: valid again, with the same undo as every other change.
  function reinstate() {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof reinstatePermitAction>>;
      try {
        result = await reinstatePermitAction(permitId);
      } catch {
        return showError(failedText());
      }
      if (!result.ok) return showError(errorText(result.error));
      const { status: back } = result.data;
      showToast({
        message: t("reinstated", { status: label(back) }),
        actionLabel: t("undo"),
        onAction: async () => {
          try {
            const undone = await changePermitStatus(permitId, "superseded");
            if (undone.ok) showToast({ message: t("reverted") });
            else showError(errorText(undone.error));
          } catch {
            showError(failedText());
          }
        },
      });
    });
  }

  const errorId = `${uid}-error`;
  const field = (
    name: FieldName,
    text: string,
    opts: { type?: string; hint?: React.ReactNode; optional?: boolean } = {},
  ) => {
    const marked = error?.field === name;
    const hintId = `${uid}-${name}-hint`;
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-${name}`} optional={opts.optional ?? true}>
          {text}
        </Label>
        <Input
          id={`${uid}-${name}`}
          type={opts.type ?? "date"}
          value={values[name]}
          onChange={(e) =>
            name === "appliedAt"
              ? changeAppliedAt(e.target.value)
              : setValues((prev) => ({ ...prev, [name]: e.target.value }))
          }
          className={(opts.type ?? "date") === "date" ? "tabular" : undefined}
          aria-invalid={marked || undefined}
          aria-describedby={
            [marked ? errorId : null, opts.hint ? hintId : null].filter(Boolean).join(" ") ||
            undefined
          }
        />
        {marked && (
          <p id={errorId} role="alert" className="text-small text-status-critical">
            {errorText(error.code)}
          </p>
        )}
        {opts.hint && (
          <p id={hintId} className="text-muted-foreground text-tiny">
            {opts.hint}
          </p>
        )}
      </div>
    );
  };

  const stepForm = form && (
    <form
      noValidate
      aria-label={
        form === "followUp"
          ? t("followUp.label")
          : form === "applied"
            ? t("step.appliedTitle")
            : t("step.grantedTitle")
      }
      className="flex flex-col gap-3 rounded-lg border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
      onKeyDown={(e) => {
        // Esc closes the small form, not the drawer.
        if (e.key === "Escape") {
          e.preventDefault();
          setForm(null);
        }
      }}
    >
      {form === "applied" && (
        <div className="flex flex-col gap-3">
          {field("appliedAt", t("step.appliedAt"), { optional: false })}
          {field("expectedDecisionOn", t("step.decision"), {
            hint: (
              <>
                {typicalDecisionMd &&
                  suggested !== null &&
                  values.expectedDecisionOn === suggested &&
                  `${t("step.decisionSuggested", { date: dayMonthInput(typicalDecisionMd) })} `}
                {t("step.decisionEmpty")}
              </>
            ),
          })}
        </div>
      )}
      {form === "granted" && (
        <>
          <p className="text-muted-foreground text-tiny">{t("step.grantedHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("referenceNo", t("step.reference"), { type: "text" })}
            {field("grantedAt", t("step.grantedAt"))}
            {field("validFrom", t("step.validFrom"))}
            {field("validUntil", t("step.validUntil"))}
          </div>
        </>
      )}
      {form === "followUp" &&
        field("expectedDecisionOn", t("followUp.label"), { hint: t("step.decisionEmpty") })}
      {error && error.field === null && (
        <p role="alert" className="text-small text-status-critical">
          {error.code === "failed" ? failedText(true) : errorText(error.code)}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" disabled={pending} onClick={() => setForm(null)}>
          {t("step.cancel")}
        </Button>
        <Button size="sm" type="submit" variant="default" disabled={pending} aria-busy={pending}>
          {form === "followUp" ? t("followUp.save") : t(`actions.${form}` as never)}
        </Button>
      </div>
    </form>
  );

  return (
    <section aria-labelledby="flow-title" className="flex flex-col gap-3">
      <h3 id="flow-title" className="font-semibold text-foreground-2 text-small">
        {t("flow")}
      </h3>
      <ol className="m-0 flex list-none items-start justify-between gap-1 p-0">
        {STEPS.map((step, i) => {
          const passed = index > i || status === "granted";
          const current = index === i;
          // The first step is where every permit starts: passing it is no achievement worth a check mark.
          const Icon = passed && i > 0 ? Check : current ? CircleDot : Circle;
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-tiny",
                current ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-4",
                  passed && i > 0 && "text-status-ok",
                  current && "text-accent-soft-foreground",
                )}
              />
              <span>{label(step)}</span>
            </li>
          );
        })}
      </ol>
      {index === -1 && (
        <p className="text-small">
          <span className="font-semibold">{label(status)}</span>
        </p>
      )}
      {canWrite && status === "superseded" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-pressed
            disabled={pending}
            aria-busy={pending}
            title={t("supersededToggleHint")}
            onClick={reinstate}
            className="border-foreground-2"
          >
            <Check aria-hidden className="size-4" />
            {t("supersededToggle")}
          </Button>
          <span className="text-muted-foreground text-small">{t("supersededToggleHint")}</span>
        </div>
      ) : (
        canWrite &&
        (form ? (
          stepForm
        ) : none ? (
          <p className="text-muted-foreground text-small">{t("noNextStep")}</p>
        ) : (
          <div data-flow-actions={uid} className="flex flex-wrap items-center gap-2">
            {primary && (
              <Button
                id={`${uid}-open-primary`}
                size="sm"
                variant="default"
                disabled={pending}
                aria-busy={pending}
                onClick={() => move(primary)}
              >
                {actionLabel(primary)}
              </Button>
            )}
            {watchFollowUp && (
              <Button
                id={`${uid}-open-followUp`}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => open("followUp")}
              >
                {dates.expectedDecisionOn ? t("followUp.open") : t("followUp.openUnwatched")}
              </Button>
            )}
            {secondary.map((to) => (
              <Button
                key={to}
                size="sm"
                variant="outline"
                disabled={pending}
                aria-busy={pending}
                onClick={() => move(to)}
              >
                {actionLabel(to)}
              </Button>
            ))}
            {menu.length > 0 && (
              <Menu.Root>
                <Menu.Trigger
                  aria-label={t("moreSteps")}
                  disabled={pending}
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-input bg-card text-muted-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 data-[popup-open]:bg-hover"
                >
                  <Ellipsis aria-hidden className="size-4" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
                    <Menu.Popup className={MENU_POPUP}>
                      {menu.map((to) => (
                        <Menu.Item key={to} className={MENU_ITEM} onClick={() => move(to)}>
                          {actionLabel(to)}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            )}
          </div>
        ))
      )}
    </section>
  );
}

type StatusResult = Extract<Awaited<ReturnType<typeof changePermitStatus>>, { ok: true }>["data"];

function blankValues(dates: PermitFlowDates): Values {
  return {
    appliedAt: dates.appliedAt ?? "",
    expectedDecisionOn: dates.expectedDecisionOn ?? "",
    referenceNo: dates.referenceNo ?? "",
    grantedAt: dates.grantedAt ?? "",
    validFrom: dates.validFrom ?? "",
    validUntil: dates.validUntil ?? "",
  };
}

/**
 * "Entscheidung erwartet bis" when marking a permit applied: the date already on the permit if it does
 * not lie before the application, otherwise the requirement's usual decision day after it (`suggested`);
 * else empty.
 */
function decisionPrefill(
  appliedAt: string,
  dates: PermitFlowDates,
  typicalDecisionMd: string | null,
): { value: string; suggested: boolean } {
  if (dates.expectedDecisionOn && dates.expectedDecisionOn >= appliedAt)
    return { value: dates.expectedDecisionOn, suggested: false };
  const value = expectedDecisionAfter(appliedAt, typicalDecisionMd) ?? "";
  return { value, suggested: value !== "" };
}
