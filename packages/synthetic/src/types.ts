import type { MarketColor, ScheduleRow } from "@marktwerk/core";

export type { ScheduleRow } from "@marktwerk/core";

/**
 * Entity types for the synthetic dataset. They mirror docs/architecture/data-model.md (v0.3) with
 * camelCase fields. Conventions: money in integer cents (`...Cents`), lengths in integer centimetres
 * (`...Cm`), business dates as "YYYY-MM-DD", times as "HH:mm" (Europe/Berlin), instants as UTC ISO strings.
 */

export type DateString = string;
export type TimeString = string;
export type Instant = string;

export type EventTypeKey = "flea" | "antique" | "city_festival" | "food_wine";
/** "Städtisch" / "Privat" (UT2-03). */
export type VenueKind = "municipal" | "private";
export type ContactKind = "authority" | "landowner" | "supplier" | "service" | "other";
export type DutyRoleKey =
  | "market_lead"
  | "setup_crew"
  | "office"
  | "permits"
  | "communication"
  | "cash"
  | "water_power"
  | "briefing"
  | "steward"
  | "night_watch"
  | "traffic";
export type PermissionRole = "owner" | "manager" | "staff" | "field";
export type EmploymentType =
  | "minijob"
  | "midijob"
  | "student"
  | "part_time"
  | "full_time"
  | "freelance";
/** Named dates of an event (`event_anchor.key`). */
export type EventAnchorKey = "eventDay" | "setupDay" | "teardownDay" | "bookingCutoff";
/** Named dates of a Saison record (`event_season_anchor.key`): the first and the last market day of the season. */
export type SeasonAnchorKey = "seasonStart" | "seasonEnd";
/** What a template item or task hangs on: event anchors for `event` items, season anchors for `season` items. */
export type AnchorKey = EventAnchorKey | SeasonAnchorKey;
/** Saison status (`event_season_status`, research 13 §6.2). */
export type SeasonStatus = "planning" | "dates_set" | "closed";
export type EventStatus =
  | "draft"
  | "planned"
  | "confirmed"
  | "live"
  | "completed"
  | "closed"
  | "cancelled";
export type TaskPhase = "pre" | "live" | "post";
export type TaskCategory =
  | "general"
  | "permits"
  | "logistics"
  | "communication"
  | "office"
  | "finance"
  | "staff";
export type TaskPriority = "low" | "normal" | "high";
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "waiting_external"
  | "blocked"
  | "done"
  | "skipped"
  | "cancelled";
export type EffortFeedback = "as_planned" | "longer" | "shorter";
export type PermitCategory = "city" | "external";
/** The permit types the dataset seeds (research 13 §4). `other` is the Hoffnungsthal Schaustellerliste. */
export type PermitType =
  | "market_permit"
  | "market_fixing"
  | "water"
  | "signage"
  | "no_parking"
  | "traffic_order"
  | "toilets"
  | "landowner_ok"
  | "other";
/** Permit types a template item can apply for: the seeded ones plus those without a seeded permit. */
export type TemplatePermitType = PermitType | "gema" | "safety_concept" | "catering";
export type PermitCadence = "per_event" | "per_season" | "per_year" | "multi_year" | "standing";
export type PermitStatus =
  | "not_started"
  | "preparing"
  | "applied"
  | "granted"
  | "rejected"
  | "not_required"
  | "superseded";
export type PayableScope = "event" | "company" | "vehicle";
export type PayableStatus = "open" | "partially_paid" | "paid" | "overdue";
export type PayableCategory =
  | "location"
  | "permit"
  | "water_power"
  | "toilets"
  | "security"
  | "gema"
  | "vehicle"
  | "insurance";
export type InstallmentStatus = "open" | "partially_paid" | "paid" | "cancelled";
export type ObligationScope = "company" | "vehicle" | "venue";
export type ShiftStatus =
  | "requested"
  | "confirmed"
  | "declined"
  | "worked"
  | "no_show"
  | "cancelled";
export type VendorKind = "private" | "commercial";
export type VendorCategory =
  | "antik"
  | "trödel"
  | "kleidung"
  | "bücher_medien"
  | "haushalt"
  | "kinder"
  | "design_handmade"
  | "food";
export type BookingSource = "legacy_web" | "email" | "phone";
export type BookingRequestStatus =
  | "new"
  | "in_review"
  | "accepted"
  | "waitlisted"
  | "declined"
  | "withdrawn";
export type PaymentStatus = "not_due" | "open" | "partially_paid" | "paid" | "overdue";
export type Attendance = "checked_in" | "no_show";
export type PlacementStatus = "unplaced" | "proposed" | "assigned";

