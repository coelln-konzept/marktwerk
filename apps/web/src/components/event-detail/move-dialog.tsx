"use client";

import { CalendarClock, Flag, Megaphone, TriangleAlert, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { moveToDate, previewMove, undoMove } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatDateShort, formatDateWithWeekday, formatWeek } from "@/lib/format";
import type { EventMovePreview } from "@/server/services/event-details";

/**
 * "Verschieben" (decided 2026-10-21): pick a new first day; the duration stays and the named dates are
 * recomputed. The preview shows old → new and the same hints as the generation (holiday, venue booked,
 * weekend cap) plus a note when the event is already announced. Hints never block; undo via toast.
 */
export function MoveDialog({ eventId, startsOn }: { eventId: string; startsOn: string }) {
  const t = useTranslations("eventDetail.move");
  const tKeys = useTranslations("eventDetail.overview.dates.keys");
  const tWarn = useTranslations("generate.warn");
  const locale = useLocale();
  const { showToast } = useShell();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(startsOn);
  const [preview, setPreview] = useState<EventMovePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function load(next: string) {
    setDate(next);
    setError(null);
    latest.current = next;
    if (!next || next === startsOn) {
      setPreview(null);
      return;
    }
    startLoading(async () => {
      const result = await previewMove(eventId, next);
      if (latest.current !== next) return; // a newer date was picked meanwhile
      if (result.ok) setPreview(result.data);
      else {
        setPreview(null);
        setError(errorText(result.error));
      }
    });
  }

  function submit() {
    if (!preview) return;
    const to = preview.to.startsOn;
    startTransition(async () => {
      const result = await moveToDate(eventId, to, startsOn);
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setOpen(false);
      showToast({
        message: t("moved", { date: formatDateShort(to, locale) }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoMove(eventId, to, startsOn);
          showToast({
            message: undone.ok
              ? t("reverted", { date: formatDateShort(startsOn, locale) })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  const check = preview?.check;
  const range = (r: { startsOn: string; endsOn: string }) =>
    r.startsOn === r.endsOn
      ? formatDateWithWeekday(r.startsOn, locale)
      : `${formatDateWithWeekday(r.startsOn, locale)} – ${formatDateWithWeekday(r.endsOn, locale)}`;
  const hints =
    (preview?.announced ? 1 : 0) +
    (check
      ? check.holidays.length + check.venueConflicts.length + (check.overWeekendCap ? 1 : 0)
      : 0);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setDate(startsOn);
          setPreview(null);
          setError(null);
          latest.current = "";
          setOpen(true);
        }}
      >
        <CalendarClock aria-hidden />
        {t("open")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("title")}
        description={t("description")}
        closeLabel={t("cancel")}
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
              onChange={(e) => load(e.target.value)}
              className="tabular w-auto self-start"
              aria-describedby="move-status"
            />
          </div>

          <div id="move-status" aria-live="polite" className="flex flex-col gap-3">
            {loading && <p className="text-muted-foreground text-small">{t("loading")}</p>}
            {error && (
              <p role="alert" className="text-small text-status-critical">
                {error}
              </p>
            )}
            {preview && !loading && (
              <>
                <p className="text-small">
                  <span className="text-muted-foreground">{range(preview.from)}</span>
                  {" → "}
                  <span className="font-semibold">{range(preview.to)}</span>
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
                          {a.from ? formatDateShort(a.from, locale) : "–"}
                        </td>
                        <td className="tabular py-1.5">{formatDateShort(a.to, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="flex flex-col gap-1 text-small">
                  {preview.announced && (
                    <li className="flex items-start gap-1.5 text-status-warn">
                      <Megaphone aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                      {t("announced")}
                    </li>
                  )}
                  {check?.holidays.map((h) => (
                    <li key={h.key} className="flex items-center gap-1.5 text-status-warn">
                      <TriangleAlert aria-hidden className="size-3.5" />
                      {tWarn("holiday", { name: locale === "en" ? h.nameEn : h.nameDe })}
                    </li>
                  ))}
                  {check?.overWeekendCap && (
                    <li className="flex items-center gap-1.5 text-status-warn">
                      <Flag aria-hidden className="size-3.5" />
                      {tWarn("weekend", { n: Math.max(...check.weekendLoad.map((w) => w.count)) })}
                    </li>
                  )}
                  {check?.venueConflicts.map((v) => (
                    <li key={v.id} className="flex items-center gap-1.5 text-status-critical">
                      <XCircle aria-hidden className="size-3.5" />
                      {tWarn("venue", { name: v.name })}
                    </li>
                  ))}
                  {hints === 0 && <li className="text-status-ok">✓ {tWarn("none")}</li>}
                </ul>
                <p className="text-faint-foreground text-small">{t("note")}</p>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
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
    </>
  );
}
