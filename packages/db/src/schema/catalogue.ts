import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";

export type EventTypeRules = {
  newGoodsMaxShare: number;
  bannedGoods: string[];
  onlineBookingAllowed: boolean;
  defaultPricePerMCents: number | null;
  defaultBookingFeeCents: number | null;
  vendorContractModel: "per_event" | "yearly_contract";
};

/** Flohmarkt, Antikmarkt, Stadtfest, Food & Wine (ADR 0010). New formats are added as data. */
export const eventType = app.table("event_type", {
  id: id(),
  key: text().notNull().unique(),
  nameDe: text().notNull(),
  nameEn: text().notNull(),
  rules: jsonb().$type<EventTypeRules>().notNull(),
  sort: integer().notNull().default(0),
  ...timestamps,
  archivedAt: archivedAt(),
});

export const contactKind = app.enum("contact_kind", [
  "authority",
  "landowner",
  "supplier",
  "service",
  "other",
]);

/** Outside organisations and people: authorities, landowners, suppliers (e.g. the stall supplier). */
export const contact = app.table(
  "contact",
  {
    id: id(),
    kind: contactKind().notNull(),
    name: text().notNull(),
    contactPerson: text(),
    email: text(),
    phoneE164: text("phone_e164"),
    street: text(),
    postalCode: text(),
    city: text(),
    notes: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [index().on(t.kind)],
);

export const venueKind = app.enum("venue_kind", ["outdoor_public", "outdoor_private", "indoor"]);

/** A location ("Ort"). */
export const venue = app.table("venue", {
  id: id(),
  name: text().notNull(),
  kind: venueKind().notNull(),
  street: text(),
  postalCode: text(),
  city: text().notNull(),
  bundesland: text().notNull().default("NW"),
  lat: doublePrecision(),
  lng: doublePrecision(),
  /** Total stall frontage in centimetres. */
  capacityCm: integer(),
  accessInfo: text(),
  landownerContactId: uuid().references(() => contact.id, { onDelete: "set null" }),
  customFields: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
  archivedAt: archivedAt(),
});

export const zone = app.table(
  "zone",
  {
    id: id(),
    venueId: uuid()
      .notNull()
      .references(() => venue.id, { onDelete: "cascade" }),
    name: text().notNull(),
    sort: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.venueId)],
);

/** A row of stalls within a zone. Lengths in centimetres. Matters for allocation from M9. */
export const venueRow = app.table(
  "row",
  {
    id: id(),
    zoneId: uuid()
      .notNull()
      .references(() => zone.id, { onDelete: "cascade" }),
    label: text().notNull(),
    lengthCm: integer().notNull(),
    depthCm: integer().notNull(),
    carAllowed: boolean().notNull().default(false),
    carSlots: integer().notNull().default(0),
    power: boolean().notNull().default(false),
    water: boolean().notNull().default(false),
    sort: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.zoneId)],
);

/** Multi-year agreement for a location: dates fixed at signing. Generates events; doesn't replace permits. */
export const locationAgreement = app.table(
  "location_agreement",
  {
    id: id(),
    venueId: uuid()
      .notNull()
      .references(() => venue.id, { onDelete: "restrict" }),
    counterpartyContactId: uuid().references(() => contact.id, { onDelete: "set null" }),
    validFrom: date().notNull(),
    validUntil: date().notNull(),
    fixedDates: date().array().notNull().default([]),
    terms: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [index().on(t.venueId)],
);
