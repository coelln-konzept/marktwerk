import type { EventStatus } from "@/lib/status";

/**
 * The URL word of the Kalender event popover (UT2-08): `?vorschau=veranstaltung:<id>` opens it, like
 * `?vorschau=besprechung:<id>` opens a Besprechung. Producers and parsers all use these.
 */
export const EVENT_VORSCHAU_PREFIX = "veranstaltung:";

/** The `vorschau` value that opens one event's popover. */
export function eventVorschauValue(id: string): string {
  return `${EVENT_VORSCHAU_PREFIX}${id}`;
}

/** `vorschau=veranstaltung:<id>`: the event id, or null for any other value. */
export function eventVorschauId(value: string | undefined | null): string | null {
  return value?.startsWith(EVENT_VORSCHAU_PREFIX)
    ? value.slice(EVENT_VORSCHAU_PREFIX.length) || null
    : null;
}

/** What the Kalender popover shows of one event; built by the page from the rows it already loaded. */
export type EventPreview = {
  id: string;
  name: string;
  typeKey: string;
  typeName: string;
  status: EventStatus;
  startsOn: string;
  endsOn: string;
  venueName: string;
  /** Wall-clock times of an event day, "HH:mm". */
  times: { setup: string; open: string; close: string; teardown: string };
  /** Open tasks the person can see, and how many of them are overdue. */
  tasks: { open: number; overdue: number };
};
