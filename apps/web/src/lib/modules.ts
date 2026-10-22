import type { HealthDimensions } from "@marktwerk/core";

/**
 * UI-level module switches (not a user setting).
 *
 * For now marktwerk is a task monitoring panel for one main user (client feedback, 2026-10). Team task
 * allocation comes back in Phase 4 and finance later. The data, services, permissions and tests of both
 * modules stay untouched; only the UI stops rendering them. To bring a module back, flip its flag to
 * `false` here (and nothing else): every hide in the UI is driven from this one object.
 */
export const HIDDEN_MODULES = { team: true, finance: true } as const;

export type HiddenModule = keyof typeof HIDDEN_MODULES;

/** A set of hidden modules; pages pass `HIDDEN_MODULES`, tests and other callers may pass none. */
export type ModuleHide = Partial<Record<HiddenModule, boolean>>;

/** True when the module's UI must not be rendered. */
export function isModuleHidden(module: HiddenModule): boolean {
  return HIDDEN_MODULES[module];
}

/** True when the module's UI is shown. */
export function isModuleVisible(module: HiddenModule): boolean {
  return !HIDDEN_MODULES[module];
}

/** Event health without the dimensions of hidden modules (team, money), so "overall" ignores them too. */
export function maskHealth(
  health: HealthDimensions,
  hide: ModuleHide = HIDDEN_MODULES,
): HealthDimensions {
  return {
    ...health,
    team: hide.team ? null : health.team,
    money: hide.finance ? null : health.money,
  };
}