export interface Settings {
  id: string;
  companyName: string;
  legalForm: string;
  street: string;
  postalCode: string;
  city: string;
  country: "DE";
  phoneE164: string;
  email: string;
  website: string;
  taxId: string;
  iban: string;
  bic: string;
  timeZone: "Europe/Berlin";
  bundesland: "NW";
  currency: "EUR";
  defaultVatRateBp: number;
  defaultDueTime: TimeString;
  reminderPolicy: {
    overdueEscalationDays: number;
    rolloverEscalationAt: number;
  };
}

export interface LegalParameter {
  id: string;
  key: string;
  value: number;
  validFrom: DateString;
}

export interface EventTypeRules {
  newGoodsMaxShare: number;
  bannedGoods: string[];
  onlineBookingAllowed: boolean;
  defaultPricePerMCents: number | null;
  defaultBookingFeeCents: number | null;
  /** Food & wine vendors sign yearly contracts instead of booking per event. */
  vendorContractModel: "per_event" | "yearly_contract";
}

export interface EventType {
  id: string;
  key: EventTypeKey;
  nameDe: string;
  nameEn: string;
  colour: string;
  rules: EventTypeRules;
}

export interface Row {
  id: string;
  zoneId: string;
  label: string;
  lengthCm: number;
  depthCm: number;
  carAllowed: boolean;
  carSlots: number;
  power: boolean;
  water: boolean;
}

export interface Zone {
  id: string;
  venueId: string;
  name: string;
  rows: Row[];
}

export interface Venue {
  id: string;
  name: string;
  kind: VenueKind;
  street: string;
  postalCode: string;
  city: string;
  bundesland: "NW";
  lat: number;
  lng: number;
  capacityCm: number;
  accessInfo: string;
  landownerContactId: string | null;
  archivedAt: null;
  zones: Zone[];
}

export interface Contact {
  id: string;
  kind: ContactKind;
  name: string;
  contactPerson: string | null;
  email: string;
  phoneE164: string;
  street: string;
  postalCode: string;
  city: string;
  notes: string | null;
}

export interface DutyRole {
  id: string;
  key: DutyRoleKey;
  nameDe: string;
  nameEn: string;
  defaultStaffMemberId: string | null;
  sort: number;
}

export interface StaffMember {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  phoneE164: string;
  email: string | null;
  /** Permission role if the person has a back-office login (see ADR 0012); null for pure field crew. */
  permissionRole: PermissionRole | null;
  preferredDutyRoleIds: string[];
  active: boolean;
  notes: string | null;
}

export interface EmploymentContract {
  id: string;
  staffMemberId: string;
  type: EmploymentType;
  hourlyRateCents: number | null;
  fixedMonthlyPayCents: number | null;
  contractedHoursPerWeek: number | null;
  workingTimeAccount: boolean;
  otherMinijobDeclared: boolean;
  validFrom: DateString;
  validUntil: DateString | null;
}

export interface EventPreset {
  id: string;
  key: string;
  eventTypeId: string;
  venueId: string;
  checklistTemplateId: string;
  name: string;
  publicTitle: string;
  publicText: string;
  pricePerMCents: number;
  bookingFeeCents: number;
  /** The market's Zeitplan (ADR 0022), copied into every event. */
  schedule: ScheduleRow[];
  /** "Marktregeln" (D2-3): a copy of the event type's rules, changed where the market differs. */
  rules: EventTypeRules;
  /** "Marktfarbe": a key of the market palette in @marktwerk/core. */
  color: MarketColor;
  /** The market's Kürzel (Fahrplan R15), unique, 1–4 upper-case letters or digits ("ALT", "KST", "P6"). */
  shortCode: string;
  /**
   * The rhythm shown on the market page (RFC 5545 subset: FREQ=MONTHLY|YEARLY, BYMONTH, BYDAY, BYSETPOS), or null
   * when the dates are irregular. The generator's dates come from the date rules in dictionaries/presets.ts.
   */
  rrule: string | null;
  durationDays: number;
  defaultDuties: Record<DutyRoleKey, string>;
  active: boolean;
}

export interface Event {
  id: string;
  presetId: string;
  eventTypeId: string;
  venueId: string;
  name: string;
  season: number;
  startsOn: DateString;
  endsOn: DateString;
  /** Copied from the market; shorter opening hours on single-day markets in winter. */
  schedule: ScheduleRow[];
  status: EventStatus;
  bookingOpen: boolean;
  fullyBooked: boolean;
  carSpacesFull: boolean;
  pricePerMCents: number;
  bookingFeeCents: number;
  cancelledReason: string | null;
  notes: string | null;
  duties: Record<DutyRoleKey, string>;
}

export interface EventAnchor {
  id: string;
  eventId: string;
  key: EventAnchorKey;
  date: DateString;
}

/**
 * "Saison" (`event_season`, research 13 §6): one record per market (preset) and calendar year. It carries the work
 * done once per market and season (Termine planen, Genehmigung beantragen) in its own checklist.
 */
