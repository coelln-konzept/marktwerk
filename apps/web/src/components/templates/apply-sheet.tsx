"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  Ban,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { applyVersionAction } from "@/app/(app)/vorlagen/ablauf/actions";
import { EventStatusBadge } from "@/components/events/event-status";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateRangeYear, formatDateShortYear, formatWeek } from "@/lib/format";
import type { EventStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ApplyEventPlan, ApplySeasonPlan } from "@/server/services/template-propagation";
import { dateOfInstant } from "./labels";

/** "Anwenden" ignores clicks this long after the step changed (the second click of a double click). */
const STEP_GUARD_MS = 400;

/** One row of the list: an event, or a Saison record ("<Markt> · Saison 2027"). */
type Target = {
  /** `event:<id>` or `season:<id>` */
  key: string;
  plan: ApplyEventPlan | ApplySeasonPlan;
  /** Name as the list and the toast show it. */
  label: string;
  /** Date text next to the name (event dates, or the season start). */
  when: string;
  /** What the search looks at. */
  haystack: string;
};

/**
 * "Auf Veranstaltungen anwenden…" (UX concept §4: side sheet with steps). Deliberate by design: nothing is
 * pre-selected, every chosen event or season shows what would change, and only "Anwenden" writes. Rules (data model):
 * new rows become tasks, open untouched tasks take over the changes, tasks of removed rows stay open and are
 * marked, subtasks of removed child rows are cancelled (ADR 0021); done and edited tasks are never touched. Saison
 * records (research 13 §6.2) stand above the events and take only the rows for the whole season; events take the
 * rows of every date. The list shows only targets with changes by default (a season has 50+ events, most of them
 * unchanged), dates carry the year when it is not the current one.
 *
 * Applying cannot be undone (open questions, UX audit round 1), so step 2 says so, and the step change guards
 * against running through: "Weiter zur Vorschau" and "Auf … anwenden" are different buttons (own keys), focus moves
 * to the new step's heading, and a click on "Anwenden" right after the switch (the second click of a double
 * click) is ignored. A selection that went stale (another tab applied the same target) drops out of the counts;
 * when the server refuses it, the sheet goes back to step 1.
 */
