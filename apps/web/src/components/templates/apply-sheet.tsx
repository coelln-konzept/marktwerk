"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  ChevronRight,
  CircleCheck,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { applyVersionAction } from "@/app/(app)/vorlagen/ablauf/actions";
import { EventStatusBadge } from "@/components/events/event-status";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { formatDateRange, formatWeek } from "@/lib/format";
import type { EventStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ApplyEventPlan } from "@/server/services/template-propagation";

/**
 * "Auf Veranstaltungen anwenden…" (UX concept §4: side sheet with steps). Deliberate by design: nothing is
 * pre-selected, every chosen event shows what would change, and only "Anwenden" writes. Rules (data model):
 * new rows become tasks, open untouched tasks take over the changes, tasks of removed rows are marked;
 * done and edited tasks are never touched.
 */
export function ApplySheet({
  templateId,
  templateName,
  version,
  events,
  closeHref,
}: {
  templateId: string;
  templateName: string;
  version: { version: number; changeNote: string | null };
  events: ApplyEventPlan[];
  closeHref: string;
}) {
  const t = useTranslations("taskTemplates.apply");
  const tChange = useTranslations("taskTemplates.apply.changes");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = events.filter((e) => selected.has(e.eventId));
  const totals = chosen.reduce(
    (sum, e) => ({
      add: sum.add + e.add.length,
      update: sum.update + e.update.length,
      remove: sum.remove + e.remove.length,
    }),
    { add: 0, update: 0, remove: 0 },
  );
  const close = () => router.replace(closeHref as never, { scroll: false });

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await applyVersionAction(
        templateId,
        chosen.map((e) => e.eventId),
      );
      if (!result.ok) {
        setError(
          t.has(`errors.${result.error}` as never)
            ? t(`errors.${result.error}` as never)
            : t("errors.generic"),
        );
        return;
      }
      close();
      showToast({
        message: t("done", {
          events: result.data.events,
          added: result.data.added,
          updated: result.data.updated,
          removed: result.data.removed,
        }),
      });
    });
  }

  const summary = (e: ApplyEventPlan) => (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
      <span className="inline-flex items-center gap-1 text-status-ok">
        <Plus aria-hidden className="size-3.5" />
        {t("summary.add", { count: e.add.length })}
      </span>
      <span className="inline-flex items-center gap-1 text-status-info">
        <RefreshCw aria-hidden className="size-3.5" />
        {t("summary.update", { count: e.update.length })}
      </span>
      <span className="inline-flex items-center gap-1 text-status-warn">
        <Minus aria-hidden className="size-3.5" />
        {t("summary.remove", { count: e.remove.length })}
      </span>
      {e.keep.length > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Lock aria-hidden className="size-3.5" />
          {t("summary.keep", { count: e.keep.length })}
        </span>
      )}
    </span>
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
                <p className="rounded-lg bg-status-info-bg px-3 py-2 text-small text-status-info">
                  {t("intro")}
                </p>
                {version.changeNote && (
                  <p className="text-small">
                    <span className="font-semibold">{t("changeNote")}</span> {version.changeNote}
                  </p>
                )}
                {events.length === 0 ? (
                  <p className="py-6 text-center text-muted-foreground">{t("empty")}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>
                        {t("selected", { count: selected.size, total: events.length })}
                      </strong>
                      <span className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            setSelected(
                              new Set(events.filter((e) => e.size > 0).map((e) => e.eventId)),
                            )
                          }
                        >
                          {t("selectChanged")}
                        </Button>
                        <Button
                          size="sm"
                          disabled={selected.size === 0}
                          onClick={() => setSelected(new Set())}
                        >
                          {t("clear")}
                        </Button>
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {events.map((e) => (
                        <li key={e.eventId}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 hover:bg-hover",
                              selected.has(e.eventId) && "border-primary bg-selected",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 size-4 accent-(--primary)"
                              checked={selected.has(e.eventId)}
                              onChange={() => toggle(e.eventId)}
                            />
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-semibold">{e.name}</span>
                                <span className="tabular text-muted-foreground text-small">
                                  {formatDateRange(e.startsOn, e.endsOn, locale)} ·{" "}
                                  {formatWeek(e.startsOn, locale)}
                                </span>
                                <EventStatusBadge status={e.status as EventStatus} />
                              </span>
                              <span className="text-muted-foreground text-tiny">
                                {e.fromVersion === null
                                  ? t("noChecklist")
                                  : t("fromVersion", { version: e.fromVersion })}
                              </span>
                              {e.size === 0 ? (
                                <span className="text-muted-foreground text-small">
                                  {t("nothingToChange")}
                                </span>
                              ) : (
                                summary(e)
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-small">
                  {t("previewIntro", {
                    events: chosen.length,
                    added: totals.add,
                    updated: totals.update,
                    removed: totals.remove,
                  })}
                </p>
                <ul className="flex flex-col gap-3">
                  {chosen.map((e) => (
                    <li key={e.eventId} className="rounded-lg border">
                      <div className="flex flex-col gap-1 border-border-subtle border-b px-3 py-2">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="font-semibold">{e.name}</span>
                          <span className="tabular text-muted-foreground text-small">
                            {formatDateRange(e.startsOn, e.endsOn, locale)}
                          </span>
                        </span>
                        {summary(e)}
                      </div>
                      <ul className="flex flex-col gap-0.5 px-3 py-2 text-small">
                        {e.add.map((a) => (
                          <li key={`a-${a.key}`} className="flex items-start gap-2">
                            <Plus aria-hidden className="mt-0.5 size-3.5 shrink-0 text-status-ok" />
                            <span>
                              <span className="sr-only">{t("summary.addLabel")}: </span>
                              {a.title}
                            </span>
                          </li>
                        ))}
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
                        {e.keep.map((k) => (
                          <li
                            key={`k-${k.taskId}`}
                            className="flex items-start gap-2 text-muted-foreground"
                          >
                            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                            <span>
                              {k.title} ({t(`keep.${k.reason}`)})
                            </span>
                          </li>
                        ))}
                        {e.size === 0 && e.keep.length === 0 && (
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
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t("rules")}
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
              {step === 1 ? (
                <Button variant="default" disabled={selected.size === 0} onClick={() => setStep(2)}>
                  {t("next")}
                </Button>
              ) : (
                <Button variant="default" aria-busy={pending} disabled={pending} onClick={apply}>
                  {t("confirm", { count: chosen.length })}
                </Button>
              )}
            </span>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
