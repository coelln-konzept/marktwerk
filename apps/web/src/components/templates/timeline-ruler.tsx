"use client";

import { type DayMode, offsetLabel, rulerPosition } from "@marktwerk/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useOffsetText } from "./offset-text";

export type RulerItem = {
  key: string;
  title: string;
  phase: "pre" | "live" | "post";
  offsetDays: number;
  dayMode: DayMode;
  anchorKey: string;
};

const TICKS = [-365, -270, -180, -120, -90, -60, -30, -14, -7, 0, 7, 14, 30, 60, 90];
const DOT: Record<RulerItem["phase"], string> = {
  pre: "bg-status-info-dot",
  live: "bg-status-ok-dot",
  post: "bg-status-waiting-dot",
};
/** Width of a marker in percent of the ruler; markers closer than this go to the next lane. */
const DOT_GAP = 3.2;
const LANE_HEIGHT = 18;
const ANCHOR_ORDER = [
  "event_day",
  "setup_day",
  "teardown_day",
  "booking_cutoff",
  "permit_decision",
];

type Cluster = { offsetDays: number; items: RulerItem[] };
type Active = { offsetDays: number; items: RulerItem[] };

/**
 * Timeline ruler (UX concept: "Excel-like grid + timeline ruler"): rows are plotted from their own anchor
 * (a row due "T+1 Buchungsschluss" is not a row of the event day), one strip per anchor. Rows with the same
 * offset share one marker, so there are fewer tab stops and the ruler stays low. Linear within ±30 days,
 * compressed beyond. Display only: a marker opens its first row; the names of what a marker stands for
 * show in the line below on hover and focus.
 */
export function TimelineRuler({
  items,
  baseHref,
}: {
  items: RulerItem[];
  /** Page URL with the version; a marker links to `<baseHref>&zeile=<key>`. */
  baseHref: string;
}) {
  const t = useTranslations("taskTemplates");
  const offsetText = useOffsetText();
  const [active, setActive] = useState<Active | null>(null);
  if (items.length === 0) return null;

  const anchors = [...new Set(items.map((i) => i.anchorKey))].sort((a, b) => {
    const ia = ANCHOR_ORDER.indexOf(a);
    const ib = ANCHOR_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const anchorName = (key: string) =>
    t.has(`anchors.${key}` as never) ? t(`anchors.${key}` as never) : key;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-tiny">
        <span>{t("ruler.caption")}</span>
        <span className="flex items-center gap-3">
          {(["pre", "live", "post"] as const).map((phase) => (
            <span key={phase} className="inline-flex items-center gap-1">
              <span aria-hidden className={cn("size-2.5 rounded-full", DOT[phase])} />
              {t(`phases.${phase}`)}
            </span>
          ))}
        </span>
      </figcaption>
      {anchors.map((anchor) => (
        <Strip
          key={anchor}
          label={anchors.length > 1 ? t("ruler.anchorGroup", { anchor: anchorName(anchor) }) : null}
          items={items.filter((i) => i.anchorKey === anchor)}
          baseHref={baseHref}
          onActive={setActive}
        />
      ))}
      <p aria-hidden className="m-0 min-h-5 text-small">
        {active ? (
          <>
            <span className="tabular font-semibold">
              {active.items.every((i) => i.dayMode === "calendar")
                ? offsetText.full(active.offsetDays)
                : offsetLabel(active.offsetDays)}
            </span>
            <span className="text-foreground-2">
              {" · "}
              {active.items.map((i) => i.title).join(" · ")}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">{t("ruler.hint")}</span>
        )}
      </p>
    </figure>
  );
}

function Strip({
  label,
  items,
  baseHref,
  onActive,
}: {
  label: string | null;
  items: RulerItem[];
  /** Page URL with the version; a marker links to `<baseHref>&zeile=<key>`. */
  baseHref: string;
  onActive: (active: Active | null) => void;
}) {
  const t = useTranslations("taskTemplates");
  const offsetText = useOffsetText();
  const min = Math.min(...items.map((i) => i.offsetDays));
  const max = Math.max(...items.map((i) => i.offsetDays));
  const x = (offset: number) => rulerPosition(offset, min, max) * 100;

  const byOffset = new Map<number, RulerItem[]>();
  for (const item of items)
    byOffset.set(item.offsetDays, [...(byOffset.get(item.offsetDays) ?? []), item]);
  const clusters: Cluster[] = [...byOffset.entries()]
    .sort(([a], [b]) => a - b)
    .map(([offsetDays, list]) => ({ offsetDays, items: list }));

  // Lanes: left to right, each marker into the first lane where it does not touch the previous one.
  const laneEnds: number[] = [];
  const placed = clusters.map((cluster) => {
    const left = x(cluster.offsetDays);
    let lane = laneEnds.findIndex((end) => left - end >= DOT_GAP);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = left;
    return { cluster, left, lane };
  });
  const height = Math.max(laneEnds.length, 1) * LANE_HEIGHT + 12;
  const ticks = TICKS.filter((tick) => tick >= Math.min(min, -30) && tick <= Math.max(max, 30));

  return (
    <div className="flex flex-col gap-0.5">
      {label && <span className="font-medium text-foreground-2 text-tiny">{label}</span>}
      <div className="overflow-x-auto">
        {/* mx-6: room for the outermost tick label ("T-180") */}
        <div className="relative mx-6 min-w-[520px]" style={{ height: height + 22 }}>
          <div
            aria-hidden
            className="absolute inset-x-0 border-border-subtle border-b"
            style={{ top: height }}
          />
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
              style={{ left: `${x(tick)}%`, top: height }}
            >
              <span
                className={cn(
                  "mx-auto mb-0.5 block w-px",
                  tick === 0 ? "h-2 bg-foreground" : "h-1.5 bg-border",
                )}
              />
              <span className={cn("tabular", tick === 0 && "font-semibold text-foreground")}>
                {offsetLabel(tick)}
              </span>
            </span>
          ))}
          <span
            aria-hidden
            className="absolute w-px bg-foreground/40"
            style={{ left: `${x(0)}%`, top: 0, height }}
          />
          {placed.map(({ cluster, left, lane }) => {
            const first = cluster.items[0] as RulerItem;
            const many = cluster.items.length > 1;
            const titles = cluster.items.map((i) => i.title).join(", ");
            return (
              <Link
                key={cluster.offsetDays}
                href={`${baseHref}&zeile=${encodeURIComponent(first.key)}` as never}
                scroll={false}
                aria-label={t("ruler.dot", {
                  titles,
                  offset: offsetText.full(cluster.offsetDays, first.dayMode),
                })}
                onMouseEnter={() => onActive(cluster)}
                onMouseLeave={() => onActive(null)}
                onFocus={() => onActive(cluster)}
                onBlur={() => onActive(null)}
                className={cn(
                  "-translate-x-1/2 absolute rounded-full border-2 border-card outline-offset-2 hover:scale-125 focus-visible:outline-2 focus-visible:outline-ring",
                  many ? "size-4 ring-1 ring-foreground/40" : "size-3.5",
                  DOT[first.phase],
                )}
                style={{ left: `${left}%`, top: lane * LANE_HEIGHT + 9 }}
              >
                {many && (
                  <span
                    aria-hidden
                    className="tabular -top-2.5 -right-2 pointer-events-none absolute font-semibold text-[10px] text-foreground-2"
                  >
                    {cluster.items.length}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