export function ApplySheet({
  templateId,
  templateName,
  version,
  events,
  seasons,
  today,
  closeHref,
}: {
  templateId: string;
  templateName: string;
  version: { version: number; changeNote: string | null };
  events: ApplyEventPlan[];
  seasons: ApplySeasonPlan[];
  /** Business date of today (company time zone). */
  today: string;
  closeHref: string;
}) {
  const t = useTranslations("taskTemplates.apply");
  const tChange = useTranslations("taskTemplates.apply.changes");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stepHeading = useRef<HTMLHeadingElement>(null);
  /** When the step last changed: "Anwenden" ignores clicks for a moment after it. */
  const stepChangedAt = useRef(0);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    stepChangedAt.current = Date.now();
    stepHeading.current?.focus();
  }, [step]);

  const seasonTargets: Target[] = seasons.map((s) => {
    const label = t("seasonLabel", { name: s.name, season: s.season });
    const when = s.seasonStart
      ? t("seasonStart", { date: formatDateShortYear(s.seasonStart, locale, today) })
      : t("noSeasonStart");
    return {
      key: `season:${s.seasonId}`,
      plan: s,
      label,
      when,
      haystack: [label, when, String(s.season), s.seasonStart ?? ""].join(" "),
    };
  });
  const eventTargets: Target[] = events.map((e) => {
    const when = formatDateRangeYear(e.startsOn, e.endsOn, locale, today);
    return {
      key: `event:${e.eventId}`,
      plan: e,
      label: e.name,
      when,
      haystack: [e.name, when, e.startsOn].join(" "),
    };
  });
  const all = [...seasonTargets, ...eventTargets];

  // Only targets that are still in the list count: after a refresh one may be gone (applied in another tab).
  const chosen = all.filter((x) => selected.has(x.key));
  const chosenEvents = chosen.flatMap((x) => ("eventId" in x.plan ? [x.plan.eventId] : []));
  const chosenSeasons = chosen.flatMap((x) => ("seasonId" in x.plan ? [x.plan.seasonId] : []));
  const targets = (eventCount: number, seasonCount: number) =>
    t("targets", {
      events: eventCount,
      seasons: seasonCount,
      both: eventCount > 0 && seasonCount > 0 ? "yes" : "no",
    });
  const totals = chosen.reduce(
    (sum, { plan: e }) => ({
      add: sum.add + e.add.length,
      update: sum.update + e.update.length,
      remove: sum.remove + e.remove.length,
      cancel: sum.cancel + e.cancel.length,
      overdue: sum.overdue + overdueAdds(e),
    }),
    { add: 0, update: 0, remove: 0, cancel: 0, overdue: 0 },
  );
  const close = () => router.replace(closeHref as never, { scroll: false });

  const needle = query.trim().toLocaleLowerCase(locale);
  const visible = (x: Target) =>
    (!onlyChanged || x.plan.size > 0) &&
    (needle === "" || x.haystack.toLocaleLowerCase(locale).includes(needle));
  const shownSeasons = seasonTargets.filter(visible);
  const shownEvents = eventTargets.filter(visible);
  const shown = [...shownSeasons, ...shownEvents];
  const selectable = shown.filter((x) => x.plan.size > 0);
  const hiddenUnchanged = onlyChanged ? all.filter((x) => x.plan.size === 0).length : 0;

  function dueOn(dueAt: number | null) {
    return dueAt === null ? null : dateOfInstant(new Date(dueAt));
  }
  function overdueAdds(e: ApplyEventPlan | ApplySeasonPlan) {
    return e.add.filter((a) => {
      const due = dueOn(a.dueAt);
      return due !== null && due < today;
    }).length;
  }
  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** "2 neue, 1 geändert": only the counts that are not zero. */
  function parts(counts: { add: number; update: number; remove: number; cancel: number }) {
    return [
      counts.add > 0 && t("summary.add", { count: counts.add }),
      counts.update > 0 && t("summary.update", { count: counts.update }),
      counts.remove > 0 && t("summary.remove", { count: counts.remove }),
      counts.cancel > 0 && t("summary.cancel", { count: counts.cancel }),
    ]
      .filter(Boolean)
      .join(", ");
  }

  function apply() {
    if (Date.now() - stepChangedAt.current < STEP_GUARD_MS) {
      // The second click of a double click: ignored, and focus goes back to the heading, so an Enter
      // right after does not apply either.
      stepHeading.current?.focus();
      return;
    }
    if (chosen.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await applyVersionAction(templateId, chosenEvents, chosenSeasons);
      if (!result.ok) {
        // A target stopped qualifying: back to the list (refreshed by the action) to check the selection.
        if (result.error === "not_applicable") setStep(1);
        setError(
          t.has(`errors.${result.error}` as never)
            ? t(`errors.${result.error}` as never)
            : t("errors.generic"),
        );
        return;
      }
      const label = (x: Target) =>
        "eventId" in x.plan
          ? `${x.label} (${formatDateShortYear(x.plan.startsOn, locale, today)})`
          : x.label;
      const names =
        chosen.length <= 2
          ? chosen.map(label).join(", ")
          : t("doneNames", {
              first: chosen.slice(0, 2).map(label).join(", "),
              more: chosen.length - 2,
            });
      const what = parts({
        add: result.data.added,
        update: result.data.updated,
        remove: result.data.removed,
        cancel: result.data.cancelled,
      });
      close();
      showToast({
        message: what ? t("done", { names, what }) : t("doneNothing", { names }),
      });
    });
  }

  /** The non-zero counts of one target, each with its icon; `keep` only where it is not noise. */
  const summary = (
    e: ApplyEventPlan | ApplySeasonPlan,
    opts: { keep?: boolean; overdue?: boolean } = {},
  ) => {
    const overdue = opts.overdue ? overdueAdds(e) : 0;
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
        {e.add.length > 0 && (
          <span className="inline-flex items-center gap-1 text-status-ok">
            <Plus aria-hidden className="size-3.5" />
            {t("summary.add", { count: e.add.length })}
          </span>
        )}
        {e.update.length > 0 && (
          <span className="inline-flex items-center gap-1 text-status-info">
            <RefreshCw aria-hidden className="size-3.5" />
            {t("summary.update", { count: e.update.length })}
          </span>
        )}
        {e.remove.length > 0 && (
          <span className="inline-flex items-center gap-1 text-status-warn">
            <Minus aria-hidden className="size-3.5" />
            {t("summary.remove", { count: e.remove.length })}
          </span>
        )}
        {e.cancel.length > 0 && (
          <span className="inline-flex items-center gap-1 text-status-warn">
            <Ban aria-hidden className="size-3.5" />
            {t("summary.cancel", { count: e.cancel.length })}
          </span>
        )}
        {overdue > 0 && (
          <span className="inline-flex items-center gap-1 text-status-critical">
            <CircleAlert aria-hidden className="size-3.5" />
            {t("summary.overdue", { count: overdue })}
          </span>
        )}
        {opts.keep && e.keep.length > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Lock aria-hidden className="size-3.5" />
            {t("summary.keep", { count: e.keep.length })}
          </span>
        )}
      </span>
    );
  };

  /** Status of the target: the event's, or the season's ("In Planung", "Termine stehen"). */
  const statusBadge = (plan: ApplyEventPlan | ApplySeasonPlan) => {
    if ("eventId" in plan) return <EventStatusBadge status={plan.status as EventStatus} />;
    const status =
      plan.status === "dates_set" || plan.status === "closed" ? plan.status : "planning";
    return (
      <StatusBadge
        tone={status === "dates_set" ? "ok" : status === "closed" ? "neutral" : "info"}
        icon={status === "planning" ? CalendarClock : CalendarCheck}
      >
        {t(`seasonStatus.${status}`)}
      </StatusBadge>
    );
  };

  const row = (x: Target) => (
    <li key={x.key}>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 hover:bg-hover",
          selected.has(x.key) && "border-primary bg-selected",
        )}
      >
        <input
          type="checkbox"
          className="mt-1 size-4 accent-(--primary)"
          checked={selected.has(x.key)}
          onChange={() => toggle(x.key)}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{x.label}</span>
            <span className="tabular text-muted-foreground text-small">
              {x.when}
              {"eventId" in x.plan && <> · {formatWeek(x.plan.startsOn, locale)}</>}
            </span>
            {statusBadge(x.plan)}
          </span>
          <span className="text-muted-foreground text-tiny">
            {x.plan.fromVersion === null
              ? t("noChecklist")
              : t("fromVersion", { version: x.plan.fromVersion })}
          </span>
          {x.plan.size === 0 ? (
            <span className="text-muted-foreground text-small">{t("nothingToChange")}</span>
          ) : (
            summary(x.plan, { overdue: true })
          )}
        </span>
      </label>
    </li>
  );

  /** A group of the list ("Saisons", "Veranstaltungen") with its heading when both kinds are there. */
  const group = (id: string, heading: string, hint: string | null, rows: Target[]): ReactNode =>
    rows.length === 0 ? null : seasonTargets.length === 0 ? (
      <ul className="flex flex-col gap-2">{rows.map(row)}</ul>
    ) : (
      <section aria-labelledby={id} className="flex flex-col gap-2">
        <h3 id={id} className="flex flex-wrap items-baseline gap-x-2 font-semibold text-small">
          {heading}
          <span className="tabular font-normal text-muted-foreground">{rows.length}</span>
          {hint && <span className="font-normal text-muted-foreground text-tiny">{hint}</span>}
        </h3>
        <ul className="flex flex-col gap-2">{rows.map(row)}</ul>
      </section>
    );

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !pending && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-40 flex w-[min(720px,100%)] flex-col border-l bg-card shadow-overlay outline-hidden">
          <header className="flex flex-col gap-3 border-border-subtle border-b px-5 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="font-semibold text-lg">{t("title")}</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-muted-foreground text-small">
                  {t("subtitle", { name: templateName, version: version.version })}
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label={t("close")}
                className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover"
              >
                <X aria-hidden className="size-4" />
              </Dialog.Close>
            </div>
            <ol className="flex flex-wrap items-center gap-2" aria-label={t("steps")}>
              {([1, 2] as const).map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <span
                    aria-current={step === n ? "step" : undefined}
                    className={cn(
                      "grid size-6 place-items-center rounded-full font-semibold text-tiny",
                      n < step
                        ? "bg-status-ok-dot text-on-ok"
                        : n === step
                          ? "bg-primary text-primary-foreground"
                          : "bg-status-neutral-bg text-foreground-2",
                    )}
                  >
                    {n}
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      n === step ? "text-foreground" : "text-foreground-2",
                    )}
                  >
                    {t(`step${n}`)}
                  </span>
                  {n < 2 && <ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />}
                </li>
              ))}
            </ol>
          </header>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            {step === 1 && (
              <>
                <h3 ref={stepHeading} tabIndex={-1} className="sr-only">
                  {t("step1Heading")}
                </h3>
                {error && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-lg bg-status-critical-bg px-3 py-2 text-small text-status-critical"
                  >
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {error}
                  </p>
                )}
                <p className="rounded-lg bg-status-info-bg px-3 py-2 text-small text-status-info">
                  {t("intro")}
                </p>
                {version.changeNote && (
                  <p className="text-small">
                    <span className="font-semibold">{t("changeNote")}</span> {version.changeNote}
                  </p>
                )}
                {all.length === 0 ? (
                  <p className="py-6 text-center text-muted-foreground">{t("empty")}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative min-w-48 flex-1">
                        <Search
                          aria-hidden
                          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
                        />
                        <Input
                          type="search"
                          value={query}
                          aria-label={t("search")}
                          placeholder={t("search")}
                          className="pl-9"
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      <label className="flex min-h-(--control-h) cursor-pointer items-center gap-2 font-medium text-small">
                        <input
                          type="checkbox"
                          className="size-4 accent-(--primary)"
                          checked={onlyChanged}
                          onChange={(e) => setOnlyChanged(e.target.checked)}
                        />
                        {t("onlyChanged")}
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-col">
                        <strong>{t("selected", { count: chosen.length })}</strong>
                        <span className="text-muted-foreground text-tiny">
                          {t("listCount", { shown: shown.length, total: all.length })}
                          {hiddenUnchanged > 0 && (
                            <> · {t("hiddenUnchanged", { count: hiddenUnchanged })}</>
                          )}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={selectable.length === 0}
                          onClick={() =>
                            setSelected(
                              (current) => new Set([...current, ...selectable.map((x) => x.key)]),
                            )
                          }
                        >
                          {t("selectChanged", { count: selectable.length })}
                        </Button>
                        <Button
                          size="sm"
                          disabled={chosen.length === 0}
                          onClick={() => setSelected(new Set())}
                        >
                          {t("clear")}
                        </Button>
                      </span>
                    </div>
                    {shown.length === 0 ? (
                      <p className="py-6 text-center text-muted-foreground">
                        {onlyChanged && needle === "" ? t("nothingChanged") : t("noMatch")}
                      </p>
                    ) : (
                      <>
                        {group("apply-seasons", t("groupSeasons"), t("seasonItems"), shownSeasons)}
                        {group("apply-events", t("groupEvents"), null, shownEvents)}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <h3 ref={stepHeading} tabIndex={-1} className="sr-only">
                  {t("step2Heading")}
                </h3>
                {chosen.length === 0 && (
                  <p
                    role="status"
                    className="flex items-start gap-2 rounded-lg bg-status-warn-bg px-3 py-2 text-small text-status-warn"
                  >
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {t("nothingChosen")}
                  </p>
                )}
                <p className="text-small">
                  {parts(totals)
                    ? t("previewIntro", {
                        targets: targets(chosenEvents.length, chosenSeasons.length),
                        what: parts(totals),
                      })
                    : t("previewIntroNone", {
                        targets: targets(chosenEvents.length, chosenSeasons.length),
                      })}
                </p>
                {totals.overdue > 0 && (
                  <p className="flex items-start gap-2 rounded-lg bg-status-critical-bg px-3 py-2 text-small text-status-critical">
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {t("overdueTotal", { count: totals.overdue })}
                  </p>
                )}
                <ul className="flex flex-col gap-3">
                  {chosen.map(({ key, plan: e, label, when }) => (
                    <li key={key} className="rounded-lg border">
                      <div className="flex flex-col gap-1 border-border-subtle border-b px-3 py-2">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="font-semibold">{label}</span>
                          <span className="tabular text-muted-foreground text-small">{when}</span>
                        </span>
                        {summary(e)}
                      </div>
                      <ul className="flex flex-col gap-1 px-3 py-2 text-small">
                        {e.add.map((a) => {
                          const due = dueOn(a.dueAt);
                          const late = due !== null && due < today;
                          return (
                            <li key={`a-${a.key}`} className="flex items-start gap-2">
                              <Plus
                                aria-hidden
                                className="mt-0.5 size-3.5 shrink-0 text-status-ok"
                              />
                              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span>
                                  <span className="sr-only">{t("summary.addLabel")}: </span>
                                  {a.title}
                                </span>
                                <span className="tabular text-muted-foreground">
                                  {due === null
                                    ? t("noDue")
                                    : t("dueOn", { date: formatDateShortYear(due, locale, today) })}
                                </span>
                                {late && (
                                  <StatusBadge tone="critical" icon={CircleAlert}>
                                    {t("wouldBeOverdue")}
                                  </StatusBadge>
                                )}
                              </span>
                            </li>
                          );
                        })}
                        {e.update.map((u) => (
                          <li key={`u-${u.taskId}`} className="flex items-start gap-2">
                            <RefreshCw
                              aria-hidden
                              className="mt-0.5 size-3.5 shrink-0 text-status-info"
                            />
                            <span>
                              <span className="sr-only">{t("summary.updateLabel")}: </span>
                              {u.title}{" "}
                              <span className="text-muted-foreground">
                                ({u.changes.map((c) => tChange(c)).join(", ")})
                              </span>
                            </span>
                          </li>
                        ))}
                        {e.remove.map((r) => (
                          <li key={`r-${r.taskId}`} className="flex items-start gap-2">
                            <Minus
                              aria-hidden
                              className="mt-0.5 size-3.5 shrink-0 text-status-warn"
                            />
                            <span>
                              <span className="sr-only">{t("summary.removeLabel")}: </span>
                              {r.title}{" "}
                              <span className="text-muted-foreground">({t("markedRemoved")})</span>
                            </span>
                          </li>
                        ))}
                        {e.cancel.map((c) => (
                          <li key={`c-${c.taskId}`} className="flex items-start gap-2">
                            <Ban
                              aria-hidden
                              className="mt-0.5 size-3.5 shrink-0 text-status-warn"
                            />
                            <span>
                              <span className="sr-only">{t("summary.cancelLabel")}: </span>
                              {c.title}{" "}
                              <span className="text-muted-foreground">({t("cancelled")})</span>
                            </span>
                          </li>
                        ))}
                        {e.keep.length > 0 && (
                          <li>
                            <details className="group text-muted-foreground">
                              <summary className="flex cursor-pointer items-center gap-2">
                                <Lock aria-hidden className="size-3.5 shrink-0" />
                                {t("summary.keep", { count: e.keep.length })}
                                <ChevronRight
                                  aria-hidden
                                  className="size-3.5 transition-transform group-open:rotate-90"
                                />
                              </summary>
                              <ul className="mt-1 ml-5 flex flex-col gap-0.5">
                                {e.keep.map((k) => (
                                  <li key={`k-${k.taskId}`}>
                                    {k.title} ({t(`keep.${k.reason}`)})
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </li>
                        )}
                        {e.size === 0 && (
                          <li className="flex items-center gap-2 text-status-ok">
                            <CircleCheck aria-hidden className="size-3.5" />
                            {t("nothingToChange")}
                          </li>
                        )}
                      </ul>
                    </li>
                  ))}
                </ul>
                <p className="flex items-start gap-2 text-muted-foreground text-small">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t("rules")}
                </p>
                <p className="flex items-start gap-2 rounded-lg bg-status-warn-bg px-3 py-2 font-medium text-small text-status-warn">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t("irreversible")}
                </p>
                {error && (
                  <p role="alert" className="text-small text-status-critical">
                    {error}
                  </p>
                )}
              </>
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 border-border-subtle border-t px-5 py-3">
            <Button disabled={pending} onClick={close}>
              {t("cancel")}
            </Button>
            <span className="flex gap-2">
              {step === 2 && (
                <Button disabled={pending} onClick={() => setStep(1)}>
                  {t("back")}
                </Button>
              )}
              {/* Own keys: React must not reuse the "Weiter" button as "Anwenden" (a double click would apply). */}
              {step === 1 ? (
                <Button
                  key="next"
                  variant="default"
                  disabled={chosen.length === 0}
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                >
                  {t("next")}
                </Button>
              ) : (
                <Button
                  key="confirm"
                  variant="default"
                  aria-busy={pending}
                  disabled={pending || chosen.length === 0}
                  onClick={apply}
                >
                  {t("confirm", {
                    targets: targets(chosenEvents.length, chosenSeasons.length),
                  })}
                </Button>
              )}
            </span>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
