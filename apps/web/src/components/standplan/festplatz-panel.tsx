"use client";

import { CalendarCog, Pin, Trash2, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateShort, formatLength } from "@/lib/format";
import type { FestplatzState } from "./festplatz";
import type { FixedSpot } from "./store";
import type { PlanEvent } from "./types";

/**
 * Standplan → Festplätze: who holds a stall for the whole year at this market. Opting out of single
 * dates is an edge case, so it sits inside each Festplatz under "Termine verwalten".
 */
export function FestplatzPanel({
  ev,
  spots,
  datesOf,
  stallOf,
  stateOf,
  canWrite,
  onToggleDate,
  onDelete,
}: {
  ev: PlanEvent;
  spots: FixedSpot[];
  datesOf: (spot: FixedSpot) => PlanEvent[];
  stallOf: (spot: FixedSpot) => string;
  stateOf: (spot: FixedSpot, eventId: string) => FestplatzState;
  canWrite: boolean;
  onToggleDate: (spot: FixedSpot, eventId: string) => void;
  onDelete: (spot: FixedSpot) => void;
}) {
  const t = useTranslations("standplan.festplatz");
  const locale = useLocale();
  const [manage, setManage] = useState<string | null>(null);

  return (
    <div className="flex min-h-[420px] flex-col gap-3 rounded-xl border bg-card p-3 text-small">
      <p className="text-muted-foreground">
        {t("intro", { market: ev.name, year: ev.startsOn.slice(0, 4) })}
      </p>
      {spots.length === 0 ? (
        <p className="rounded-lg bg-sunken p-4 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {spots.map((spot) => {
            const dates = datesOf(spot);
            const states = dates.map((d) => [d, stateOf(spot, d.id)] as const);
            const active = states.filter(([, s]) => s === "placed" || s === "source").length;
            const conflicts = states.filter(([, s]) => s === "conflict");
            const open = manage === spot.id;
            return (
              <li key={spot.id} className="rounded-lg border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Pin className="size-4 text-status-waiting" />
                  <span className="w-14 font-semibold tabular-nums">{stallOf(spot)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {spot.companyName ?? spot.vendorName}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatLength(spot.lengthCm, locale)}
                  </span>
                  <span className="text-muted-foreground">
                    {t("dates", { active, total: dates.length })}
                  </span>
                  {conflicts.length > 0 && (
                    <StatusBadge tone="critical" icon={TriangleAlert}>
                      {t("conflicts", { count: conflicts.length })}
                    </StatusBadge>
                  )}
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-expanded={open}
                      onClick={() => setManage(open ? null : spot.id)}
                    >
                      <CalendarCog />
                      {t("manage")}
                    </Button>
                  )}
                </div>
                {open && (
                  <div className="mt-2 flex flex-col gap-2 border-t pt-2">
                    <p className="text-faint-foreground text-tiny">{t("manageHint")}</p>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {states.map(([d, s]) => (
                        <li key={d.id}>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={s !== "optedOut"}
                              disabled={s === "source"}
                              onChange={() => onToggleDate(spot, d.id)}
                            />
                            <span className={d.id === ev.id ? "font-semibold" : undefined}>
                              {formatDateShort(d.startsOn, locale)}
                            </span>
                            <span className="text-muted-foreground text-tiny">
                              {t(`state.${s}`)}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="self-start text-status-critical"
                      onClick={() => onDelete(spot)}
                    >
                      <Trash2 />
                      {t("delete")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-faint-foreground text-tiny">{t("paymentOpen")}</p>
    </div>
  );
}
