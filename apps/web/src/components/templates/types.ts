import type { TemplateItemFields } from "@marktwerk/core";

/** One row of a template version as the client components see it (plain values). */
export type ItemView = TemplateItemFields & { key: string };

export type RoleChoice = { id: string; name: string };

export type TypeChoice = { key: string; name: string };
