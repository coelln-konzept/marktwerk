/**
 * Shapes shared by the Postfach / Standplan prototype (server loader → client views). Prototype only:
 * nothing here is persisted in Postgres yet; placements and sent mails live in the browser
 * (see `use-standplan-store.ts`). The target tables are sketched in docs/architecture/data-model.md
 * ("Phase 2 sketch": booking_request, booking_date, email_message, venue_layout).
 */
import type { ParseIssue, StallRequest } from "@marktwerk/core";

export interface PlanRow {
  id: string;
  zoneId: string;
  label: string;
  lengthCm: number;
  depthCm: number;
  carAllowed: boolean;
  carSlots: number;
  power: boolean;
}

export interface PlanZone {
  id: string;
  name: string;
  rows: PlanRow[];
}

export interface PlanVenue {
  id: string;
  name: string;
  zones: PlanZone[];
}

export interface PlanEvent {
  id: string;
  name: string;
  startsOn: string;
  venueId: string;
  venueName: string;
  pricePerMCents: number;
  bookingFeeCents: number;
  times: { setup?: string; open?: string; close?: string };
}

export interface InboxMail {
  id: string;
  /** RFC Message-ID; with the form's Anfrage-ID the idempotency key. */
  messageId: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  body: string;
  /** Result of the deterministic parser, computed on the server. */
  parse:
    | { kind: "not_a_request" }
    | { kind: "request"; ok: true; request: StallRequest; warnings: ParseIssue[] }
    | {
        kind: "request";
        ok: false;
        partial: Partial<StallRequest>;
        errors: ParseIssue[];
        warnings: ParseIssue[];
      };
}

/** One request for one event date (a mail with three dates becomes three of these). */
export interface BookingItem {
  /** `<mailId>:<eventId>` for mail requests, `bestand:<n>` for existing bookings. */
  id: string;
  mailId: string | null;
  eventId: string;
  vendorName: string;
  companyName: string | null;
  email: string;
  phone: string | null;
  kind: "private" | "commercial";
  lengthCm: number;
  carRequested: boolean;
  carLengthCm: number | null;
  power: boolean;
  categories: string[];
  preferredRowLabel: string | null;
  preferredOffsetCm: number | null;
  preferredRaw: string | null;
  note: string | null;
  receivedAt: string;
  requestRef: string;
}

/** An already confirmed booking from before (old website / phone), so the plan isn't empty. */
export interface ExistingPlacement {
  itemId: string;
  rowId: string;
  startCm: number;
  endCm: number;
  car: boolean;
}

export interface StandplanData {
  events: PlanEvent[];
  venues: PlanVenue[];
  items: BookingItem[];
  existing: Record<string, ExistingPlacement[]>;
  /** Mails whose request names an event/date we don't have. */
  unmatched: { mailId: string; eventName: string; date: string }[];
}
