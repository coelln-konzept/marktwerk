"use client";

import {
  autoPlace,
  checkFit,
  DEFAULT_GAP_RULE,
  explainNoFit,
  explainUnplaceable,
  type NoFitReason,
  nearestFit,
  type Placement,
  quoteStall,
  rowUtilisation,
  stallNumber,
} from "@marktwerk/core";
import {
  Car,
  Check,
  CircleAlert,
  CircleDashed,
  GripVertical,
  Mail,
  MapPinned,
  Move,
  Printer,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  StickyNote,
  Trash2,
  UserCheck,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendOutgoing,
  readMailState,
  registerVendors,
  useMailStore,
  writeMailState,
} from "@/components/postfach/mail-store";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateWithWeekday, formatLength, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { confirmationMail } from "./confirmation";
import { defaultLayout } from "./geometry";
import { type DropPreview, PlanMap } from "./plan-map";
import {
  type PlanVersion,
  type RowGeom,
  type SentMail,
  type StandplanState,
  type StoredPlacement,
  useStandplanStore,
} from "./store";
import type { BookingItem, PlanEvent, PlanRow, StandplanData } from "./types";
import { mergeReasons, useWhy } from "./why";

type Drag = {
  itemId: string;
  label: string;
  lengthCm: number;
  car: boolean;
  power: boolean;
  grabCm: number;
  x: number;
  y: number;
  active: boolean;
};

type Tab = "open" | "placed" | "declined";

