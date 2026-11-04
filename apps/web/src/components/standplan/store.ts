"use client";

import { DEFAULT_PAYMENT_RULES } from "@marktwerk/core";
import { useCallback, useSyncExternalStore } from "react";
import { todayIn } from "@/lib/format";
import type { BookingItem } from "./types";

/**
 * PROTOTYPE store: placements, row layout and "sent" confirmations live in localStorage, shared by
 * /standplan and /postfach (and across tabs). Replaces what will be `booking_date` (row_id, start_cm,
 * end_cm, placement status), `venue_layout` and `outbound_message` rows in the real build.
 */

/**
 * Two-step booking (spec 2026-11-04): Entwurf (`proposed`) → Platzkarte sent = Reserviert (`reserved`,
 * waits for the transfer) → marked paid = Fest (`fixed`). Existing bookings from before are `fixed`.
 */
export type PlacementStatus = "proposed" | "reserved" | "fixed";

/**
 * What the Platzkarte promised. The vendor/event snapshot lets the reminder and release run on any
 * page (Standplan or Postfach) without the server's demo data.
 */
export interface Reservation {
  reservedOn: string;
  dueOn: string;
  reminderOn: string | null;
  reference: string;
  amountCents: number;
  stallNumber: string;
  remindedOn?: string;
  paidOn?: string;
  vendorName: string;
  email: string;
  conversationId: string | null;
  eventName: string;
  eventDate: string;
}

export interface StoredPlacement {
  itemId: string;
  rowId: string;
  startCm: number;
  endCm: number;
  car: boolean;
  status: PlacementStatus;
  reservation?: Reservation;
  /** Derived from a Festplatz (not stored per date; see `fixedSpots`). */
  festplatzId?: string;
}

/**
 * Festplatzbuchung: one vendor holds one stall at a market for a whole year (every event with the same
 * name and venue in `year`). Placements per date are derived when the plan is shown; `optedOut` lists
 * the dates the vendor skips. Payment is open (client decides; spec 2026-11-04 manual/Festplatz).
 */
export interface FixedSpot {
  id: string;
  vendorName: string;
  companyName: string | null;
  email: string;
  phone: string | null;
  kind: "private" | "commercial";
  seriesName: string;
  venueId: string;
  year: number;
  rowId: string;
  startCm: number;
  lengthCm: number;
  car: boolean;
  power: boolean;
  optedOut: string[];
  sourceItemId: string;
  sourceEventId: string;
  createdOn: string;
}

/** A reservation that lapsed (unpaid) or was released by hand; the request is open again. */
export interface ReleasedRecord {
  itemId: string;
  eventId: string;
  stallNumber: string;
  reference: string;
  releasedOn: string;
  reason: "unpaid" | "manual";
}

/** Einstellungen → Buchungen. Bank values are placeholders; the real ones are entered by the company. */
export interface BookingSettings {
  paymentDays: number;
  reminderDaysBefore: number;
  payee: string;
  bank: string;
  iban: string;
  bic: string;
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  ...DEFAULT_PAYMENT_RULES,
  payee: "Coelln Konzept (Demo)",
  bank: "Demo-Bank Köln",
  iban: "DE00 0000 0000 0000 0000 00",
  bic: "DEMODEXXXXX",
};

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
  released: ReleasedRecord[];
  fixedSpots: FixedSpot[];
  bookingSettings: BookingSettings;
  /** PROTOTYPE clock ("Datum vorspulen"): days added to today to test reminder and release. */
  clockOffsetDays: number;
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
  released: [],
  fixedSpots: [],
  bookingSettings: DEFAULT_BOOKING_SETTINGS,
  clockOffsetDays: 0,
};

/** Today in Berlin, moved by the prototype clock. */
export function prototypeToday(s: Pick<StandplanState, "clockOffsetDays">): string {
  const d = new Date(`${todayIn()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (s.clockOffsetDays ?? 0));
  return d.toISOString().slice(0, 10);
}

/** Before the two-step booking, a confirmed stall was "assigned"; read it as fixed. */
function migrate(s: StandplanState): StandplanState {
  const placements: StandplanState["placements"] = {};
  for (const [eventId, list] of Object.entries(s.placements)) {
    placements[eventId] = list.map((p) =>
      (p.status as string) === "assigned" ? { ...p, status: "fixed" as const } : p,
    );
  }
  return {
    ...s,
    placements,
    bookingSettings: { ...DEFAULT_BOOKING_SETTINGS, ...s.bookingSettings },
  };
}

let cache: StandplanState | null = null;
const listeners = new Set<() => void>();

function read(): StandplanState {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? migrate({ ...EMPTY, ...(JSON.parse(raw) as StandplanState) }) : EMPTY;
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

export function readStandplanState(): StandplanState {
  return read();
}

/** Direct access for the Postfach prototype (manual stall requests) and the reservation sweep. */
export function updateStandplanState(fn: (s: StandplanState) => StandplanState) {
  write(fn(read()));
}

export function useStandplanStore() {
  const state = useSyncExternalStore(subscribe, read, () => EMPTY);
  const update = useCallback((fn: (s: StandplanState) => StandplanState) => write(fn(read())), []);
  const reset = useCallback(() => write(EMPTY), []);
  return { state, update, reset };
}
