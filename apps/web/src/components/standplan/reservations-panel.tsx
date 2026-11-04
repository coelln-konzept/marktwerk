"use client";

import { Banknote, CalendarClock, Check, FastForward, RotateCcw, Unlock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateShort, formatDateWithWeekday, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReleasedRecord, StoredPlacement } from "./store";
import type { BookingItem, PlanEvent } from "./types";

type Filter = "all" | "soon";

/**
 * Standplan → Reservierungen: the screen the team works through while looking at the bank account.
 * Reserved stalls wait for the transfer; ticking them and "Als bezahlt markieren" makes them Fest.
 * Reminder and release run on their own (spec 2026-11-04); the prototype clock tests them.
 */
export function ReservationsPanel({
  ev,
  placements,
  items,
  released,
  today,
  clockOffsetDays,
  canWrite,
  selectedId,
  onSelect,
  onMarkPaid,
  onRelease,
  onClock,
}: {
  ev: PlanEvent;
  placements: StoredPlacement[];
  items: Map<string, BookingItem>;
  released: ReleasedRecord[];
  today: string;
  clockOffsetDays: number;
  canWrite: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMarkPaid: (ids: string[]) => void;
  onRelease: (id: string) => void;
  /** +n days, or 0 = back to today. */
  onClock: (days: number) => void;
}) {
  const t = useTranslations("standplan.reservations");
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const reserved = placements
    .filter((p) => p.status === "reserved" && p.reservation)
    .sort((a, b) => (a.reservation?.dueOn ?? "").localeCompare(b.reservation?.dueOn ?? ""));
  const isSoon = (p: StoredPlacement) =>
    Boolean(p.reservation && (p.reservation.remindedOn || today >= p.reservation.dueOn));
  const shown = filter === "soon" ? reserved.filter(isSoon) : reserved;
  const fixed = placements.filter((p) => p.status === "fixed");
  const fixedFromRequests = fixed.filter((p) => p.reservation);
  const openCents = reserved.reduce((s, p) => s + (p.reservation?.amountCents ?? 0), 0);
  const paidCents = fixedFromRequests.reduce((s, p) => s + (p.reservation?.amountCents ?? 0), 0);
  const selected = [...checked].filter((id) => reserved.some((p) => p.itemId === id));
  const allChecked = shown.length > 0 && shown.every((p) => checked.has(p.itemId));

  const toggle = (id: string) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex min-h-[420px] flex-col gap-3 rounded-xl border bg-card p-3 text-small">
      <div className="flex flex-wrap items-center gap-3">
        <dl className="flex flex-wrap gap-2">
          <Stat
            label={t("stats.reserved")}
            value={String(reserved.length)}
            sub={formatMoney(openCents, locale)}
          />
          <Stat
            label={t("stats.fixed")}
            value={String(fixed.length)}
            sub={t("stats.paidSum", { sum: formatMoney(paidCents, locale) })}
          />
          <Stat label={t("stats.released")} value={String(released.length)} />
        </dl>
        {/* PROTOTYPE only: move "today" to see reminder and release happen. */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-dashed px-2 py-1">
          <CalendarClock className="size-4 text-muted-foreground" />
          <span>
            {t("clock.label")}{" "}
            <strong className={cn(clockOffsetDays !== 0 && "text-status-warn")}>
              {formatDateWithWeekday(today, locale)}
            </strong>
          </span>
          <Button size="sm" variant="ghost" onClick={() => onClock(1)}>
            <FastForward />
            {t("clock.next")}
          </Button>
          {clockOffsetDays !== 0 && (
            <Button size="sm" variant="ghost" onClick={() => onClock(0)}>
              <RotateCcw />
              {t("clock.reset")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "soon"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-tiny",
              filter === key ? "border-primary bg-selected font-semibold" : "hover:bg-hover",
            )}
          >
            {t(`filter.${key}`)}{" "}
            <span className="text-muted-foreground">
              {key === "all" ? reserved.length : reserved.filter(isSoon).length}
            </span>
          </button>
        ))}
        {canWrite && (
          <Button
            className="ml-auto"
            variant="default"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => {
              onMarkPaid(selected);
              setChecked(new Set());
            }}
          >
            <Banknote />
            {t("markPaid", { count: selected.length })}
          </Button>
        )}
      </div>

      {reserved.length === 0 ? (
        <p className="rounded-lg bg-sunken p-4 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left text-muted-foreground text-tiny">
                {canWrite && (
                  <th className="w-8 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={t("selectAll")}
                      checked={allChecked}
                      onChange={() =>
                        setChecked(allChecked ? new Set() : new Set(shown.map((p) => p.itemId)))
                      }
                    />
                  </th>
                )}
                <th className="py-1.5">{t("col.stall")}</th>
                <th>{t("col.vendor")}</th>
                <th className="text-right">{t("col.amount")}</th>
                <th>{t("col.reference")}</th>
                <th>{t("col.due")}</th>
                <th>{t("col.reminder")}</th>
                {canWrite && <th className="sr-only">{t("col.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const r = p.reservation;
                const item = items.get(p.itemId);
                if (!r) return null;
                const dueToday = today === r.dueOn;
                return (
                  <tr
                    key={p.itemId}
                    className={cn("border-b align-top", selectedId === p.itemId && "bg-selected")}
                  >
                    {canWrite && (
                      <td className="py-1.5">
                        <input
                          type="checkbox"
                          aria-label={t("select", { name: r.vendorName })}
                          checked={checked.has(p.itemId)}
                          onChange={() => toggle(p.itemId)}
                        />
                      </td>
                    )}
                    <td className="py-1.5 font-semibold tabular-nums">{r.stallNumber}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => onSelect(p.itemId)}
                        className="text-left hover:underline"
                      >
                        {item?.companyName ?? r.vendorName}
                      </button>
                    </td>
                    <td className="text-right tabular-nums">
                      {formatMoney(r.amountCents, locale)}
                    </td>
                    <td className="font-mono text-tiny">{r.reference}</td>
                    <td>
                      {dueToday ? (
                        <StatusBadge tone="critical" icon={CalendarClock}>
                          {t("dueToday")}
                        </StatusBadge>
                      ) : (
                        formatDateWithWeekday(r.dueOn, locale)
                      )}
                    </td>
                    <td className="text-muted-foreground text-tiny">
                      {r.remindedOn
                        ? t("reminded", { date: formatDateShort(r.remindedOn, locale) })
                        : r.reminderOn
                          ? t("reminderOn", { date: formatDateShort(r.reminderOn, locale) })
                          : t("noReminder")}
                    </td>
                    {canWrite && (
                      <td className="whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" onClick={() => onMarkPaid([p.itemId])}>
                          <Check />
                          {t("paid")}
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("release", { name: r.vendorName })}
                          title={t("release", { name: r.vendorName })}
                          onClick={() => onRelease(p.itemId)}
                        >
                          <Unlock />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-faint-foreground text-tiny">{t("rules", { event: ev.name })}</p>

      {released.length > 0 && (
        <details className="rounded-lg border p-2">
          <summary className="cursor-pointer font-medium">
            {t("releasedTitle", { count: released.length })}
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {released.map((r) => (
              <li key={`${r.itemId}-${r.releasedOn}`} className="flex gap-2 text-tiny">
                <span className="w-12 font-semibold">{r.stallNumber}</span>
                <span className="min-w-0 flex-1 truncate">
                  {items.get(r.itemId)?.vendorName ?? r.itemId}
                </span>
                <span className="font-mono">{r.reference}</span>
                <span className="text-muted-foreground">
                  {t(r.reason === "unpaid" ? "releasedUnpaid" : "releasedManual", {
                    date: formatDateShort(r.releasedOn, locale),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-24 rounded-lg bg-sunken px-2 py-1.5">
      <dt className="text-faint-foreground text-tiny">{label}</dt>
      <dd className="font-semibold">{value}</dd>
      {sub && <dd className="text-faint-foreground text-tiny">{sub}</dd>}
    </div>
  );
}
