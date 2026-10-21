import { offsetLabel, rulerPosition } from "@marktwerk/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type RulerItem = {
  key: string;
  title: string;
  phase: "pre" | "live" | "post";
  offsetDays: number;
  anchorKey: string;
};

const TICKS = [-365, -270, -180, -120, -90, -60, -30, -14, -7, 0, 7, 14, 30, 60, 90];
const DOT: Record<RulerItem["phase"], string> = {
  pre: "bg-status-info-dot",
  live: "bg-status-ok-dot",
  post: "bg-status-waiting-dot",
};
/** Width of a dot in percent of the ruler; dots closer than this go to the next lane. */
const DOT_GAP = 2.4;
const LANE_HEIGHT = 18;

/**
 * Simple timeline ruler (UX concept: "Excel-like grid + timeline ruler"): every row as a dot at its offset
 * from the anchor, linear within ±30 days and compressed beyond. Display only: a dot opens the row.
 */
export function TimelineRuler({
  items,
  hrefFor,
}: {
  items: RulerItem[];
  hrefFor: (key: string) => string;
}) {
  const t = useTranslations("taskTemplates");
  if (items.length === 0) return null;
  const min = Math.min(...items.map((i) => i.offsetDays));
  const max = Math.max(...items.map((i) => i.offsetDays));
  const x = (offset: number) => rulerPosition(offset, min, max) * 100;

  // Lanes: sort left to right, put each dot into the first lane where it does not touch the previous one.
  const laneEnds: number[] = [];
  const placed = [...items]
    .sort((a, b) => a.offsetDays - b.offsetDays)
    .map((item) => {
      const left = x(item.offsetDays);
      let lane = laneEnds.findIndex((end) => left - end >= DOT_GAP);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = left;
      return { item, left, lane };
    });
  const height = Math.max(laneEnds.length, 1) * LANE_HEIGHT + 8;
  const ticks = TICKS.filter((tick) => tick >= Math.min(min, -30) && tick <= Math.max(max, 30));

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
      <div className="overflow-x-auto">
        <div className="relative mx-3 min-w-[560px]" style={{ height: height + 24 }}>
          <div
            aria-hidden
            className="absolute inset-x-0 border-border-subtle border-b"
            style={{ top: height }}
          />
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="absolute -translate-x-1/2 text-[11px] text-muted-foreground"
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
          {placed.map(({ item, left, lane }) => (
            <Link
              key={item.key}
              href={hrefFor(item.key) as never}
              scroll={false}
              title={`${offsetLabel(item.offsetDays)} · ${item.title}`}
              aria-label={t("ruler.dot", {
                title: item.title,
                offset: offsetLabel(item.offsetDays),
              })}
              className={cn(
                "-translate-x-1/2 absolute size-3.5 rounded-full border-2 border-card outline-offset-2 hover:scale-125 focus-visible:outline-2 focus-visible:outline-ring",
                DOT[item.phase],
              )}
              style={{ left: `${left}%`, top: lane * LANE_HEIGHT + 4 }}
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
