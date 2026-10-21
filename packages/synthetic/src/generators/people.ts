import { CONTACT_BLUEPRINTS } from "../dictionaries/contacts";
import { DUTY_ROLE_BLUEPRINTS } from "../dictionaries/duty-roles";
import {
  CORE_STAFF_BLUEPRINTS,
  FIELD_CREW_BLUEPRINTS,
  MINIJOB_RATE_CENTS,
  type StaffBlueprint,
} from "../dictionaries/staff";
import { addDays } from "../lib/dates";
import { exampleEmail, fictionPhone, slugify } from "../lib/fiction";
import type { Rng } from "../lib/rng";
import type { Contact, DutyRole, DutyRoleKey, EmploymentContract, StaffMember } from "../types";

export function buildContacts(rng: Rng): { contacts: Contact[]; idByKey: Map<string, string> } {
  const idByKey = new Map<string, string>();
  const contacts = CONTACT_BLUEPRINTS.map((blueprint): Contact => {
    const id = rng.uuid();
    idByKey.set(blueprint.key, id);
    const contactPerson = blueprint.hasPerson
      ? `${rng.faker.person.firstName()} ${rng.faker.person.lastName()}`
      : null;
    return {
      id,
      kind: blueprint.kind,
      name: blueprint.name,
      contactPerson,
      email: exampleEmail(`kontakt.${blueprint.key.replaceAll("_", "-")}`, blueprint.emailDomain),
      phoneE164: fictionPhone(rng, blueprint.phoneRange),
      street: blueprint.street,
      postalCode: blueprint.postalCode,
      city: blueprint.city,
      notes: blueprint.notes,
    };
  });
  return { contacts, idByKey };
}

export function buildDutyRoles(rng: Rng): DutyRole[] {
  return DUTY_ROLE_BLUEPRINTS.map((blueprint, index) => ({
    id: rng.uuid(),
    key: blueprint.key,
    nameDe: blueprint.nameDe,
    nameEn: blueprint.nameEn,
    defaultStaffMemberId: null,
    sort: index + 1,
  }));
}

function buildStaffMember(
  rng: Rng,
  blueprint: StaffBlueprint,
  dutyRoles: DutyRole[],
): {
  member: StaffMember;
  contract: EmploymentContract;
} {
  const id = rng.uuid();
  const firstName = rng.faker.person.firstName();
  const lastName = rng.faker.person.lastName();
  const displayName = `${firstName} ${lastName}`;
  const preferredKeys: DutyRoleKey[] =
    blueprint.crew && blueprint.defaultDuties.length === 0
      ? rng
          .shuffle(["setup_crew", "water_power", "cash", "communication"] as DutyRoleKey[])
          .slice(0, rng.int(1, 2))
      : blueprint.defaultDuties;
  const preferredDutyRoleIds = dutyRoles
    .filter((role) => preferredKeys.includes(role.key))
    .map((role) => role.id);

  let rate = blueprint.contract.hourlyRateCents;
  if (blueprint.contract.type === "minijob") rate = rng.pick(MINIJOB_RATE_CENTS);
  const member: StaffMember = {
    id,
    displayName,
    firstName,
    lastName,
    phoneE164: fictionPhone(rng, "mobile"),
    email: blueprint.hasEmail ? exampleEmail(slugify(displayName), "example.com") : null,
    permissionRole: blueprint.permissionRole,
    preferredDutyRoleIds,
    active: true,
    notes: blueprint.notes,
  };
  const validFrom =
    blueprint.contract.type === "minijob" && blueprint.contract.validFrom === "2025-01-01"
      ? addDays("2025-01-01", rng.int(0, 420))
      : blueprint.contract.validFrom;
  const contract: EmploymentContract = {
    id: rng.uuid(),
    staffMemberId: id,
    type: blueprint.contract.type,
    hourlyRateCents: rate,
    fixedMonthlyPayCents: blueprint.contract.fixedMonthlyPayCents,
    contractedHoursPerWeek: blueprint.contract.hoursPerWeek,
    workingTimeAccount: false,
    otherMinijobDeclared: false,
    validFrom,
    validUntil: null,
  };
  return { member, contract };
}

export interface PeopleBundle {
  staffMembers: StaffMember[];
  employmentContracts: EmploymentContract[];
  /** Staff members in blueprint order, keyed by blueprint key ("owner", "field_minijob_3", …). */
  staffIdByKey: Map<string, string>;
  dutyRoles: DutyRole[];
}

/** Builds the 14 staff members and their contracts, then sets the default holder of each duty role. */
export function buildStaffAndDuties(rng: Rng, dutyRoles: DutyRole[]): PeopleBundle {
  const staffMembers: StaffMember[] = [];
  const employmentContracts: EmploymentContract[] = [];
  const staffIdByKey = new Map<string, string>();
  for (const blueprint of [...CORE_STAFF_BLUEPRINTS, ...FIELD_CREW_BLUEPRINTS]) {
    const { member, contract } = buildStaffMember(rng, blueprint, dutyRoles);
    staffMembers.push(member);
    employmentContracts.push(contract);
    staffIdByKey.set(blueprint.key, member.id);
  }

  // Each duty role gets exactly one default holder: the first core staff member who lists it.
  const defaultHolder = new Map<DutyRoleKey, string>();
  for (const blueprint of CORE_STAFF_BLUEPRINTS) {
    const staffId = staffIdByKey.get(blueprint.key);
    if (staffId === undefined) continue;
    for (const dutyKey of blueprint.defaultDuties) {
      if (!defaultHolder.has(dutyKey)) defaultHolder.set(dutyKey, staffId);
    }
  }
  const dutyRolesWithDefaults = dutyRoles.map((role) => ({
    ...role,
    defaultStaffMemberId: defaultHolder.get(role.key) ?? null,
  }));
  return { staffMembers, employmentContracts, staffIdByKey, dutyRoles: dutyRolesWithDefaults };
}

/** Duty role key → default staff member, as used by presets and events. Throws if a role has no holder. */
export function dutyDefaults(dutyRoles: DutyRole[]): Record<DutyRoleKey, string> {
  const result = {} as Record<DutyRoleKey, string>;
  for (const role of dutyRoles) {
    if (role.defaultStaffMemberId === null)
      throw new Error(`Duty role ${role.key} has no default holder`);
    result[role.key] = role.defaultStaffMemberId;
  }
  return result;
}
