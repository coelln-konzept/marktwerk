"use client";

import { eventDateRange, isEventDateInRange } from "@marktwerk/core";
import {
  BellRing,
  ChevronRight,
  CircleAlert,
  Megaphone,
  Pin,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { moveToDate, previewMove, undoMove } from "@/app/(app)/veranstaltungen/[id]/actions";
import { HolidayNote } from "@/components/events/candidate-notes";
import { formatPermitTitle } from "@/components/permits/permit-title";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatDateShort,
  formatDateShortYear,
  formatDateWithWeekday,
  formatWeek,
  todayIn,
} from "@/lib/format";
import type { EventSchedulePreview } from "@/server/services/event-details";

type ShiftRow = EventSchedulePreview["shifting"][number];

/**
 * "Verschieben" (decided 2026-10-21): pick a new first day; the duration stays and the named dates are
 * recomputed. The preview shows old → new, the event's and the season's tasks that move, the tasks that stay,
 * who is told, the permits whose "Antrag bis" stays (UX-046, UX-D3 open) and the same hints as the generation
 * (holiday, venue booked). Hints never block; undo via toast. A preview taken before someone else moved the
 * event is dropped (the page refreshes and the preview loads again from the new date).
 */
export function MoveDialog({
  eventId,
  startsOn,
  open,
  onOpenChange,
}: {
  eventId: string;
  startsOn: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("eventDetail.move");
  const tKeys = useTranslations("eventDetail.overview.dates.keys");
  const tWarn = useTranslations("generate.warn");
  const locale = useLocale();
  const { showToast, showError } = useShell();
  const router = useRouter();
  const [date, setDate] = useState(startsOn);
  const [preview, setPreview] = useState<EventSchedulePreview | null>(null);
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  // "Moved meanwhile, page refreshed": a note, not a field error; it stays while the preview loads again.
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [pending, startTransition] = useTransition();
  const latest = useRef("");
  const range = eventDateRange(todayIn());

  const errorText = (code: string) =>
    code === "out_of_range"
      ? t("errors.out_of_range", { from: range.min.slice(0, 4), to: range.max.slice(0, 4) })
      : t.has(`errors.${code}` as never)
        ? t(`errors.${code}` as never)
        : t("errors.generic");
  const fail = (code: string) => setError({ code, text: errorText(code) });
  /** Only a wrong date marks the field invalid; a failed request or a stale preview does not. */
  const dateInvalid = error?.code === "out_of_range" || error?.code === "invalid_date";

  // Every time the dialog opens it starts from the current first day.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when opening
  useEffect(() => {
    if (!open) return;
    setDate(startsOn);
    setPreview(null);
    setError(null);
    setNotice(null);
    latest.current = "";
  }, [open]);

  // Someone else moved the event meanwhile: the refreshed page brings the new first day, so the preview
  // for the picked date is loaded again against it (UX-046).
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to a new first day only
  useEffect(() => {
    if (open && latest.current) load(latest.current, { keepNotice: true });
  }, [startsOn]);

  function load(next: string, options: { keepNotice?: boolean } = {}) {
    setDate(next);
    setError(null);
    if (!options.keepNotice) setNotice(null);
    latest.current = next;
    if (!next || next === startsOn) {
      setPreview(null);
      return;
    }
    // A typo such as 9999 is answered here, without a server round trip (UX-041).
    if (!isEventDateInRange(next, todayIn())) {
      setPreview(null);
      fail("out_of_range");
      return;
    }
    startLoading(async () => {
      const result = await previewMove(eventId, next);
      if (latest.current !== next) return; // a newer date was picked meanwhile
      if (!result.ok) {
        setPreview(null);
        fail(result.error);
      } else if (result.data.from.startsOn !== startsOn) {
        // The preview was computed from another first day than this page shows: someone moved the
        // event. Refresh the page; the effect above loads the preview again from the new first day.
        setPreview(null);
        setNotice(errorText("conflict"));
        router.refresh();
      } else setPreview(result.data);
    });
  }

  function submit() {
    if (!preview) return;
    const to = preview.to.startsOn;
    startTransition(async () => {
      const result = await moveToDate(eventId, to, startsOn);
      if (!result.ok) {
        // A concurrent move: the old preview must not be confirmed again (the page refreshes and the
        // preview loads again from the new first day, with this note kept).
        if (result.error === "conflict") {
          setPreview(null);
          setNotice(errorText("conflict"));
        } else fail(result.error);
        return;
      }
      onOpenChange(false);
      const { tasksShifted, seasonTasksShifted } = result.data;
      showToast({
        message: [
          t("moved", { date: formatDateShort(to, locale) }),
          ...(tasksShifted > 0 ? [t("movedTasks", { count: tasksShifted })] : []),
          ...(seasonTasksShifted > 0 ? [t("movedSeasonTasks", { count: seasonTasksShifted })] : []),
        ].join(" · "),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoMove(eventId, to, startsOn);
          if (undone.ok)
            showToast({ message: t("reverted", { date: formatDateShort(startsOn, locale) }) });
          else showError(errorText(undone.error));
        },
      });
    });
  }

  const check = preview?.check;
  // Years appear as soon as any date shown is not in the current year (a move across New Year, or
  // a season in 2027): "Sa 13.03. → Fr 20.11." would be ambiguous. Passing "" as today makes every date carry its year.
  const thisYear = todayIn().slice(0, 4);
  const showYear =
    !!preview &&
    [
      preview.from.startsOn,
      preview.from.endsOn,
      preview.to.startsOn,
      preview.to.endsOn,
      ...preview.anchors.flatMap((a) => [a.from, a.to]),
      ...preview.shifting.flatMap((s) => [s.from, s.to]),
      ...preview.seasonShifting.flatMap((s) => [s.from, s.to]),
      ...preview.permitsKept.map((p) => p.applyBy),
    ].some((d) => d != null && d.slice(0, 4) !== thisYear);
  const short = (d: string) =>
    showYear ? formatDateShortYear(d, locale, "") : formatDateShort(d, locale);
  const span = (r: { startsOn: string; endsOn: string }) =>
    r.startsOn === r.endsOn
      ? formatDateWithWeekday(r.startsOn, locale)
      : `${formatDateWithWeekday(r.startsOn, locale)} – ${formatDateWithWeekday(r.endsOn, locale)}`;
  const seasonOverdue = preview?.seasonShifting.filter((s) => s.overdue).length ?? 0;
  const overdueAfter = (preview?.tasksOverdueAfter ?? 0) + seasonOverdue;
  const keptTotal = preview ? preview.kept.manual + preview.kept.noRule : 0;
  const hints =
    (overdueAfter > 0 ? 1 : 0) +
    (preview && preview.kept.afterEnd > 0 ? 1 : 0) +
    (preview && preview.permitsKept.length > 0 ? 1 : 0) +
    (check ? check.holidays.length + check.venueConflicts.length : 0);

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={t("title")}
      description={t("description")}
      closeLabel={t("close")}
      className="w-[min(560px,calc(100%-2rem))]"
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="move-date">{t("newDate")}</Label>
          <Input
            id="move-date"
            type="date"
            value={date}
            min={range.min}
            max={range.max}
            onChange={(e) => load(e.target.value)}
            className="tabular w-auto self-start"
            aria-invalid={dateInvalid || undefined}
            aria-describedby="move-status"
          />
        </div>

        <div id="move-status" aria-live="polite" className="flex flex-col gap-3">
          {loading && <p className="text-muted-foreground text-small">{t("loading")}</p>}
          {notice && (
            <p className="flex items-start gap-1.5 text-foreground-2 text-small">
              <RefreshCw aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-small text-status-critical">
              {error.text}
            </p>
          )}
          {preview && !loading && (
            <>
              <p className="text-small">
                <span className="text-muted-foreground">{span(preview.from)}</span>
                {" → "}
                <span className="font-semibold">{span(preview.to)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatWeek(preview.to.startsOn, locale)}
                </span>
              </p>
              <table className="w-full border-collapse text-small">
                <caption className="sr-only">{t("caption")}</caption>
                <thead>
                  <tr className="border-border-subtle border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">{t("what")}</th>
                    <th className="py-1.5 pr-3 font-medium">{t("before")}</th>
                    <th className="py-1.5 font-medium">{t("after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.anchors.map((a) => (
                    <tr key={a.key} className="border-border-subtle border-b last:border-b-0">
                      <td className="py-1.5 pr-3 font-medium">{tKeys(a.key)}</td>
                      <td className="tabular py-1.5 pr-3 text-muted-foreground">
                        {a.from ? short(a.from) : "–"}
                      </td>
                      <td className="tabular py-1.5">{short(a.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex flex-col gap-2">
                <p className="text-small">
                  <span className="font-semibold">
                    {t("tasksShifting", { count: preview.tasksShifting })}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {keptTotal > 0
                      ? t("tasksKept", {
                          count: keptTotal,
                          detail: [
                            ...(preview.kept.manual > 0
                              ? [t("keptManual", { count: preview.kept.manual })]
                              : []),
                            ...(preview.kept.noRule > 0
                              ? [t("keptNoRule", { count: preview.kept.noRule })]
                              : []),
                          ].join(", "),
                        })
                      : t("tasksShiftingNote")}
                  </span>
                </p>
                {preview.shifting.length > 0 && (
                  <ShiftList
                    rows={preview.shifting}
                    summary={t("tasksShow", { count: preview.shifting.length })}
                    caption={t("tasksCaption")}
                    short={short}
                  />
                )}
                {preview.seasonShifting.length > 0 && (
                  <>
                    <p className="text-small">
                      <span className="font-semibold">
                        {t("seasonShifting", { count: preview.seasonShifting.length })}
                      </span>{" "}
                      <span className="text-muted-foreground">{t("seasonShiftingNote")}</span>
                    </p>
                    <ShiftList
                      rows={preview.seasonShifting}
                      summary={t("seasonShow", { count: preview.seasonShifting.length })}
                      caption={t("seasonCaption")}
                      short={short}
                    />
                  </>
                )}
                {preview.tasksShifting > 0 && (
                  <p className="flex items-start gap-1.5 text-foreground-2 text-small">
                    <BellRing aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {preview.notified.length > 0
                      ? t("notified", {
                          count: preview.notified.length,
                          names: preview.notified.join(", "),
                        })
                      : t("notifiedNobody")}
                  </p>
                )}
              </div>

              <ul className="flex flex-col gap-1 text-small">
                {overdueAfter > 0 && (
                  <li className="flex items-start gap-1.5 text-status-critical">
                    <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {t("overdueAfter", { count: overdueAfter })}
                  </li>
                )}
                {preview.kept.afterEnd > 0 && (
                  <li className="flex items-start gap-1.5 text-status-warn">
                    <Pin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {t("keptAfterEnd", { count: preview.kept.afterEnd })}
                  </li>
                )}
                {preview.permitsKept.length > 0 && (
                  <li className="flex items-start gap-1.5 text-status-warn">
                    <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {t("permitsKept", { count: preview.permitsKept.length })}
                      <ul className="list-disc pl-4 text-foreground-2">
                        {preview.permitsKept.map((p) => (
                          <li key={p.id} className="break-words">
                            {t("permitKept", {
                              title: formatPermitTitle(p.title, locale),
                              date: short(p.applyBy),
                            })}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                )}
                {check?.holidays.map((h) => (
                  <HolidayNote key={h.key} holiday={h} className="gap-1.5" />
                ))}
                {check?.venueConflicts.map((v) => (
                  <li key={v.id} className="flex items-center gap-1.5 text-status-critical">
                    <XCircle aria-hidden className="size-3.5" />
                    {tWarn("venue", { name: v.name })}
                  </li>
                ))}
                {hints === 0 && <li className="text-status-ok">✓ {tWarn("none")}</li>}
              </ul>
              {/* Planned and confirmed events are always "announced": a quiet reminder, not a warning. */}
              {preview.announced && (
                <p className="flex items-start gap-1.5 text-muted-foreground text-small">
                  <Megaphone aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {t("announced")}
                </p>
              )}
              <p className="text-faint-foreground text-small">{t("note")}</p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button disabled={pending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="default"
            aria-busy={pending}
            disabled={pending || loading || !preview}
          >
            {t("submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** A folded list of tasks with their due day before and after the move. */
function ShiftList({
  rows,
  summary,
  caption,
  short,
}: {
  rows: ShiftRow[];
  summary: string;
  caption: string;
  short: (date: string) => string;
}) {
  const t = useTranslations("eventDetail.move");
  return (
    <details className="group rounded-lg border border-border-subtle">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-3 text-small hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
        {summary}
      </summary>
      <div className="max-h-56 overflow-y-auto border-border-subtle border-t">
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">{t("task")}</th>
              <th className="px-3 py-1.5 font-medium">{t("before")}</th>
              <th className="px-3 py-1.5 font-medium">{t("after")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-border-subtle border-t">
                <td className="min-w-0 px-3 py-1.5 break-words">{s.title}</td>
                <td className="tabular whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                  {s.from ? short(s.from) : "–"}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-1.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {short(s.to)}
                    {s.overdue && (
                      <StatusBadge tone="critical" icon={CircleAlert}>
                        {t("overdueShort")}
                      </StatusBadge>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
