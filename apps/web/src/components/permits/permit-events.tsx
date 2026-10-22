"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  linkEventsAction,
  setEventRequiredAction,
  unlinkEventAction,
} from "@/app/(app)/genehmigungen/actions";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/format";

type Row = { id: string; name: string; startsOn: string; required: boolean };
type Candidate = { id: string; name: string; startsOn: string };

/**
 * "Gilt für": the events a permit covers. Each can be marked as not needing it ("nicht nötig" for this
 * event only), removed, and more upcoming events of the venue can be added.
 */
export function PermitEvents({
  permitId,
  events,
  candidates,
  canWrite,
  canOpenEvents,
}: {
  permitId: string;
  events: Row[];
  candidates: Candidate[];
  canWrite: boolean;
  canOpenEvents: boolean;
}) {
  const t = useTranslations("permitDrawer");
  const locale = useLocale();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState("");
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function toggle(row: Row) {
    startTransition(async () => {
      const result = await setEventRequiredAction(permitId, row.id, !row.required);
      if (!result.ok) showToast({ message: errorText(result.error) });
    });
  }

  function remove(row: Row) {
    startTransition(async () => {
      const result = await unlinkEventAction(permitId, row.id);
      if (!result.ok) return showToast({ message: errorText(result.error) });
      showToast({
        message: t("eventRemoved"),
        actionLabel: t("undo"),
        onAction: async () => {
          await linkEventsAction(permitId, [row.id]);
        },
      });
    });
  }

  function add() {
    if (!choice) return;
    startTransition(async () => {
      const result = await linkEventsAction(permitId, [choice]);
      if (!result.ok) return showToast({ message: errorText(result.error) });
      setChoice("");
      showToast({ message: t("eventsAdded", { count: result.data.added }) });
    });
  }

  return (
    <section aria-labelledby="events-title" className="flex flex-col gap-2">
      <h3 id="events-title" className="font-semibold text-foreground-2 text-small">
        {t("events")}
      </h3>
      {events.length === 0 ? (
        <p className="text-muted-foreground text-small">{t("eventsEmpty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 border-border-subtle border-b py-1.5 last:border-b-0"
            >
              <div className="min-w-0">
                {canOpenEvents ? (
                  <Link
                    href={`/veranstaltungen/${e.id}` as never}
                    className="font-medium text-accent-soft-foreground hover:underline"
                  >
                    {e.name}
                  </Link>
                ) : (
                  <span className="font-medium">{e.name}</span>
                )}
                <span className="tabular ml-2 text-muted-foreground text-small">
                  {formatDateShort(e.startsOn, locale)}
                </span>
                {!e.required && (
                  <span className="block text-muted-foreground text-tiny">
                    {t("eventNotRequired")}
                  </span>
                )}
              </div>
              {canWrite && (
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex items-center gap-1.5 text-small">
                    <input
                      type="checkbox"
                      checked={e.required}
                      disabled={pending}
                      onChange={() => toggle(e)}
                      aria-label={t("eventRequiredLabel", { name: e.name })}
                    />
                    {t("eventRequired")}
                  </label>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(e)}
                    aria-label={t("eventRemove", { name: e.name })}
                    className="grid size-7 cursor-pointer place-items-center rounded-md hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite &&
        (candidates.length === 0 ? (
          <p className="text-muted-foreground text-tiny">{t("eventNoCandidates")}</p>
        ) : (
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="permit-add-event">
              {t("eventAdd")}
            </label>
            <select
              id="permit-add-event"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">{t("eventChoose")}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDateShort(c.startsOn, locale)} · {c.name}
                </option>
              ))}
            </select>
            <Button disabled={pending || !choice} onClick={add}>
              {t("eventAddButton")}
            </Button>
          </div>
        ))}
    </section>
  );
}
