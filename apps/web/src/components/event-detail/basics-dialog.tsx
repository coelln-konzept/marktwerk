"use client";

import { Flag, Pencil, TriangleAlert, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { previewBasics, saveBasics, undoBasics } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { formatDateWithWeekday } from "@/lib/format";
import type { VenueOption } from "@/server/queries/venues";
import type { EventBasics, EventSchedulePreview } from "@/server/services/event-details";

const SELECT_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1";

/**
 * "Bearbeiten" in the event header: name, length (days) and venue of this event only. Always confirmed
 * before saving (decided 2026-10-21), with the same hints as the generation for a new venue or length.
 */
export function BasicsDialog({
  eventId,
  startsOn,
  basics,
  venues,
}: {
  eventId: string;
  startsOn: string;
  basics: EventBasics;
  venues: VenueOption[];
}) {
  const t = useTranslations("eventDetail.basics");
  const tWarn = useTranslations("generate.warn");
  const locale = useLocale();
  const { showToast } = useShell();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(basics.name);
  const [days, setDays] = useState(String(basics.durationDays));
  const [venueId, setVenueId] = useState(basics.venueId);
  const [preview, setPreview] = useState<EventSchedulePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const venueName = (id: string) => venues.find((v) => v.id === id)?.name ?? "?";

  async function refreshPreview(nextDays: string, nextVenue: string) {
    const durationDays = Number(nextDays);
    const key = `${nextDays}|${nextVenue}`;
    latest.current = key;
    if (
      !Number.isInteger(durationDays) ||
      (durationDays === basics.durationDays && nextVenue === basics.venueId)
    ) {
      setPreview(null);
      return;
    }
    const result = await previewBasics(eventId, { durationDays, venueId: nextVenue });
    if (latest.current !== key) return;
    setPreview(result.ok ? result.data : null);
  }

  function changes(next: EventBasics) {
    const list: string[] = [];
    if (next.name !== basics.name)
      list.push(t("change.name", { from: basics.name, to: next.name }));
    if (next.durationDays !== basics.durationDays)
      list.push(t("change.days", { from: basics.durationDays, to: next.durationDays }));
    if (next.venueId !== basics.venueId)
      list.push(
        t("change.venue", { from: venueName(basics.venueId), to: venueName(next.venueId) }),
      );
    return list;
  }

  async function submit() {
    const durationDays = Number(days);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 14)
      return setError(errorText("invalid_duration"));
    if (name.trim() === "") return setError(errorText("invalid_name"));
    const next: EventBasics = { name: name.trim().replace(/\s+/g, " "), durationDays, venueId };
    const list = changes(next);
    if (list.length === 0) {
      setOpen(false);
      showToast({ message: t("unchanged") });
      return;
    }
    setError(null);
    const ok = await confirm({
      title: t("confirm.title"),
      description: `${list.join(" · ")}. ${t("confirm.description")}`,
      confirmLabel: t("confirm.ok"),
      cancelLabel: t("cancel"),
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await saveBasics(eventId, next);
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setOpen(false);
      const { previous } = result.data;
      showToast({
        message: t("saved"),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoBasics(eventId, previous, next);
          showToast({ message: undone.ok ? t("reverted") : errorText(undone.error) });
        },
      });
    });
  }

  const check = preview?.check;
  const hints = check
    ? check.holidays.length + check.venueConflicts.length + (check.overWeekendCap ? 1 : 0)
    : 0;

  return (
    <>
      <Button
        aria-label={t("openLabel")}
        onClick={() => {
          setName(basics.name);
          setDays(String(basics.durationDays));
          setVenueId(basics.venueId);
          setPreview(null);
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil aria-hidden />
        {t("open")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("title")}
        description={t("description")}
        closeLabel={t("cancel")}
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
            <Label htmlFor="basics-name">{t("name")}</Label>
            <Input
              id="basics-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="basics-venue">{t("venue")}</Label>
              <select
                id="basics-venue"
                value={venueId}
                className={SELECT_CLASS}
                onChange={(e) => {
                  setVenueId(e.target.value);
                  refreshPreview(days, e.target.value);
                }}
              >
                {!venues.some((v) => v.id === basics.venueId) && (
                  <option value={basics.venueId}>{t("archivedVenue")}</option>
                )}
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.city} · {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="basics-days">{t("days")}</Label>
              <Input
                id="basics-days"
                type="number"
                min={1}
                max={14}
                value={days}
                className="tabular"
                onChange={(e) => {
                  setDays(e.target.value);
                  refreshPreview(e.target.value, venueId);
                }}
              />
            </div>
          </div>
          {preview && (
            <div aria-live="polite" className="flex flex-col gap-1 text-small">
              <p>
                {t("newDays", {
                  from: formatDateWithWeekday(startsOn, locale),
                  to: formatDateWithWeekday(preview.to.endsOn, locale),
                })}
              </p>
              <ul className="flex flex-col gap-1">
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
            </div>
          )}
          {error && (
            <p role="alert" className="text-small text-status-critical">
              {error}
            </p>
          )}
          <p className="text-faint-foreground text-small">{t("presetHint")}</p>
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Modal>
      {dialog}
    </>
  );
}
