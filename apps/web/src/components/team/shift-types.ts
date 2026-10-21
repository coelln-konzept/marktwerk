import type { LiveContext, ShiftRow } from "@/server/queries/hours";

/** A shift as the client components get it (dates as strings, role name resolved). */
export type ShiftView = Omit<ShiftRow, "recordedAt" | "dutyRoleNameDe" | "dutyRoleNameEn"> & {
  recordedAt: string | null;
  dutyRoleName: string | null;
};

export type PersonOption = { id: string; displayName: string };
export type RoleOption = { id: string; name: string };
export type EventOption = { id: string; name: string; startsOn: string; endsOn: string };

export function toShiftView(row: ShiftRow, locale: string): ShiftView {
  const { recordedAt, dutyRoleNameDe, dutyRoleNameEn, ...rest } = row;
  return {
    ...rest,
    recordedAt: recordedAt ? recordedAt.toISOString() : null,
    dutyRoleName: locale === "en" ? dutyRoleNameEn : dutyRoleNameDe,
  };
}

/** What every shift list needs to edit and add shifts. */
export type ShiftEnvironment = {
  canManage: boolean;
  today: string;
  live: LiveContext;
  people: PersonOption[];
  roles: RoleOption[];
  events: EventOption[];
};