export function StandplanView({
  data,
  initialEventId,
  canWrite,
}: {
  data: StandplanData;
  initialEventId: string | null;
  canWrite: boolean;
}) {
  const t = useTranslations("standplan");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const { state, update, reset } = useStandplanStore();

  const [eventId, setEventId] = useState(
    initialEventId && data.events.some((e) => e.id === initialEventId)
      ? initialEventId
      : (data.events.find((e) => data.items.some((i) => i.eventId === e.id && i.mailId))?.id ??
          data.events[0]?.id ??
          null),
  );
  const ev = data.events.find((e) => e.id === eventId) ?? null;
  const venue = data.venues.find((v) => v.id === ev?.venueId) ?? null;
  const rows = useMemo(() => venue?.zones.flatMap((z) => z.rows) ?? [], [venue]);
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r] as const)), [rows]);
  const items = useMemo(
    () =>
      new Map(
        [...data.items, ...state.manualItems]
          .filter((i) => i.eventId === eventId)
          .map((i) => [i.id, i] as const),
      ),
    [data.items, state.manualItems, eventId],
  );

  const placements: StoredPlacement[] = useMemo(() => {
    if (!eventId) return [];
    return (
      state.placements[eventId] ??
      (data.existing[eventId] ?? []).map((p) => ({ ...p, status: "assigned" as const }))
    );
  }, [state.placements, data.existing, eventId]);
  const placedIds = useMemo(() => new Set(placements.map((p) => p.itemId)), [placements]);
  const declined = useMemo(() => new Set(state.declined), [state.declined]);

  const layoutRows: Record<string, RowGeom> = useMemo(() => {
    if (!venue) return {};
    const saved = state.layouts[venue.id]?.rows ?? {};
    return { ...defaultLayout(venue), ...saved };
  }, [venue, state.layouts]);
  const backdrop = venue ? state.layouts[venue.id]?.backdrop : undefined;
  const gapRule = state.gapRule ? DEFAULT_GAP_RULE : null;
  const why = useWhy();
  const { state: mail } = useMailStore();
  /** Vendor list status: already a vendor, added by a confirmation here (simulated), or still new. */
  const vendorStatus = (i: BookingItem): "known" | "registered" | "new" =>
    i.knownVendor
      ? "known"
      : mail.vendorRegister.some((v) => v.email === i.email.toLowerCase())
        ? "registered"
        : "new";

  const [tab, setTab] = useState<Tab>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [editLayout, setEditLayout] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const [announce, setAnnounce] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);

  const selectEvent = (id: string) => {
    setEventId(id);
    setSelectedId(null);
    setEditLayout(false);
    router.replace(`/standplan?veranstaltung=${id}` as Route, { scroll: false });
  };

  const openItems = [...items.values()]
    .filter((i) => i.mailId && !placedIds.has(i.id) && !declined.has(i.id))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const declinedItems = [...items.values()].filter((i) => declined.has(i.id));
  const proposals = placements.filter((p) => p.status === "proposed");

  // Why a request can't be placed: per row (drop/menu feedback) and over all rows (badge on the card).
  const candidateOf = (i: BookingItem) => ({
    lengthCm: i.lengthCm,
    car: i.carRequested,
    power: i.power,
  });
  const reasonOnRow = (i: BookingItem, row: PlanRow) =>
    explainNoFit(row, placements.map(toPlacement), candidateOf(i), i.id, gapRule);
  const blockedById = new Map(
    openItems.flatMap((i) => {
      const groups = mergeReasons(
        explainUnplaceable(rows, placements.map(toPlacement), candidateOf(i), i.id, gapRule),
      );
      return groups.length ? [[i.id, groups] as const] : [];
    }),
  );

  // --- mutations (all local in the prototype) ---------------------------------------------------
  const setEventPlacements = useCallback(
    (fn: (list: StoredPlacement[]) => StoredPlacement[]) => {
      if (!eventId) return;
      update((s) => ({
        ...s,
        placements: { ...s.placements, [eventId]: fn(placementsFor(s, data, eventId)) },
      }));
    },
    [eventId, update, data],
  );

  const placeAt = useCallback(
    (item: BookingItem, row: PlanRow, wantedCm: number, current: StoredPlacement[]) => {
      const start = nearestFit(
        row,
        current.map(toPlacement),
        { lengthCm: item.lengthCm, car: item.carRequested, power: item.power },
        wantedCm,
        item.id,
        gapRule,
      );
      if (start === null) return null;
      return { start, list: upsert(current, item, row.id, start) };
    },
    [gapRule],
  );

  const placeItem = (item: BookingItem, rowId: string, wantedCm: number) => {
    const row = rowsById.get(rowId);
    if (!row) return;
    const res = placeAt(item, row, wantedCm, placements);
    if (!res) {
      const reason = reasonOnRow(item, row);
      showToast({
        tone: "error",
        message: reason
          ? t("why.toast", { row: row.label, why: why.one(reason) })
          : t("toast.noRoom", { row: row.label }),
      });
      return;
    }
    const before = placements;
    setEventPlacements(() => res.list);
    setSelectedId(item.id);
    const nr = stallNumber(row.label, res.start);
    setAnnounce(t("announce.placed", { name: item.vendorName, stall: nr }));
    showToast({
      message: t("toast.placed", { name: item.vendorName, stall: nr }),
      actionLabel: t("undo"),
      onAction: () => setEventPlacements(() => before),
    });
  };

  const unplace = (itemId: string) => {
    const before = placements;
    setEventPlacements((list) => list.filter((p) => p.itemId !== itemId));
    if (selectedId === itemId) setSelectedId(null);
    showToast({
      message: t("toast.unplaced", { name: items.get(itemId)?.vendorName ?? "" }),
      actionLabel: t("undo"),
      onAction: () => setEventPlacements(() => before),
    });
  };

  const decline = (itemId: string) => {
    update((s) => ({ ...s, declined: [...s.declined, itemId] }));
    showToast({
      message: t("toast.declined", { name: items.get(itemId)?.vendorName ?? "" }),
      actionLabel: t("undo"),
      onAction: () => update((s) => ({ ...s, declined: s.declined.filter((d) => d !== itemId) })),
    });
  };

  const runAutoplatz = () => {
    const res = autoPlace(
      rows,
      placements.map(toPlacement),
      openItems.map((i) => ({
        id: i.id,
        lengthCm: i.lengthCm,
        carRequested: i.carRequested,
        power: i.power,
        preferredRowLabel: i.preferredRowLabel,
        preferredOffsetCm: i.preferredOffsetCm,
      })),
      gapRule,
    );
    const before = placements;
    setEventPlacements((list) => [
      ...list,
      ...res.placed.map((p) => ({ ...p, itemId: p.id, status: "proposed" as const })),
    ]);
    showToast({
      message: res.unplaced.length
        ? t("toast.autoplatzWhy", { placed: res.placed.length, left: res.unplaced.length })
        : t("toast.autoplatz", { placed: res.placed.length, left: 0 }),
      actionLabel: t("undo"),
      onAction: () => setEventPlacements(() => before),
    });
  };

  const confirm = (only?: string) => {
    if (!ev) return;
    const targets = proposals.filter((p) => !only || p.itemId === only);
    if (targets.length === 0) return;
    const now = new Date().toISOString();
    const mails: SentMail[] = targets.flatMap((p) => {
      const item = items.get(p.itemId);
      const row = rowsById.get(p.rowId);
      if (!item || !row) return [];
      const m = confirmationMail(item, ev, row, p);
      return [
        {
          id: `sent-${p.itemId}-${now}`,
          itemId: p.itemId,
          eventId: ev.id,
          toName: item.vendorName,
          toAddress: item.email,
          subject: m.subject,
          body: m.body,
          sentAt: now,
        },
      ];
    });
    const ids = new Set(targets.map((p) => p.itemId));
    const before = state;
    const mailBefore = readMailState();
    // The confirmation also becomes an outgoing message in the request's Postfach conversation.
    for (const m of mails) {
      const item = items.get(m.itemId);
      if (!item?.mailId) continue;
      appendOutgoing({
        conversationId: item.mailId.startsWith("c-") ? item.mailId : `c-${item.mailId}`,
        to: { name: item.vendorName, address: item.email },
        fromAddress: "buchung@coelln-konzept.de",
        subject: m.subject,
        text: m.body,
        authorId: "standplan",
      });
    }
    // Only now (confirmed) do new people enter the vendor list (SIMULATED; real build: insert `vendor`).
    const { added } = registerVendors(
      targets.flatMap((p) => {
        const item = items.get(p.itemId);
        if (!item || item.knownVendor || !item.email) return [];
        return [
          {
            email: item.email,
            name: item.vendorName,
            companyName: item.companyName,
            kind: item.kind,
            phone: item.phone,
            eventId: ev.id,
            requestRef: item.requestRef,
          },
        ];
      }),
    );
    update((s) => ({
      ...s,
      placements: {
        ...s.placements,
        [ev.id]: placementsFor(s, data, ev.id).map((p) =>
          ids.has(p.itemId) ? { ...p, status: "assigned" as const } : p,
        ),
      },
      sent: [...mails, ...s.sent],
    }));
    showToast({
      message: added
        ? t("toast.confirmedWithVendors", { count: mails.length, added })
        : t("toast.confirmed", { count: mails.length }),
      actionLabel: t("undo"),
      onAction: () => {
        update(() => before);
        writeMailState(mailBefore);
      },
    });
  };

  // --- drafts (Versionen): save and compare arrangements without sending anything -------------
  const versions = eventId ? (state.versions[eventId] ?? []) : [];
  const activeVersionId = eventId ? state.activeVersion[eventId] : undefined;
  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const draftSignature = (list: StoredPlacement[]) =>
    list
      .filter((p) => p.status === "proposed")
      .map((p) => `${p.itemId}@${p.rowId}:${p.startCm}`)
      .sort()
      .join("|");
  const unsaved =
    proposals.length > 0 &&
    (!activeVersion || draftSignature(activeVersion.placements) !== draftSignature(placements));

  const saveVersion = (name?: string) => {
    if (!eventId) return;
    const now = new Date();
    const version: PlanVersion = {
      id: `v-${now.getTime()}`,
      name: name?.trim() || t("versions.defaultName", { n: versions.length + 1 }),
      savedAt: now.toISOString(),
      // Only the drafts: confirmed stalls are the shared truth and stay as they are.
      placements: placements.filter((p) => p.status === "proposed"),
    };
    update((s) => ({
      ...s,
      versions: { ...s.versions, [eventId]: [version, ...(s.versions[eventId] ?? [])] },
      activeVersion: { ...s.activeVersion, [eventId]: version.id },
    }));
    showToast({ message: t("toast.versionSaved", { name: version.name }) });
  };

  /**
   * Loading a draft replaces the current proposals. Confirmed stalls are never touched; a draft stall
   * that now collides with a stall confirmed in the meantime is left out (and counted).
   */
  const loadVersion = (v: PlanVersion) => {
    if (!eventId) return;
    const before = state;
    const assigned = placements.filter((p) => p.status === "assigned");
    const assignedIds = new Set(assigned.map((p) => p.itemId));
    const next = [...assigned];
    let skipped = 0;
    for (const p of v.placements) {
      const row = rowsById.get(p.rowId);
      const free =
        row &&
        !assignedIds.has(p.itemId) &&
        !declined.has(p.itemId) &&
        checkFit(
          row,
          next.map(toPlacement),
          { startCm: p.startCm, lengthCm: p.endCm - p.startCm, car: p.car },
          p.itemId,
        ) === null;
      if (free) next.push({ ...p, status: "proposed" });
      else skipped++;
    }
    update((s) => ({
      ...s,
      placements: { ...s.placements, [eventId]: next },
      activeVersion: { ...s.activeVersion, [eventId]: v.id },
    }));
    setSelectedId(null);
    showToast({
      message: skipped
        ? t("toast.versionLoadedSkipped", { name: v.name, skipped })
        : t("toast.versionLoaded", { name: v.name }),
      actionLabel: t("undo"),
      onAction: () => update(() => before),
    });
  };

  const renameVersion = (id: string, name: string) => {
    if (!eventId || !name.trim()) return;
    update((s) => ({
      ...s,
      versions: {
        ...s.versions,
        [eventId]: (s.versions[eventId] ?? []).map((v) =>
          v.id === id ? { ...v, name: name.trim() } : v,
        ),
      },
    }));
  };

  const deleteVersion = (v: PlanVersion) => {
    if (!eventId) return;
    const before = state;
    update((s) => ({
      ...s,
      versions: {
        ...s.versions,
        [eventId]: (s.versions[eventId] ?? []).filter((x) => x.id !== v.id),
      },
    }));
    showToast({
      message: t("toast.versionDeleted", { name: v.name }),
      actionLabel: t("undo"),
      onAction: () => update(() => before),
    });
  };

  // --- drag controller (request list → map, and stall → elsewhere on the map) -------------------
  const dragRef = useRef<Drag | null>(null);
  const previewRef = useRef<DropPreview | null>(null);
  const placementsRef = useRef(placements);
  placementsRef.current = placements;

  const computePreview = useCallback(
    (d: Drag, x: number, y: number): DropPreview | null => {
      const el = document
        .elementsFromPoint(x, y)
        .find((e) => e instanceof SVGElement && e.dataset.rowId) as SVGElement | undefined;
      const rowId = el?.dataset.rowId;
      const row = rowId ? rowsById.get(rowId) : undefined;
      const g = rowId
        ? svgRef.current?.querySelector<SVGGElement>(`[data-row-g="${rowId}"]`)
        : null;
      const ctm = g?.getScreenCTM();
      if (!row || !ctm) return null;
      const local = new DOMPoint(x, y).matrixTransform(ctm.inverse()).x - d.grabCm;
      const start = nearestFit(
        row,
        placementsRef.current.map(toPlacement),
        { lengthCm: d.lengthCm, car: d.car, power: d.power },
        local,
        d.itemId,
        gapRule,
      );
      return start === null
        ? (() => {
            const reason = explainNoFit(
              row,
              placementsRef.current.map(toPlacement),
              { lengthCm: d.lengthCm, car: d.car, power: d.power },
              d.itemId,
              gapRule,
            );
            return {
              rowId: row.id,
              startCm: Math.max(0, local),
              lengthCm: d.lengthCm,
              ok: false,
              reason: reason ? why.one(reason) : undefined,
            };
          })()
        : { rowId: row.id, startCm: start, lengthCm: d.lengthCm, ok: true };
    },
    [rowsById, gapRule, why],
  );

  const startDrag = (e: React.PointerEvent, item: BookingItem, grabCm: number) => {
    if (!canWrite || e.button !== 0) return;
    e.preventDefault();
    const d: Drag = {
      itemId: item.id,
      label: item.companyName ?? item.vendorName,
      lengthCm: item.lengthCm,
      car: item.carRequested,
      power: item.power,
      grabCm,
      x: e.clientX,
      y: e.clientY,
      active: false,
    };
    const sx = e.clientX;
    const sy = e.clientY;
    dragRef.current = d;
    const onMove = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      if (!cur.active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      const next = { ...cur, x: ev.clientX, y: ev.clientY, active: true };
      dragRef.current = next;
      setDrag(next);
      const p = computePreview(next, ev.clientX, ev.clientY);
      previewRef.current = p;
      setPreview(p);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      const cur = dragRef.current;
      const p = previewRef.current;
      dragRef.current = null;
      previewRef.current = null;
      setDrag(null);
      setPreview(null);
      if (!cur) return;
      if (!cur.active) {
        setSelectedId(item.id);
        return;
      }
      if (!commit) return;
      const overList = document
        .elementsFromPoint(cur.x, cur.y)
        .some((el) => (el as HTMLElement).dataset?.dropUnplace);
      if (overList && placedIds.has(item.id)) {
        unplace(item.id);
        return;
      }
      if (p?.ok) placeItem(item, p.rowId, p.startCm);
      else if (p)
        showToast({
          tone: "error",
          message: p.reason
            ? t("why.toast", { row: rowsById.get(p.rowId)?.label ?? "", why: p.reason })
            : t("toast.noRoom", { row: rowsById.get(p.rowId)?.label ?? "" }),
        });
    };
    const onUp = () => finish(true);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
  };

  // --- keyboard on the map: move the selected stall ---------------------------------------------
  const onMapKey = (e: React.KeyboardEvent) => {
    if (!canWrite || !selectedId || editLayout) return;
    const p = placements.find((x) => x.itemId === selectedId);
    const item = items.get(selectedId);
    if (!p || !item) return;
    const row = rowsById.get(p.rowId);
    if (!row) return;
    const others = placements.map(toPlacement);
    const move = (target: PlanRow, start: number, exact: boolean) => {
      const fit = exact
        ? checkFit(
            target,
            others,
            { startCm: start, lengthCm: item.lengthCm, car: item.carRequested, power: item.power },
            item.id,
            gapRule,
          ) === null
          ? start
          : null
        : nearestFit(
            target,
            others,
            { lengthCm: item.lengthCm, car: item.carRequested, power: item.power },
            start,
            item.id,
            gapRule,
          );
      if (fit === null) {
        setAnnounce(t("announce.blocked"));
        return;
      }
      setEventPlacements((list) => upsert(list, item, target.id, fit));
      setAnnounce(
        t("announce.placed", { name: item.vendorName, stall: stallNumber(target.label, fit) }),
      );
    };
    const idx = rows.findIndex((r) => r.id === row.id);
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        move(row, p.startCm - (e.shiftKey ? 100 : 50), true);
        break;
      case "ArrowRight":
        e.preventDefault();
        move(row, p.startCm + (e.shiftKey ? 100 : 50), true);
        break;
      case "ArrowUp":
        e.preventDefault();
        {
          const prev = rows[idx - 1];
          if (prev) move(prev, p.startCm, false);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        {
          const next = rows[idx + 1];
          if (next) move(next, p.startCm, false);
        }
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        unplace(item.id);
        break;
      case "Escape":
        setSelectedId(null);
        break;
    }
  };

  // --- layout editing ----------------------------------------------------------------------------
  const setRowGeom = (rowId: string, geom: RowGeom) => {
    if (!venue) return;
    update((s) => {
      const cur = s.layouts[venue.id] ?? { rows: {} };
      return {
        ...s,
        layouts: { ...s.layouts, [venue.id]: { ...cur, rows: { ...cur.rows, [rowId]: geom } } },
      };
    });
  };
  const setBackdrop = (b: StandplanState["layouts"][string]["backdrop"]) => {
    if (!venue) return;
    update((s) => {
      const cur = s.layouts[venue.id] ?? { rows: {} };
      return { ...s, layouts: { ...s.layouts, [venue.id]: { ...cur, backdrop: b } } };
    });
  };
  const onBackdropFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const totalW = Math.max(...Object.values(layoutRows).map((g) => g.x), 0) + 6000;
      setBackdrop({ src: String(reader.result), x: -500, y: -500, widthCm: totalW, opacity: 0.45 });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (selectedId && !items.has(selectedId)) setSelectedId(null);
  }, [items, selectedId]);

  if (!ev || !venue) {
    return <p className="text-muted-foreground">{t("noEvents")}</p>;
  }

  const capacity = rows.reduce((s, r) => s + r.lengthCm, 0);
  const used = placements.reduce((s, p) => s + p.endCm - p.startCm, 0);
  const selItem = selectedId ? items.get(selectedId) : undefined;
  const selPlacement = selectedId ? placements.find((p) => p.itemId === selectedId) : undefined;
  const highlight =
    (hoverId ? items.get(hoverId)?.preferredRowLabel : null) ??
    (selItem && !selPlacement ? selItem.preferredRowLabel : null);
  const selRow = selectedRowId ? rowsById.get(selectedRowId) : undefined;
  const selGeom = selectedRowId ? layoutRows[selectedRowId] : undefined;

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* ---------- map column ---------- */}
      <section className="flex min-w-0 flex-col gap-3" aria-label={t("mapRegion")}>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && !editLayout && (
            <>
              <Button onClick={runAutoplatz} disabled={openItems.length === 0}>
                <Sparkles />
                {t("autoplatz")}
              </Button>
              <Button onClick={() => saveVersion()} disabled={proposals.length === 0}>
                <Save />
                {t("versions.save")}
              </Button>
              <Button variant="default" onClick={() => confirm()} disabled={proposals.length === 0}>
                <Mail />
                {t("confirmAll", { count: proposals.length })}
              </Button>
            </>
          )}
          <Button
            variant={editLayout ? "default" : "outline"}
            onClick={() => setEditLayout((v) => !v)}
          >
            <Move />
            {editLayout ? t("layout.done") : t("layout.edit")}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer />
            {t("print")}
          </Button>
          <label className="ml-auto flex items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={state.gapRule}
              onChange={(e) => update((s) => ({ ...s, gapRule: e.target.checked }))}
            />
            {t("gapRule")}
          </label>
        </div>

        {editLayout && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-small">
            <span className="text-muted-foreground">{t("layout.hint")}</span>
            {selRow && selGeom ? (
              <span className="flex items-center gap-1">
                <strong>{t("map.row", { label: selRow.label })}</strong>
                <Button
                  size="icon-sm"
                  aria-label={t("layout.rotateLeft")}
                  onClick={() => setRowGeom(selRow.id, { ...selGeom, angle: selGeom.angle - 5 })}
                >
                  <RotateCcw />
                </Button>
                <Input
                  className="w-20"
                  type="number"
                  aria-label={t("layout.angle")}
                  value={Math.round(selGeom.angle)}
                  onChange={(e) =>
                    setRowGeom(selRow.id, { ...selGeom, angle: Number(e.target.value) || 0 })
                  }
                />
                <span>°</span>
                <Button
                  size="icon-sm"
                  aria-label={t("layout.rotateRight")}
                  onClick={() => setRowGeom(selRow.id, { ...selGeom, angle: selGeom.angle + 5 })}
                >
                  <RotateCw />
                </Button>
                <Button
                  size="sm"
                  onClick={() => setRowGeom(selRow.id, { ...selGeom, angle: selGeom.angle + 90 })}
                >
                  +90°
                </Button>
              </span>
            ) : null}
            <label className="flex items-center gap-2">
              {t("layout.backdrop")}
              <input
                type="file"
                accept="image/*"
                className="max-w-52 text-tiny"
                onChange={(e) => onBackdropFile(e.target.files?.[0])}
              />
            </label>
            {backdrop && (
              <>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input/NativeSelect control */}
                <label className="flex items-center gap-1">
                  {t("layout.backdropWidth")}
                  <Input
                    className="w-20"
                    type="number"
                    value={Math.round(backdrop.widthCm / 100)}
                    onChange={(e) =>
                      setBackdrop({ ...backdrop, widthCm: (Number(e.target.value) || 1) * 100 })
                    }
                  />
                  m
                </label>
                <label className="flex items-center gap-1">
                  {t("layout.opacity")}
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={backdrop.opacity}
                    onChange={(e) => setBackdrop({ ...backdrop, opacity: Number(e.target.value) })}
                  />
                </label>
                <Button size="sm" variant="ghost" onClick={() => setBackdrop(undefined)}>
                  {t("layout.removeBackdrop")}
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                update((s) => {
                  const { [venue.id]: _drop, ...rest } = s.layouts;
                  return { ...s, layouts: rest };
                })
              }
            >
              {t("layout.reset")}
            </Button>
          </div>
        )}

        <div
          role="application"
          aria-label={t("mapRegion")}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the plan is a keyboard widget (arrow keys move the selected stall)
          tabIndex={0}
          onKeyDown={onMapKey}
          aria-describedby="standplan-keys"
          className="relative h-[calc(100dvh-260px)] min-h-[420px] overflow-hidden rounded-xl border bg-card focus-visible:outline-2 focus-visible:outline-ring"
        >
          <PlanMap
            venue={venue}
            layout={layoutRows}
            backdrop={backdrop}
            placements={placements}
            items={items}
            selectedId={selectedId}
            highlightRowLabel={highlight ?? null}
            preview={preview}
            editLayout={editLayout}
            selectedRowId={selectedRowId}
            onSelectPlacement={setSelectedId}
            onSelectRow={setSelectedRowId}
            onStartPlacementDrag={(e, id, grab) => {
              const it = items.get(id);
              if (it) startDrag(e, it, grab);
            }}
            onRowGeom={setRowGeom}
            onBackdrop={setBackdrop}
            svgRef={svgRef}
          />
          <Legend />
        </div>
        <p id="standplan-keys" className="text-faint-foreground text-tiny">
          {t("keysHint")}
        </p>
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
      </section>

      {/* ---------- side panel (event choice on the right, as asked) ---------- */}
      <aside
        className="flex min-h-0 flex-col gap-3"
        aria-label={t("sideRegion")}
        data-drop-unplace="1"
      >
        <div className="rounded-xl border bg-card p-3">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input/NativeSelect control */}
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium">{t("event")}</span>
            <NativeSelect
              value={ev.id}
              onChange={(e) => selectEvent(e.target.value)}
              className="w-full"
              wrapperClassName="w-full"
            >
              {data.events
                .filter((e) => data.venues.some((v) => v.id === e.venueId))
                .map((e) => {
                  const n = [...data.items, ...state.manualItems].filter(
                    (i) => i.eventId === e.id && i.mailId && !declined.has(i.id),
                  ).length;
                  return (
                    <option key={e.id} value={e.id}>
                      {`${formatDateWithWeekday(e.startsOn, locale)} · ${e.name}${n ? ` (${n})` : ""}`}
                    </option>
                  );
                })}
            </NativeSelect>
          </label>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat
              label={t("stats.venue")}
              value={venue.name.split("–").pop()?.trim() ?? venue.name}
            />
            <Stat
              label={t("stats.occupied")}
              value={`${Math.round((used / Math.max(capacity, 1)) * 100)} %`}
              sub={`${formatLength(used, locale)} / ${formatLength(capacity, locale)}`}
            />
            <Stat
              label={t("stats.price")}
              value={`${formatMoney(ev.pricePerMCents, locale)}/m`}
              sub={t("stats.fee", { fee: formatMoney(ev.bookingFeeCents, locale) })}
            />
          </dl>
        </div>

        <VersionsCard
          versions={versions}
          activeId={activeVersionId}
          unsaved={unsaved}
          proposalCount={proposals.length}
          canWrite={canWrite}
          onSave={saveVersion}
          onLoad={loadVersion}
          onRename={renameVersion}
          onDelete={deleteVersion}
        />

        {selItem ? (
          <DetailCard
            item={selItem}
            ev={ev}
            placement={selPlacement}
            row={selPlacement ? rowsById.get(selPlacement.rowId) : undefined}
            rows={rows}
            canWrite={canWrite}
            onClose={() => setSelectedId(null)}
            onPlace={(rowId, wanted) => placeItem(selItem, rowId, wanted)}
            onUnplace={() => unplace(selItem.id)}
            onConfirm={() => confirm(selItem.id)}
            onDecline={() => decline(selItem.id)}
            sent={state.sent.find((m) => m.itemId === selItem.id)}
            blocked={selPlacement ? undefined : blockedById.get(selItem.id)}
            vendorStatus={vendorStatus(selItem)}
            reasonForRow={(r) => {
              const reason = reasonOnRow(selItem, r);
              return reason ? why.one(reason) : null;
            }}
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card">
          <div role="tablist" aria-label={t("tabs.label")} className="flex gap-1 border-b p-2">
            {(
              [
                ["open", openItems.length],
                ["placed", placements.length],
                ["declined", declinedItems.length],
              ] as const
            ).map(([key, n]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-small",
                  tab === key ? "bg-selected font-semibold" : "hover:bg-hover",
                )}
              >
                {t(`tabs.${key}`)} <span className="text-muted-foreground">{n}</span>
              </button>
            ))}
          </div>
          <ul className="flex max-h-[calc(100dvh-420px)] min-h-40 flex-col gap-2 overflow-y-auto p-2">
            {tab === "open" &&
              (openItems.length === 0 ? (
                <li className="p-4 text-center text-muted-foreground text-small">
                  {t("emptyOpen")}
                </li>
              ) : (
                openItems.map((i) => (
                  <RequestCard
                    key={i.id}
                    item={i}
                    selected={selectedId === i.id}
                    canWrite={canWrite}
                    dragging={drag?.itemId === i.id && drag.active}
                    blocked={blockedById.get(i.id)}
                    vendorStatus={vendorStatus(i)}
                    onPointerDown={(e) => startDrag(e, i, i.lengthCm / 2)}
                    onSelect={() => setSelectedId(i.id)}
                    onHover={(h) => setHoverId(h ? i.id : null)}
                  />
                ))
              ))}
            {tab === "placed" &&
              [...placements]
                .sort(
                  (a, b) =>
                    (rowsById.get(a.rowId)?.label ?? "").localeCompare(
                      rowsById.get(b.rowId)?.label ?? "",
                    ) || a.startCm - b.startCm,
                )
                .map((p) => {
                  const i = items.get(p.itemId);
                  const row = rowsById.get(p.rowId);
                  if (!i || !row) return null;
                  return (
                    <li key={p.itemId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(i.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-small hover:bg-hover",
                          selectedId === i.id && "bg-selected",
                        )}
                      >
                        <span className="w-14 font-semibold tabular-nums">
                          {stallNumber(row.label, p.startCm)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {i.companyName ?? i.vendorName}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatLength(p.endCm - p.startCm, locale)}
                        </span>
                        {p.status === "proposed" ? (
                          <StatusBadge tone="warn" icon={CircleDashed}>
                            {t("status.proposed")}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="ok" icon={Check}>
                            {t("status.assigned")}
                          </StatusBadge>
                        )}
                      </button>
                    </li>
                  );
                })}
            {tab === "declined" &&
              declinedItems.map((i) => (
                <li key={i.id} className="flex items-center gap-2 px-2 py-1.5 text-small">
                  <span className="min-w-0 flex-1 truncate">{i.vendorName}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      update((s) => ({ ...s, declined: s.declined.filter((d) => d !== i.id) }))
                    }
                  >
                    {t("restore")}
                  </Button>
                </li>
              ))}
          </ul>
          <div className="border-t p-2 text-right">
            <Button size="sm" variant="ghost" onClick={reset}>
              {t("resetDemo")}
            </Button>
          </div>
        </div>
      </aside>

      {drag?.active && (
        <div
          className="pointer-events-none fixed z-[70] rounded-md border border-primary bg-card px-2 py-1 font-medium text-small shadow-lg"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {drag.label} · {formatLength(drag.lengthCm, locale)}
          {preview && !preview.ok
            ? ` · ${preview.reason ? t("why.ghost", { why: preview.reason }) : t("noRoomShort")}`
            : ""}
        </div>
      )}

      <PrintSheet
        ev={ev}
        venueName={venue.name}
        locale={locale}
        planNode={
          <PlanMap
            venue={venue}
            layout={layoutRows}
            backdrop={backdrop}
            placements={placements}
            items={items}
            selectedId={null}
            highlightRowLabel={null}
            preview={null}
            editLayout={false}
            selectedRowId={null}
            printMode
          />
        }
        rows={rows}
        placements={placements}
        items={items}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------

