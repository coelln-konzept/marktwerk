import { can, type Role } from "@marktwerk/core";

/** What "+ Neu" (top bar) and the command palette can create, each with the grant it needs. */
export const CREATABLE = ["event", "task", "payable", "permit", "shift", "issue"] as const;
export type Creatable = (typeof CREATABLE)[number];

/** The things this role may create: only those show up in "+ Neu" and the palette. */
export function creatableFor(role: Role): Creatable[] {
  const allowed: Record<Creatable, boolean> = {
    event: can(role, "event", "write"),
    task: can(role, "task", "write"),
    payable: can(role, "finance", "write"),
    permit: can(role, "permit", "write"),
    shift: can(role, "team", "manage"),
    issue: can(role, "company", "write"),
  };
  return CREATABLE.filter((kind) => allowed[kind]);
}
