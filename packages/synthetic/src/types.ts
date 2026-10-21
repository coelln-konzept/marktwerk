/**
 * Entity types for the synthetic dataset. They mirror docs/architecture/data-model.md (v0.3) with
 * camelCase fields. Conventions: money in integer cents (`...Cents`), lengths in integer centimetres
 * (`...Cm`), business dates as "YYYY-MM-DD", times as "HH:mm" (Europe/Berlin), instants as UTC ISO strings.
 */

export type DateString = string;
export type TimeString = string;
export type Instant = string;

export type EventTypeKey = "flea" | "antique" | "city_festival" | "food_wine";
export type VenueKind = "outdoor_public" | "outdoor_private" | "indoor";
export type ContactKind = "authority" | "landowner" | "supplier" | "service" | "other";
export type DutyRoleKey =
  | "market_lead"
  | "setup_crew"
  | "office"
  | "permits"
  | "communication"
  | "cash"
  | "water_power";
export type PermissionRole = "owner" | "manager" | "staff" | "field";
export type EmploymentType =
  | "minijob"
  | "midijob"
  | "student"
  | "part_time"
  | "full_time"
  | "freelance";
export type AnchorKey = "eventDay" | "setupDay" | "bookingCutoff";
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
export type PermitType =
  | "market_permit"
  | "water"
  | "signage"
  | "no_parking"
  | "toilets"
  | "landowner_ok";
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

export interface DefaultTimes {
  setup: TimeString;
  open: TimeString;
  close: TimeString;
  teardown: TimeString;
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
  defaultTimes: DefaultTimes;
  /** RFC 5545 recurrence rule (subset: FREQ=MONTHLY|YEARLY, BYMONTH, BYDAY, BYSETPOS). */
  rrule: string;
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
  times: DefaultTimes;
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
  key: AnchorKey;
  date: DateString;
}

export interface TemplateItem {
  id: string;
  stableKey: string;
  sort: number;
  title: string;
  phase: TaskPhase;
  category: TaskCategory;
  anchorKey: AnchorKey;
  offsetDays: number;
  dueTime: TimeString | null;
  dutyRoleKey: DutyRoleKey;
  priority: TaskPriority;
  estimateMinutes: number;
  requiresPhoto: boolean;
}

export interface ChecklistTemplate {
  id: string;
  eventTypeId: string;
  name: string;
  version: number;
  status: "published";
  publishedOn: DateString;
  items: TemplateItem[];
}

export interface Task {
  id: string;
  eventId: string;
  templateItemId: string;
  templateStableKey: string;
  phase: TaskPhase;
  category: TaskCategory;
  title: string;
  anchorKey: AnchorKey;
  offsetDays: number;
  dueAt: Instant;
  dutyRoleId: string;
  assigneeId: string;
  priority: TaskPriority;
  estimateMinutes: number;
  requiresPhoto: boolean;
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
