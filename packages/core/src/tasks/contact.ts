/*
 * The contact a task is about (Fahrplan R24, gap G7): "Ordnungsamt anrufen", "Eigentümer fragen". A task links one
 * contact (`task.contact_id`, optional). These pure rules decide which contact the context points to: for a template
 * item's default role when the task is made, and for the drawer's "Vorschlag: …" while a task has none.
 */
import { itemPermitType } from "../permits/venue-needs";

/** Default contact roles of a template item: "Behörde", "Eigentümer" (database enum `task_contact_role`). */
export const TASK_CONTACT_ROLES = ["authority", "landowner"] as const;
export type TaskContactRole = (typeof TASK_CONTACT_ROLES)[number];

export function isTaskContactRole(value: unknown): value is TaskContactRole {
  return typeof value === "string" && (TASK_CONTACT_ROLES as readonly string[]).includes(value);
}

/**
 * What the Ort of a task says about its contacts. Only live (not archived) contacts belong in here; the loader
 * filters them.
 */
export type ContactContext = {
  /** The Ort's Eigentümer (`venue.landowner_contact_id`) and its kind: on municipal ground that is a Behörde. */
  venueOwner: { id: string; kind: string } | null;
  /**
   * The Ort's permit requirements that apply (live; for the event's type or for every type), event-type-specific
   * ones first, each with the Behörde it names (null = none entered).
   */
  requirements: readonly { permitType: string; authorityId: string | null }[];
};

export const NO_CONTACT_CONTEXT: ContactContext = { venueOwner: null, requirements: [] };

/**
 * The contact a role points to at an Ort, or null.
 *
 * - **Eigentümer**: the Ort's owner.
 * - **Behörde**: with a permit type (the item applies for that permit), the Behörde of the Ort's requirement of
 *   that type (the Marktgenehmigung stands for the Ort's main permit, `itemPermitType`). Otherwise, or when that
 *   requirement names none: the one Behörde all the Ort's requirements name, if they name exactly one; else the
 *   Ort's owner when that is a Behörde (municipal ground). Never a guess between two authorities.
 */
export function contactForRole(
  role: TaskContactRole,
  context: ContactContext,
  permitType: string | null = null,
): string | null {
  const owner = context.venueOwner;
  if (role === "landowner") return owner?.id ?? null;
  const ownerIfAuthority = owner?.kind === "authority" ? owner.id : null;
  if (permitType) {
    const type = itemPermitType(
      permitType,
      context.requirements.map((r) => r.permitType),
    );
    const ofType = context.requirements.find((r) => r.permitType === type);
    if (ofType) return ofType.authorityId ?? ownerIfAuthority;
  }
  const named = [
    ...new Set(context.requirements.flatMap((r) => (r.authorityId ? [r.authorityId] : []))),
  ];
  if (named.length === 1) return named[0] ?? null;
  return ownerIfAuthority;
}

/** Why the drawer suggests a contact ("aus der Genehmigung", "Behörde des Orts", "Eigentümer des Orts"). */
export type ContactSuggestionReason = "permit" | "authority" | "landowner";
export type ContactSuggestion = { contactId: string; reason: ContactSuggestionReason };

/** Task categories that concern the Ort itself (Aufbau, Strom, Wasser, Toiletten, Reinigung): its owner is asked. */
const ORT_CATEGORIES: readonly string[] = ["logistics"];

/**
 * The drawer's "Vorschlag: …" for a task without a contact (never saved by itself; one click sets it).
 *
 * 1. A task of a permit: the Behörde entered on that permit (whatever its kind, e.g. a Standrohr supplier).
 * 2. The template item's default role (it found no contact when the task was made, e.g. the owner came later).
 * 3. A permit task (it applies for a permit, or its category is Genehmigungen): the Behörde of the Ort
 *    (`contactForRole`), else the Ort's owner (on private ground the owner's OK is the permit).
 * 4. A task about the Ort (category Logistik): the Ort's owner.
 *
 * Anything else gets no suggestion: an owner on "Plakate drucken" would only be noise. `context` is null for a
 * task without an Ort (an obligation, a task of no event).
 */
export function suggestTaskContact(input: {
  category: string;
  /** The permit type the task applies for (its template item's or its permit's), null = none. */
  permitType: string | null;
  /** The Behörde of the permit the task belongs to (`task.permit_id`), null = none or no permit. */
  permitAuthorityId: string | null;
  /** The template item's default role, null = none. */
  role: TaskContactRole | null;
  context: ContactContext | null;
}): ContactSuggestion | null {
  if (input.permitAuthorityId) return { contactId: input.permitAuthorityId, reason: "permit" };
  const context = input.context;
  if (!context) return null;
  const owner = context.venueOwner;
  const found = (id: string | null): ContactSuggestion | null =>
    id ? { contactId: id, reason: id === owner?.id ? "landowner" : "authority" } : null;
  if (input.role) {
    const byRole = found(contactForRole(input.role, context, input.permitType));
    if (byRole) return byRole;
  }
  if (input.permitType !== null || input.category === "permits")
    return found(contactForRole("authority", context, input.permitType) ?? owner?.id ?? null);
  if (ORT_CATEGORIES.includes(input.category)) return found(owner?.id ?? null);
  return null;
}
