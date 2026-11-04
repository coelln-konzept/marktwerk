"use client";

import { stallNumber } from "@marktwerk/core";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { planBounds, zoneLabelPos } from "./geometry";
import type { Backdrop, RowGeom, StoredPlacement } from "./store";
import type { BookingItem, PlanRow, PlanVenue } from "./types";

export interface DropPreview {
  rowId: string;
  startCm: number;
  lengthCm: number;
  /** false: there is no valid spot on this row. */
  ok: boolean;
  /** Why it doesn't fit (shown next to the drag label). */
  reason?: string;
}

type View = { x: number; y: number; w: number; h: number };

/**
 * The stall plan, true to scale (1 unit = 1 cm). Rows are drawn where the layout puts them (moved and
 * rotated in "Layout bearbeiten", optionally over an aerial photo or the paper Lageplan). Unlike a
 * picker that shows one row at a time, the whole venue is visible, so free space is visible at a glance.
 * Dragging is driven by the parent (`StandplanView`), which hit-tests `[data-row-id]` and converts the
 * pointer into row-local centimetres with each row group's screen matrix.
 */
export function PlanMap({
  venue,
  layout,
  backdrop,
  placements,
  items,
  selectedId,
  highlightRowLabel,
  preview,
  editLayout,
  selectedRowId,
  onSelectPlacement,
  onSelectRow,
  onStartPlacementDrag,
  onRowGeom,
  onBackdrop,
  svgRef,
  printMode,
}: {
  venue: PlanVenue;
  layout: Record<string, RowGeom>;
  backdrop?: Backdrop;
  placements: StoredPlacement[];
  items: Map<string, BookingItem>;
  selectedId: string | null;
  highlightRowLabel: string | null;
  preview: DropPreview | null;
  editLayout: boolean;
  selectedRowId: string | null;
  onSelectPlacement?: (itemId: string | null) => void;
  onSelectRow?: (rowId: string | null) => void;
  onStartPlacementDrag?: (e: React.PointerEvent, itemId: string, grabOffsetCm: number) => void;
  onRowGeom?: (rowId: string, geom: RowGeom) => void;
  onBackdrop?: (b: Backdrop) => void;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  printMode?: boolean;
}) {
  const t = useTranslations("standplan.map");
  const ownRef = useRef<SVGSVGElement | null>(null);
  const ref = svgRef ?? ownRef;
  const bounds = useMemo(() => {
    const b = planBounds(venue, layout);
    if (!backdrop) return b;
    // include the backdrop so it isn't cut off
    const x = Math.min(b.x, backdrop.x);
    const y = Math.min(b.y, backdrop.y);
    return {
      x,
      y,
      w: Math.max(b.x + b.w, backdrop.x + backdrop.widthCm) - x,
      h: Math.max(b.y + b.h, backdrop.y + backdrop.widthCm * 0.75) - y,
    };
  }, [venue, layout, backdrop]);
  const [view, setView] = useState<View>(bounds);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit only when the venue changes
  useEffect(() => setView(bounds), [venue.id]);

  // Wheel zoom around the pointer (non-passive so the page doesn't scroll).
  useEffect(() => {
    const svg = ref.current;
    if (!svg || printMode) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      const k = Math.exp(e.deltaY * 0.0015);
      setView((v) => {
        const w = Math.min(Math.max(v.w * k, 800), bounds.w * 4);
        const f = w / v.w;
        return { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w, h: v.h * f };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [ref, bounds.w, printMode]);

  const zoom = (k: number) =>
    setView((v) => {
      const w = v.w * k;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - v.h * k) / 2, w, h: v.h * k };
    });

  /** Units per screen pixel (for drag deltas). */
  const unitsPerPx = useCallback(() => {
    const ctm = ref.current?.getScreenCTM();
    return ctm ? 1 / ctm.a : 1;
  }, [ref]);

  /** Generic pointer drag: calls `move(dxUnits, dyUnits)` until release. */
  const track = useCallback(
    (e: React.PointerEvent, move: (dx: number, dy: number) => void, onClick?: () => void) => {
      const sx = e.clientX;
      const sy = e.clientY;
      const k = unitsPerPx();
      let moved = false;
      const onMove = (ev: PointerEvent) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        moved = true;
        move((ev.clientX - sx) * k, (ev.clientY - sy) * k);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!moved) onClick?.();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [unitsPerPx],
  );

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (printMode || e.button !== 0) return;
    const start = view;
    track(
      e,
      (dx, dy) => setView({ ...start, x: start.x - dx, y: start.y - dy }),
      () => {
        onSelectPlacement?.(null);
        onSelectRow?.(null);
      },
    );
  };

  const fontSize = 95;

  return (
    <div className={cn("relative h-full w-full", !printMode && "touch-none select-none")}>
      <svg
        ref={ref}
        viewBox={
          printMode
            ? `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`
            : `${view.x} ${view.y} ${view.w} ${view.h}`
        }
        preserveAspectRatio="xMidYMid meet"
        className={cn("h-full w-full", !printMode && "cursor-grab active:cursor-grabbing")}
        role="img"
        aria-label={t("label", { venue: venue.name })}
      >
        <rect
          x={bounds.x - bounds.w * 3}
          y={bounds.y - bounds.h * 3}
          width={bounds.w * 7}
          height={bounds.h * 7}
          fill="transparent"
          onPointerDown={onBackgroundDown}
        />
        {backdrop && (
          <image
            href={backdrop.src}
            x={backdrop.x}
            y={backdrop.y}
            width={backdrop.widthCm}
            opacity={backdrop.opacity}
            preserveAspectRatio="xMinYMin meet"
            className={editLayout ? "cursor-move" : "pointer-events-none"}
            onPointerDown={(e) => {
              if (!editLayout || !onBackdrop) return;
              e.stopPropagation();
              const s = backdrop;
              track(e, (dx, dy) => onBackdrop({ ...s, x: s.x + dx, y: s.y + dy }));
            }}
          />
        )}
        {zoneLabelPos(venue, layout).map((z) => (
          <text
            key={z.zoneId}
            x={z.x}
            y={z.y - 120}
            fontSize={150}
            fontWeight={600}
            fill="var(--muted-foreground)"
            className="pointer-events-none"
          >
            {z.name}
          </text>
        ))}
        {venue.zones.flatMap((z) =>
          z.rows.map((row) => {
            const g = layout[row.id];
            if (!g) return null;
            const onRow = placements.filter((p) => p.rowId === row.id);
            const isPreferred = highlightRowLabel === row.label;
            const rowSelected = editLayout && selectedRowId === row.id;
            const onRowDown = (e: React.PointerEvent) => {
              if (!editLayout || printMode) return;
              e.stopPropagation();
              const s = g;
              onSelectRow?.(row.id);
              track(e, (dx, dy) => onRowGeom?.(row.id, { ...s, x: s.x + dx, y: s.y + dy }));
            };
            return (
              <g
                key={row.id}
                data-row-g={row.id}
                transform={`translate(${g.x} ${g.y}) rotate(${g.angle})`}
              >
                {/* Padded, invisible hit area: rows are only a few pixels tall when zoomed out, so drops
                    and layout drags land on the row even slightly above or below it. */}
                <rect
                  data-row-id={row.id}
                  x={-150}
                  y={-240}
                  width={row.lengthCm + 300}
                  height={row.depthCm + 440}
                  fill="transparent"
                  className={editLayout ? "cursor-move" : undefined}
                  onPointerDown={onRowDown}
                />
                {/* row header */}
                <text
                  x={0}
                  y={-60}
                  fontSize={fontSize}
                  fill="var(--muted-foreground)"
                  className="pointer-events-none"
                >
                  <tspan fontWeight={700} fill="var(--foreground)">
                    {t("row", { label: row.label })}
                  </tspan>
                  {`  ${(row.lengthCm / 100).toLocaleString("de-DE")} m × ${(row.depthCm / 100).toLocaleString("de-DE")} m`}
                  {row.carAllowed ? `  · ${t("cars", { count: row.carSlots })}` : ""}
                  {row.power ? `  · ${t("power")}` : ""}
                </text>
                {/* track (hit target for drops) */}
                <rect
                  data-row-id={row.id}
                  x={0}
                  y={0}
                  width={row.lengthCm}
                  height={row.depthCm}
                  rx={20}
                  fill={isPreferred ? "var(--accent-soft)" : "var(--sunken)"}
                  stroke={
                    rowSelected
                      ? "var(--primary)"
                      : isPreferred
                        ? "var(--primary)"
                        : "var(--border)"
                  }
                  strokeWidth={rowSelected || isPreferred ? 22 : 8}
                  strokeDasharray={isPreferred && !rowSelected ? "60 40" : undefined}
                  className={editLayout ? "cursor-move" : undefined}
                  onPointerDown={onRowDown}
                />
                {/* metre ticks */}
                {Array.from({ length: Math.floor(row.lengthCm / 100) + 1 }, (_, m) => (
                  <line
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed tick positions
                    key={m}
                    x1={m * 100}
                    x2={m * 100}
                    y1={row.depthCm}
                    y2={row.depthCm + (m % 5 === 0 ? 70 : 30)}
                    stroke="var(--input)"
                    strokeWidth={m % 5 === 0 ? 8 : 4}
                    className="pointer-events-none"
                  />
                ))}
                {Array.from({ length: Math.floor(row.lengthCm / 500) + 1 }, (_, i) => (
                  <text
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed labels
                    key={i}
                    x={i * 500}
                    y={row.depthCm + 160}
                    fontSize={70}
                    textAnchor="middle"
                    fill="var(--faint-foreground)"
                    className="pointer-events-none"
                  >
                    {i * 5}
                  </text>
                ))}
                {onRow.map((p) => (
                  <PlacedStall
                    key={p.itemId}
                    p={p}
                    row={row}
                    item={items.get(p.itemId)}
                    selected={selectedId === p.itemId}
                    disabled={editLayout || printMode}
                    onPointerDown={(e) => {
                      if (editLayout || printMode || e.button !== 0) return;
                      e.stopPropagation();
                      const ctm = (e.currentTarget.parentNode as SVGGElement).getScreenCTM();
                      const local = ctm
                        ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()).x
                        : p.startCm;
                      onStartPlacementDrag?.(e, p.itemId, local - p.startCm);
                    }}
                  />
                ))}
                {preview && preview.rowId === row.id && (
                  <rect
                    x={preview.startCm}
                    y={-20}
                    width={preview.lengthCm}
                    height={row.depthCm + 40}
                    rx={24}
                    fill={preview.ok ? "var(--primary)" : "var(--status-critical-dot)"}
                    fillOpacity={0.25}
                    stroke={preview.ok ? "var(--primary)" : "var(--status-critical-dot)"}
                    strokeWidth={16}
                    strokeDasharray="50 30"
                    className="pointer-events-none"
                  />
                )}
              </g>
            );
          }),
        )}
      </svg>
      {!printMode && (
        <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg border bg-card p-1 shadow-sm">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("zoomIn")}
            onClick={() => zoom(0.75)}
          >
            <Plus />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("zoomOut")}
            onClick={() => zoom(1.33)}
          >
            <Minus />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("fit")}
            onClick={() => setView(bounds)}
          >
            <Maximize2 />
          </Button>
        </div>
      )}
    </div>
  );
}