export interface EventSeason {
  id: string;
  presetId: string;
  /** The calendar year (same meaning as `Event.season`). */
  season: number;
  /** Last season's first date moved to the same weekday and ISO week, else 1 January (core's rule). */
  expectedStart: DateString;
  /** From its dates as of the reference date (`initialSeasonStatus` in core). */
  status: SeasonStatus;
  notes: string | null;
}

/** `event_season_anchor`: `seasonStart` (first non-cancelled date, else `expectedStart`), `seasonEnd` (last day). */
export interface EventSeasonAnchor {
  id: string;
  seasonId: string;
  key: SeasonAnchorKey;
  date: DateString;
}

/**
 * `template_item.scope`. `event`: one task per event, due relative to the event anchors. `season`: one task per
 * market and season on its Saison record (`Task.seasonId`), due relative to the season anchors (research 13 §6).
 */
export type TemplateItemScope = "event" | "season";

export interface TemplateItem {
  id: string;
  stableKey: string;
  sort: number;
  title: string;
  description: string | null;
  phase: TaskPhase;
  category: TaskCategory;
  anchorKey: AnchorKey;
  offsetDays: number;
  dueTime: TimeString | null;
  /** Null only on child items that take the parent's duty role. */
  dutyRoleKey: DutyRoleKey | null;
  priority: TaskPriority;
  estimateMinutes: number;
  requiresPhoto: boolean;
  /** Kernaufgabe: a task every market needs. */
  isKey: boolean;
  /** The permit this item applies for (its task counts as done once that permit is applied for / granted). */
  permitType: TemplatePermitType | null;
  /** Child item (ADR 0021): the stable key of its parent item in the same template. One level only. */
  parentKey: string | null;
  /**
   * Child items only: true = own anchor, offset and due time; false = the parent's (the child then carries the
   * parent's values, as migration 0019 does).
   */
  ownDue: boolean;
  scope: TemplateItemScope;
}

/** Where a template's content comes from (the seed writes it as the version's change note). */
export type TemplateSource = "master" | "client_checklist" | "master_copy";

export interface ChecklistTemplate {
  id: string;
  /** Null for the Grundvorlage (any event type). */
  eventTypeId: string | null;
  name: string;
  description: string | null;
  /** The one Grundvorlage (`checklist_template.is_master`). */
  isMaster: boolean;
  /** A market's own copy (`checklist_template.owner_preset_id`); null for the Grundvorlage. */
  ownerPresetId: string | null;
  source: TemplateSource;
  version: number;
  status: "published";
  publishedOn: DateString;
  items: TemplateItem[];
}

export interface Task {
  id: string;
  /** The event of an `event` item's task; null for season tasks. */
  eventId: string | null;
  /** The Saison record of a `season` item's task; null for event tasks. Exactly one of the two is set. */
  seasonId: string | null;
  templateItemId: string;
  templateStableKey: string;
  /** Subtask (ADR 0021): the task made from the parent item, on the same event or season. One level only. */
  parentTaskId: string | null;
  phase: TaskPhase;
  category: TaskCategory;
  title: string;
  description: string | null;
  anchorKey: AnchorKey;
  offsetDays: number;
  dueAt: Instant;
  dutyRoleId: string;
  assigneeId: string;
  priority: TaskPriority;
  estimateMinutes: number;
  requiresPhoto: boolean;
  isKey: boolean;
  status: TaskStatus;
  waitingReason: string | null;
  completedAt: Instant | null;
  completedById: string | null;
  skippedReason: string | null;
  effortFeedback: EffortFeedback | null;
  rolloverCount: number;
  lastRolledAt: Instant | null;
}

export interface PermitRequirement {
  id: string;
  venueId: string;
  /** Only markets of this event type need it (`permit_requirement.event_type_id`); null = every market there. */
  eventTypeId: string | null;
  category: PermitCategory;
  permitType: PermitType;
  title: string;
  authorityContactId: string;
  cadence: PermitCadence;
  leadTimeDays: number;
  submissionWindowStartMd: string | null;
  submissionWindowEndMd: string | null;
  expectedDecisionMd: string | null;
  typicalFeeCents: number;
  deliverables: { stickers?: number };
  notes: string | null;
}

export interface Permit {
  id: string;
  requirementId: string;
  venueId: string;
  season: number;
  /** Season permits (one per market and season): that market's Saison record (`permit.season_id`); else null. */
  seasonId: string | null;
  category: PermitCategory;
  permitType: PermitType;
  title: string;
  authorityContactId: string;
  referenceNo: string | null;
  status: PermitStatus;
  applyBy: DateString;
  appliedAt: DateString | null;
  expectedDecisionOn: DateString | null;
  grantedAt: DateString | null;
  validFrom: DateString | null;
  validUntil: DateString | null;
  conditions: string[];
  deliverablesReceived: { stickers?: number };
  responsibleStaffMemberId: string;
  notes: string | null;
}