const toPlacement = (p: StoredPlacement): Placement => ({
  id: p.itemId,
  rowId: p.rowId,
  startCm: p.startCm,
  endCm: p.endCm,
  car: p.car,
});

function placementsFor(s: StandplanState, data: StandplanData, eventId: string): StoredPlacement[] {
  return (
    s.placements[eventId] ??
    (data.existing[eventId] ?? []).map((p) => ({ ...p, status: "assigned" as const }))
  );
}

/** Puts the item at (row, start); a moved stall needs a new confirmation, so it becomes "proposed". */
function upsert(list: StoredPlacement[], item: BookingItem, rowId: string, startCm: number) {
  const next: StoredPlacement = {
    itemId: item.id,
    rowId,
    startCm,
    endCm: startCm + item.lengthCm,
    car: item.carRequested,
    status: "proposed",
  };
  return [...list.filter((p) => p.itemId !== item.id), next];
}

function VersionsCard({
  versions,
  activeId,
  unsaved,
  proposalCount,
  canWrite,
  onSave,
  onLoad,
  onRename,
  onDelete,
}: {
  versions: PlanVersion[];
  activeId: string | undefined;
  unsaved: boolean;
  proposalCount: number;
  canWrite: boolean;
  onSave: (name?: string) => void;
  onLoad: (v: PlanVersion) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (v: PlanVersion) => void;
}) {
  const t = useTranslations("standplan.versions");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const active = versions.find((v) => v.id === activeId);
  return (
    <div className="rounded-xl border bg-card p-3 text-small">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="font-semibold">{t("title")}</span>
          <span className="text-muted-foreground">{versions.length}</span>
          <span className="min-w-0 truncate text-muted-foreground text-tiny">
            {active ? t("current", { name: active.name }) : ""}
          </span>
        </button>
        {unsaved ? (
          <StatusBadge tone="warn" icon={CircleDashed}>
            {t("unsaved")}
          </StatusBadge>
        ) : active ? (
          <StatusBadge tone="ok" icon={Check}>
            {t("saved")}
          </StatusBadge>
        ) : null}
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {canWrite && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onSave(name);
                setName("");
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                aria-label={t("name")}
                className="flex-1"
              />
              <Button type="submit" size="sm" disabled={proposalCount === 0}>
                <Save />
                {t("saveShort")}
              </Button>
            </form>
          )}
          <p className="text-faint-foreground text-tiny">{t("hint")}</p>
          {versions.length === 0 ? (
            <p className="text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1",
                    v.id === activeId && "bg-selected",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    {canWrite ? (
                      <input
                        defaultValue={v.name}
                        aria-label={t("name")}
                        onBlur={(e) => onRename(v.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className="w-full truncate rounded bg-transparent font-medium outline-none focus:bg-card focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      <span className="font-medium">{v.name}</span>
                    )}
                    <span className="block text-faint-foreground text-tiny">
                      {t("meta", {
                        count: v.placements.length,
                        date: new Date(v.savedAt).toLocaleString(
                          locale === "de" ? "de-DE" : "en-GB",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        ),
                      })}
                    </span>
                  </div>
                  {canWrite && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => onLoad(v)}>
                        {t("load")}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("delete", { name: v.name })}
                        onClick={() => onDelete(v)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-sunken px-2 py-1.5">
      <dt className="text-faint-foreground text-tiny">{label}</dt>
      <dd className="truncate font-semibold text-small">{value}</dd>
      {sub && <dd className="truncate text-faint-foreground text-tiny">{sub}</dd>}
    </div>
  );
}

function Legend() {
  const t = useTranslations("standplan.legend");
  const sw = (bg: string, border: string, dashed?: boolean) => (
    <span
      className="inline-block h-3 w-5 rounded-sm"
      style={{
        background: `var(${bg})`,
        border: `2px ${dashed ? "dashed" : "solid"} var(${border})`,
      }}
    />
  );
  return (
    <div className="absolute top-3 left-3 flex flex-wrap gap-3 rounded-lg border bg-card/95 px-3 py-1.5 text-tiny shadow-sm">
      <span className="flex items-center gap-1.5">
        {sw("--status-neutral-bg", "--status-neutral-dot")} {t("existing")}
      </span>
      <span className="flex items-center gap-1.5">
        {sw("--status-ok-bg", "--status-ok-dot")} {t("confirmed")}
      </span>
      <span className="flex items-center gap-1.5">
        {sw("--status-warn-bg", "--status-warn-dot", true)} {t("proposed")}
      </span>
      <span className="flex items-center gap-1.5">
        {sw("--accent-soft", "--primary", true)} {t("preferred")}
      </span>
      <span>▣ {t("car")}</span>
    </div>
  );
}

function RequestCard({
  item,
  selected,
  canWrite,
  dragging,
  onPointerDown,
  onSelect,
  onHover,
  blocked,
  vendorStatus,
}: {
  item: BookingItem;
  selected: boolean;
  canWrite: boolean;
  dragging: boolean;
  blocked?: { reason: NoFitReason; rowLabels: string[] }[];
  onPointerDown: (e: React.PointerEvent) => void;
  onSelect: () => void;
  onHover: (h: boolean) => void;
  vendorStatus: "known" | "registered" | "new";
}) {
  const t = useTranslations("standplan");
  const locale = useLocale();
  const why = useWhy();
  return (
    <li
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "flex gap-2 rounded-lg border bg-card p-2 text-small transition-opacity",
        selected && "border-primary bg-selected",
        dragging && "opacity-40",
      )}
    >
      {canWrite && (
        <span
          onPointerDown={onPointerDown}
          className="mt-0.5 flex cursor-grab touch-none items-start text-faint-foreground active:cursor-grabbing"
          aria-hidden
        >
          <GripVertical className="size-4" />
        </span>
      )}
      <button
        type="button"
        onClick={onSelect}
        onPointerDown={canWrite ? onPointerDown : undefined}
        className="min-w-0 flex-1 cursor-grab text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{item.companyName ?? item.vendorName}</span>
          <span className="ml-auto shrink-0 tabular-nums">
            {formatLength(item.lengthCm, locale)}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-tiny">
          {item.carRequested && (
            <span className="inline-flex items-center gap-0.5">
              <Car className="size-3" />
              {t("car")}
            </span>
          )}
          {item.power && (
            <span className="inline-flex items-center gap-0.5">
              <Zap className="size-3" />
              {t("power")}
            </span>
          )}
          {item.preferredRowLabel && (
            <span className="inline-flex items-center gap-0.5 rounded bg-accent-soft px-1 text-accent-soft-foreground">
              <MapPinned className="size-3" />
              {item.preferredRaw}
            </span>
          )}
          {vendorStatus !== "known" && <VendorBadge status={vendorStatus} />}
          {item.kind === "commercial" && <span>{t("commercial")}</span>}
          {item.categories.length > 0 && (
            <span className="truncate">{item.categories.join(", ")}</span>
          )}
        </span>
        {blocked && (
          <span className="mt-1 flex flex-col gap-0.5 rounded-md bg-status-critical-bg px-1.5 py-1 text-status-critical text-tiny">
            <span className="flex items-center gap-1 font-semibold">
              <CircleAlert className="size-3 shrink-0" />
              {t("why.badge")}
            </span>
            {blocked.slice(0, 2).map((g) => (
              <span key={g.reason.kind}>{why.line(g)}</span>
            ))}
          </span>
        )}
        {item.note && (
          <span className="mt-1 flex items-start gap-1 text-tiny">
            <StickyNote className="mt-0.5 size-3 shrink-0 text-status-warn" />
            <span className="line-clamp-2">{item.note}</span>
          </span>
        )}
      </button>
    </li>
  );
}

function DetailCard({
  item,
  ev,
  placement,
  row,
  rows,
  canWrite,
  onClose,
  onPlace,
  onUnplace,
  onConfirm,
  onDecline,
  sent,
  blocked,
  reasonForRow,
  vendorStatus,
}: {
  item: BookingItem;
  ev: PlanEvent;
  placement?: StoredPlacement;
  row?: PlanRow;
  rows: PlanRow[];
  canWrite: boolean;
  onClose: () => void;
  onPlace: (rowId: string, wantedCm: number) => void;
  onUnplace: () => void;
  onConfirm: () => void;
  onDecline: () => void;
  sent?: SentMail;
  blocked?: { reason: NoFitReason; rowLabels: string[] }[];
  reasonForRow: (row: PlanRow) => string | null;
  vendorStatus: "known" | "registered" | "new";
}) {
  const t = useTranslations("standplan");
  const locale = useLocale();
  const why = useWhy();
  const quote = quoteStall({
    lengthCm: item.lengthCm,
    pricePerMCents: ev.pricePerMCents,
    bookingFeeCents: ev.bookingFeeCents,
  });
  return (
    <div className="rounded-xl border bg-card p-3 text-small">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.companyName ?? item.vendorName}</p>
          {item.companyName && <p className="text-muted-foreground text-tiny">{item.vendorName}</p>}
          <p className="text-muted-foreground text-tiny">
            {item.email}
            {item.phone ? ` · ${item.phone}` : ""}
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={t("close")} onClick={onClose}>
          <X />
        </Button>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{t("vendor.label")}</dt>
        <dd>
          <VendorBadge status={vendorStatus} />
        </dd>
        <dt className="text-muted-foreground">{t("detail.length")}</dt>
        <dd>{formatLength(item.lengthCm, locale)}</dd>
        <dt className="text-muted-foreground">{t("detail.car")}</dt>
        <dd>
          {item.carRequested
            ? t("detail.carYes", { length: formatLength(item.carLengthCm ?? 500, locale) })
            : t("no")}
        </dd>
        <dt className="text-muted-foreground">{t("detail.power")}</dt>
        <dd>{item.power ? t("yes") : t("no")}</dd>
        {item.preferredRaw && (
          <>
            <dt className="text-muted-foreground">{t("detail.preferred")}</dt>
            <dd>{item.preferredRaw}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("detail.price")}</dt>
        <dd>
          {formatMoney(quote.totalCents, locale)}{" "}
          <span className="text-faint-foreground text-tiny">
            ({formatLength(quote.billedCm, locale)} × {formatMoney(ev.pricePerMCents, locale)} +{" "}
            {formatMoney(quote.feeCents, locale)})
          </span>
        </dd>
        <dt className="text-muted-foreground">{t("detail.stall")}</dt>
        <dd>
          {placement && row ? (
            <>
              <strong>{stallNumber(row.label, placement.startCm)}</strong>{" "}
              <span className="text-muted-foreground">
                {t("detail.range", {
                  row: row.label,
                  from: formatLength(placement.startCm, locale),
                  to: formatLength(placement.endCm, locale),
                })}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{t("detail.unplaced")}</span>
          )}
        </dd>
      </dl>
      {blocked && (
        <div
          role="status"
          className="mt-2 rounded-md bg-status-critical-bg p-2 text-status-critical"
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <CircleAlert className="size-4 shrink-0" />
            {t("why.title")}
          </p>
          <ul className="mt-1 list-disc pl-5 text-tiny">
            {blocked.map((g) => (
              <li key={g.reason.kind}>{why.line(g)}</li>
            ))}
          </ul>
          {why.hint(blocked) && <p className="mt-1 text-tiny">{why.hint(blocked)}</p>}
        </div>
      )}
      {item.note && (
        <p className="mt-2 flex gap-1.5 rounded-md bg-status-warn-bg p-2 text-status-warn">
          <StickyNote className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{item.note}</span>
        </p>
      )}
      {sent && (
        <p className="mt-2 flex items-center gap-1.5 text-status-ok text-tiny">
          <Mail className="size-3.5" />
          {t("detail.sent", {
            date: new Date(sent.sentAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB"),
          })}
        </p>
      )}
      {canWrite && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* The click path for every drag (UX concept): choose a row, the stall goes to the nearest free spot. */}
          <NativeSelect
            aria-label={t("detail.placeIn")}
            value=""
            onChange={(e) => {
              const r = rows.find((x) => x.id === e.target.value);
              if (!r) return;
              onPlace(r.id, r.label === item.preferredRowLabel ? (item.preferredOffsetCm ?? 0) : 0);
            }}
            className="h-8 text-small"
          >
            <option value="">{placement ? t("detail.moveTo") : t("detail.placeIn")}</option>
            {rows.map((r) => {
              // A row that can't take this stall stays visible but disabled, with the reason.
              const reason = placement?.rowId === r.id ? null : reasonForRow(r);
              return (
                <option key={r.id} value={r.id} disabled={Boolean(reason)}>
                  {t("map.row", { label: r.label })} · {formatLength(r.lengthCm, locale)}
                  {r.carAllowed ? ` · ${t("car")}` : ""}
                  {r.label === item.preferredRowLabel ? ` ★` : ""}
                  {reason ? ` – ${t("why.option", { why: reason })}` : ""}
                </option>
              );
            })}
          </NativeSelect>
          {placement?.status === "proposed" && (
            <Button size="sm" variant="default" onClick={onConfirm}>
              <Mail />
              {t("detail.confirm")}
            </Button>
          )}
          {placement && (
            <Button size="sm" onClick={onUnplace}>
              <Trash2 />
              {t("detail.unplace")}
            </Button>
          )}
          {!placement && item.mailId && (
            <Button size="sm" variant="ghost" onClick={onDecline}>
              {t("detail.decline")}
            </Button>
          )}
          {item.mailId && (
            <Link
              className="ml-auto text-accent-soft-foreground text-tiny underline-offset-4 hover:underline"
              href={
                `/postfach?konv=${item.mailId.startsWith("c-") ? item.mailId : `c-${item.mailId}`}` as Route
              }
            >
              {t("detail.original")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Print-only: the whole plan on one page plus the stall list for the crew (Platzanweiser). */
function PrintSheet({
  ev,
  venueName,
  locale,
  planNode,
  rows,
  placements,
  items,
}: {
  ev: PlanEvent;
  venueName: string;
  locale: string;
  planNode: React.ReactNode;
  rows: PlanRow[];
  placements: StoredPlacement[];
  items: Map<string, BookingItem>;
}) {
  const t = useTranslations("standplan.printSheet");
  const sorted = [...placements].sort((a, b) => {
    const ra = rows.findIndex((r) => r.id === a.rowId);
    const rb = rows.findIndex((r) => r.id === b.rowId);
    return ra - rb || a.startCm - b.startCm;
  });
  return (
    <div className="print-sheet hidden print:block">
      <h1 className="font-semibold text-lg">
        {ev.name} · {formatDateWithWeekday(ev.startsOn, locale)}
      </h1>
      <p className="text-small">{venueName}</p>
      <div className="mt-2 h-[170mm] w-full border">{planNode}</div>
      <table className="mt-4 w-full border-collapse text-[9pt]" style={{ breakBefore: "page" }}>
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">{t("stall")}</th>
            <th>{t("vendor")}</th>
            <th>{t("range")}</th>
            <th>{t("length")}</th>
            <th>{t("car")}</th>
            <th>{t("status")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const row = rows.find((r) => r.id === p.rowId);
            const i = items.get(p.itemId);
            if (!row || !i) return null;
            return (
              <tr key={p.itemId} className="border-b">
                <td className="py-0.5 font-semibold">{stallNumber(row.label, p.startCm)}</td>
                <td>{i.companyName ?? i.vendorName}</td>
                <td>
                  {row.label} {formatLength(p.startCm, locale)}–{formatLength(p.endCm, locale)}
                </td>
                <td>{formatLength(p.endCm - p.startCm, locale)}</td>
                <td>{p.car ? "✓" : ""}</td>
                <td>{p.status === "proposed" ? t("proposed") : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[8pt]">
        {t("rows")}:{" "}
        {rows
          .map(
            (r) =>
              `${r.label} ${Math.round(
                rowUtilisation(
                  r,
                  placements.map((p) => ({ ...p, id: p.itemId })),
                ) * 100,
              )} %`,
          )
          .join(" · ")}
      </p>
    </div>
  );
}

/** Whether the requester is in the vendor list yet (new people only get in once a stall is confirmed). */
function VendorBadge({ status }: { status: "known" | "registered" | "new" }) {
  const t = useTranslations("standplan.vendor");
  const tone =
    status === "known"
      ? "bg-status-ok-bg text-status-ok"
      : status === "registered"
        ? "bg-status-info-bg text-status-info"
        : "bg-status-neutral-bg text-status-neutral";
  return (
    <span
      title={t(`${status}Hint`)}
      className={cn("inline-flex items-center gap-0.5 rounded px-1 font-medium text-tiny", tone)}
    >
      {status === "known" ? <UserCheck className="size-3" /> : <UserPlus className="size-3" />}
      {t(status)}
    </span>
  );
}