function PlacedStall({
  p,
  row,
  item,
  selected,
  disabled,
  onPointerDown,
}: {
  p: StoredPlacement;
  row: PlanRow;
  item: BookingItem | undefined;
  selected: boolean;
  disabled?: boolean;
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void;
}) {
  const proposed = p.status === "proposed";
  const len = p.endCm - p.startCm;
  const fromMail = item?.mailId != null;
  const name = item?.companyName ?? item?.vendorName ?? "?";
  const maxChars = Math.max(2, Math.floor(len / 55));
  return (
    <g onPointerDown={onPointerDown} className={disabled ? "pointer-events-none" : "cursor-grab"}>
      <title>{`${stallNumber(row.label, p.startCm)} · ${name} · ${(len / 100).toLocaleString("de-DE")} m`}</title>
      <rect
        x={p.startCm + 6}
        y={6}
        width={len - 12}
        height={row.depthCm - 12}
        rx={16}
        fill={
          proposed
            ? "var(--status-warn-bg)"
            : fromMail
              ? "var(--status-ok-bg)"
              : "var(--status-neutral-bg)"
        }
        stroke={
          selected
            ? "var(--primary)"
            : proposed
              ? "var(--status-warn-dot)"
              : fromMail
                ? "var(--status-ok-dot)"
                : "var(--status-neutral-dot)"
        }
        strokeWidth={selected ? 26 : 10}
        strokeDasharray={proposed ? "40 24" : undefined}
      />
      <text
        x={p.startCm + 40}
        y={Math.min(row.depthCm * 0.42, 120)}
        fontSize={78}
        fontWeight={700}
        fill="var(--foreground)"
        className="pointer-events-none"
      >
        {stallNumber(row.label, p.startCm)}
        {p.car ? " ▣" : ""}
      </text>
      <text
        x={p.startCm + 40}
        y={Math.min(row.depthCm * 0.42, 120) + 95}
        fontSize={70}
        fill="var(--muted-foreground)"
        className="pointer-events-none"
      >
        {name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name}
      </text>
    </g>
  );
}