export interface EventPermit {
  id: string;
  eventId: string;
  permitId: string;
  required: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  make: string;
  model: string;
  vin: string;
  firstRegistrationOn: DateString;
  grossWeightKg: number;
  odometerKm: number;
  insurer: string;
  policyNumber: string;
  notes: string | null;
}

export interface Payable {
  id: string;
  title: string;
  scope: PayableScope;
  eventId: string | null;
  venueId: string | null;
  season: number | null;
  vehicleId: string | null;
  permitId: string | null;
  counterpartyContactId: string | null;
  category: PayableCategory;
  totalGrossCents: number;
  vatRateBp: number;
  critical: boolean;
  status: PayableStatus;
  notes: string | null;
}

export interface Installment {
  id: string;
  payableId: string;
  sort: number;
  dueOn: DateString;
  amountCents: number;
  status: InstallmentStatus;
  paidOn: DateString | null;
  paidAmountCents: number | null;
  method: "bank_transfer" | "sepa_direct_debit" | null;
  reference: string;
}

export interface Obligation {
  id: string;
  title: string;
  scope: ObligationScope;
  vehicleId: string | null;
  venueId: string | null;
  intervalMonths: number | null;
  intervalKm: number | null;
  nextDueOn: DateString;
  nextDueKm: number | null;
  leadDays: number;
  responsibleStaffMemberId: string;
  createsPayable: boolean;
  lastDoneOn: DateString | null;
}

export interface Shift {
  id: string;
  eventId: string;
  staffMemberId: string;
  dutyRoleId: string;
  workDate: DateString;
  plannedStart: TimeString;
  plannedEnd: TimeString;
  actualStart: TimeString | null;
  actualEnd: TimeString | null;
  breakMinutes: number;
  status: ShiftStatus;
  recordedById: string | null;
  recordedAt: Instant | null;
}

export interface Vendor {
  id: string;
  legacyId: number;
  kind: VendorKind;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phoneE164: string | null;
  street: string;
  postalCode: string;
  city: string;
  categories: VendorCategory[];
  isRegular: boolean;
  regularSpot: string | null;
  defaultLengthCm: number;
  hasCar: boolean;
  carLengthCm: number | null;
  newsletterConsent: "soft_opt_in" | null;
  notes: string | null;
  createdOn: DateString;
}

export interface BookingRequest {
  id: string;
  requestGroupId: string;
  eventId: string;
  vendorId: string;
  source: BookingSource;
  legacyRef: string | null;
  messageId: string | null;
  status: BookingRequestStatus;
  submittedAt: Instant;
  lengthCm: number;
  carRequested: boolean;
  comment: string | null;
}

export interface BookingDate {
  id: string;
  bookingRequestId: string;
  eventId: string;
  vendorId: string;
  lengthCm: number;
  carRequested: boolean;
  carGranted: boolean;
  carLengthCm: number | null;
  pricePerMCents: number;
  bookingFeeCents: number;
  priceCents: number;
  placementStatus: PlacementStatus;
  rowId: string | null;
  startCm: number | null;
  endCm: number | null;
  paymentStatus: PaymentStatus;
  paymentDueOn: DateString;
  paidOn: DateString | null;
  paidAmountCents: number | null;
  attendance: Attendance | null;
}

/** Everything `generateDataset` returns. `settings` is a single object, every other key is a list. */
export interface Dataset {
  settings: Settings;
  legalParameters: LegalParameter[];
  eventTypes: EventType[];
  venues: Venue[];
  contacts: Contact[];
  staffMembers: StaffMember[];
  employmentContracts: EmploymentContract[];
  dutyRoles: DutyRole[];
  eventPresets: EventPreset[];
  events: Event[];
  eventAnchors: EventAnchor[];
  eventSeasons: EventSeason[];
  eventSeasonAnchors: EventSeasonAnchor[];
  checklistTemplates: ChecklistTemplate[];
  tasks: Task[];
  permitRequirements: PermitRequirement[];
  permits: Permit[];
  eventPermits: EventPermit[];
  payables: Payable[];
  installments: Installment[];
  vehicles: Vehicle[];
  obligations: Obligation[];
  shifts: Shift[];
  vendors: Vendor[];
  bookingRequests: BookingRequest[];
  bookingDates: BookingDate[];
}

export type DatasetEntityKey = Exclude<keyof Dataset, "settings"> | "settings";

export interface Manifest {
  generator: string;
  seed: number;
  referenceDate: DateString;
  companyName: string;
  counts: Record<DatasetEntityKey, number>;
}
