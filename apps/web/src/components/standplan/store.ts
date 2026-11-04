"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { BookingItem } from "./types";

/**
 * PROTOTYPE store: placements, row layout and "sent" confirmations live in localStorage, shared by
 * /standplan and /postfach (and across tabs). Replaces what will be `booking_date` (row_id, start_cm,
 * end_cm, placement status), `venue_layout` and `outbound_message` rows in the real build.
 */

export type PlacementStatus = "proposed" | "assigned";

export interface StoredPlacement {
  itemId: string;
  rowId: string;
  startCm: number;
  endCm: number;
  car: boolean;
  status: PlacementStatus;
}

export interface SentMail {
  id: string;
  itemId: string;
  eventId: string;
  toName: string;
  toAddress: string;
  subject: string;
  body: string;
  sentAt: string;
}

/** Row position on the plan, in centimetres (start point of the row and its angle in degrees). */
export interface RowGeom {
  x: number;
  y: number;
  angle: number;
}

export interface Backdrop {
  src: string;
  x: number;
  y: number;
  widthCm: number;
  opacity: number;
}

export interface VenueLayout {
  rows: Record<string, RowGeom>;
  backdrop?: Backdrop;
}

/**
 * A saved draft of an event's plan (Entwurf / Version): several arrangements can be tried and compared
 * before anything is confirmed. Saving never sends mail; only "Bestätigen" does.
 */
export interface PlanVersion {
  id: string;
  name: string;
  savedAt: string;
  placements: StoredPlacement[];
}

export interface StandplanState {
  v: 1;
  /** Per event; missing = not touched yet (the existing bookings are used). */
  placements: Record<string, StoredPlacement[]>;
  declined: string[];
  sent: SentMail[];
  layouts: Record<string, VenueLayout>;
  gapRule: boolean;
  /** Saved drafts per event, newest first. */
  versions: Record<string, PlanVersion[]>;
  /** The version last saved or loaded per event (to show "unsaved changes"). */
  activeVersion: Record<string, string>;
  /** Stall requests entered by hand from a Postfach conversation (free-text mails). */
  manualItems: BookingItem[];
}

const KEY = "marktwerk.standplan-prototype.v1";
const EMPTY: StandplanState = {
  v: 1,
  placements: {},
  declined: [],
  sent: [],
  layouts: {},
  gapRule: true,
  versions: {},
  activeVersion: {},
  manualItems: [],
};

let cache: StandplanState | null = null;
const listeners = new Set<() => void>();

function read(): StandplanState {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as StandplanState) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: StandplanState) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota (large backdrop image) or private mode: keep in memory
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Direct access for the Postfach prototype (manual stall requests). */
export function updateStandplanState(fn: (s: StandplanState) => StandplanState) {
  write(fn(read()));
}

export function useStandplanStore() {
  const state = useSyncExternalStore(subscribe, read, () => EMPTY);
  const update = useCallback((fn: (s: StandplanState) => StandplanState) => write(fn(read())), []);
  const reset = useCallback(() => write(EMPTY), []);
  return { state, update, reset };
}
