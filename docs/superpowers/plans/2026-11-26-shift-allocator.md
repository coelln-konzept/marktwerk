# Shift allocator (Schichtplanung) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owner and manager put staff on market days from open slots, and see each person's monthly hours used
and left plus weekly totals, on a people grid (`/team/planung`) and a market-day list on the event Team tab.

**Architecture:**
- **Needs** (`shift_need`) say per event day and role how many people are needed and when. They are created from
  the event's staffing (a copy of the preset's) through the single instantiation path, and they move with the
  event through the single anchor-shift path.
- **Assignments** are ordinary `shift` rows with a `need_id`, so the hours, payroll and ArbZG code stays unchanged.
- **Budgets, gaps, week totals and candidate ranking** are pure functions in `packages/core/src/staff/planning.ts`.

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle + Postgres, Vitest (core and integration),
Playwright (e2e), next-intl, Tailwind, Biome.

**Spec:** `docs/superpowers/specs/2026-11-26-shift-allocator-design.md`. Decisions: `docs/open-questions.md`, rows
"Shift allocator: …".

## Global Constraints

- Before writing Next code, read the guide in `apps/web/node_modules/next/dist/docs/`. Request APIs are async, and
  Cache Components is off.
- Every page, server action and route handler starts with `requirePermission()`. Shift planning uses
  `team:read` (views) and `team:manage` (writes). Owner and manager only; no new permission.
- Business mutations follow: permission check → transaction → `audit_log`.
- Pure rules live in `packages/core` with Vitest tests, including date edge cases.
- Event instantiation and anchor shifts each keep **one** service path: `instantiateEvents` and `applySchedule`.
- No inline UI strings. Every key goes into **both** `apps/web/messages/de.json` and `en.json`. `pnpm test` in
  `apps/web` checks that they match.
- Status is always shown as colour + icon + text. Mistakes are undone with undo toasts, not confirmation dialogs.
  Dates use German formats including KW. No drag in v1.
- Dates are `date` in Europe/Berlin, and times are "HH:mm" wall clock.
- Never edit applied migrations; generate a new one with `pnpm db:generate --name <change>`.
- Biome is the only formatter (`pnpm lint:fix`). Run `pnpm check` before every commit.
- Work on branch `feat/shift-allocator`, created from `exp/stand-allocation` after PR #105 is merged. Open a PR into
  `exp/stand-allocation` and ask Arda before merging. Never merge to `main`.
- Default hour budget: **40 h per month**. "Knapp" means **≤ 4 h left**. Short notice means **< 4 days ahead**
  (§12 TzBfG).
- Nothing in the planner blocks. Warnings need one confirmation, and the server re-checks it.
- Synthetic data only; `settings.email_enabled` stays false.

## Two spec corrections made while planning (also edited into the spec)

1. **`shift_need` gets a `schedule_kind` column**, and the unique key becomes `(event_id, work_date, duty_role_id,
   schedule_kind)`. The same role can be needed for Aufbau and for Abbau on the same day.
2. **Default Zeitplans have no team rows** (only vendor and visitor rows). A need takes its times from the team row
   of its kind on that day, falling back to any row of that kind on that day.
3. **`EventShifts` (time recording) stays on the event Team tab** below the new day blocks once the event has
   started (`today ≥ startsOn`). Replacing it outright would remove time entry from the event page.

## File map

| File | Responsibility |
|---|---|
| `apps/web/src/lib/modules.ts` | New `staffPlanning` flag; `team` now means task assignment only |
| `packages/core/src/staff/planning.ts` (+ `.test.ts`) | Budget, usage, week totals, short notice, staffing parsing, needs from staffing, gaps, ranking |
| `packages/core/src/index.ts` | Export planning |
| `packages/db/src/schema/staff.ts` | `shiftNeed`, `staffUnavailability`, `shift.needId`, `employmentContract.monthlyHourBudget` |
| `packages/db/src/schema/events.ts` | `StaffingRowValue`, `eventPreset.staffing`, `event.staffing` |
| `packages/db/src/schema/settings.ts` | `defaultMonthlyHourBudget` |
| `apps/web/src/server/services/shifts.ts` | `needId` in `ShiftInput` |
| `apps/web/src/server/services/staffing.ts` | Needs inside transactions: create from staffing, move with the event |
| `apps/web/src/server/services/events.ts`, `event-details.ts`, `presets.ts` | Hooks into the single paths; staffing on presets |
| `apps/web/src/server/services/shift-planning.ts` | assign, status, need edit, unavailability, apply preset staffing |
| `apps/web/src/server/queries/planning.ts` | Month planning data, event planning data, candidates |
| `apps/web/src/app/(app)/team/planung/*` | Grid page and server actions |
| `apps/web/src/components/planning/*` | Grid, cell menu, day blocks, picker, unavailability dialog |
| `apps/web/src/components/team/team-nav.tsx` | The "Planung" tab |
| `packages/synthetic/src/generators/planning.ts` | Seed for needs, future shifts, unavailability, budgets |
| `apps/web/test/integration/shift-planning.test.ts` | Service tests |
| `apps/web/e2e/planning.spec.ts` | Smoke test |

---

### Task 1: Split the module flag

**Files:**
- Modify: `apps/web/src/lib/modules.ts:11-12`
- Modify the people and shift gates (switch `"team"` to `"staffPlanning"`):
  - `apps/web/src/app/(app)/team/layout.tsx:6`
  - `apps/web/src/app/(app)/veranstaltungen/[id]/team/layout.tsx:12`
  - `apps/web/src/app/(app)/veranstaltungen/[id]/page.tsx:100`
  - `apps/web/src/app/(app)/einstellungen/rechtliches/page.tsx:25`
  - `apps/web/src/components/settings/settings-header.tsx:27,33`
  - `apps/web/src/components/event-detail/event-header.tsx:192` (the Team tab link)
  - `apps/web/src/server/search.ts:12`
  - `apps/web/src/server/queries/archive.ts:51-52`
  - the Team entry in `apps/web/src/components/shell/app-sidebar.tsx` (search it for `team` and `isModule`)
- Keep `"team"`, which now means task assignment only:
  - `app/(app)/page.tsx:87,155`
  - `genehmigungen/page.tsx:66`
  - `kalender/page.tsx:157`
  - `board/*` (ablauf-list, new-task-dialog, board-screen, task-card)
  - `queries/overview.ts`, `kalender/layers.ts`, `lib/notification-reasons.ts`

**Interfaces:**
- Produces: `HiddenModule` gains `"staffPlanning"`; `isModuleVisible("staffPlanning")` is true.

- [ ] **Step 1: Edit `modules.ts`**

```ts
export const HIDDEN_MODULES = {
  /**
   * Task assignment (assignees on cards, the new-task dialog and the Ablauf list, "Nur meine" in the Kalender).
   * Hidden since the one-main-user panel (client feedback 2026-10). The people and shift area is `staffPlanning`
   * (decision 2026-11-26, shift allocator).
   */
  team: true,
  /** People, contracts, Planung, Stunden, Schichten, the event Team tab, Rechtliches (shift allocator, 2026-11-26). */
  staffPlanning: false,
  finance: true,
  // …rest unchanged
```

In `hideOf`/`eventHealth` (around line 63–70), the event health "team" dimension follows `staffPlanning`. Change
`hide.team` to `hide.staffPlanning` there, and keep the key `team` in `HealthDimensions`.

- [ ] **Step 2: Switch each gate listed under "people and shift gates"**

Change each call from `isModuleHidden("team")` / `isModuleVisible("team")` to `"staffPlanning"`. Example from
`team/layout.tsx`:

```ts
if (isModuleHidden("staffPlanning")) notFound();
```

Then grep to confirm that only the task-assignment uses remain:

Run: `grep -rn '"team")' apps/web/src | grep -i "modulehidden\|modulevisible"`
Expected: only `page.tsx`, `genehmigungen/page.tsx`, `kalender/page.tsx` and the `components/board/*` files.

- [ ] **Step 3: Run checks and commit**

Run: `pnpm check`
Expected: PASS. Some unit tests in `apps/web` may pass `ModuleHide` objects with `team:`; update those to
`staffPlanning` where they mean the Team area.

```bash
git add -A && git commit -m "feat(modules): split team flag into staffPlanning (people + shifts) and team (task assignment)"
```

---

### Task 2: Core: budget, usage, week totals, short notice

**Files:**
- Create: `packages/core/src/staff/planning.ts`
- Create: `packages/core/src/staff/planning.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./staff/planning";` after line 56)

**Interfaces:**
- Consumes: `contractOn`, `monthStart`, `monthEnd` (`staff/hours.ts`); `shiftWork`, `ShiftTimesInput`
  (`staff/worktime.ts`); `addDays`, `daysBetween`, `isoWeek` (`dates/calendar.ts`).
- Produces:
  - `DEFAULT_MONTHLY_HOUR_BUDGET = 40`, `TIGHT_MINUTES = 240`, `SHORT_NOTICE_DAYS = 4`
  - `type BudgetContract = { validFrom: string; validUntil: string | null; monthlyHourBudget: number | null }`
  - `hourBudget(contracts: readonly BudgetContract[], month: string, defaultHours: number): { minutes: number; noContract: boolean }`
  - `type MonthUsage = { workedMinutes: number; confirmedMinutes: number; requestedMinutes: number }`
  - `monthUsage(shifts: readonly ShiftTimesInput[], month: string): MonthUsage`
  - `type BudgetLevel = "ok" | "tight" | "over"`
  - `budgetStatus(usage: MonthUsage, budgetMinutes: number): { usedMinutes: number; leftMinutes: number; level: BudgetLevel }`
  - `type WeekTotal = { year: number; week: number; minutes: number }`
  - `weekTotals(shifts: readonly ShiftTimesInput[]): WeekTotal[]` (sorted by year, then week)
  - `shortNotice(workDate: string, today: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/staff/planning.test.ts
import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  hourBudget,
  monthUsage,
  shortNotice,
  weekTotals,
} from "./planning";
import type { ShiftTimesInput } from "./worktime";

const s = (
  workDate: string,
  status: ShiftTimesInput["status"],
  planned: [string, string] | null,
  actual: [string, string] | null = null,
  breakMinutes = 0,
): ShiftTimesInput => ({
  workDate,
  status,
  plannedStart: planned?.[0] ?? null,
  plannedEnd: planned?.[1] ?? null,
  actualStart: actual?.[0] ?? null,
  actualEnd: actual?.[1] ?? null,
  breakMinutes,
});

describe("hourBudget", () => {
  it("uses the default without a contract and says so", () => {
    expect(hourBudget([], "2026-12-01", 40)).toEqual({ minutes: 2400, noContract: true });
  });
  it("uses the contract's budget, or the default when it is empty", () => {
    const c = { validFrom: "2026-01-01", validUntil: null, monthlyHourBudget: 35 };
    expect(hourBudget([c], "2026-12-01", 40)).toEqual({ minutes: 2100, noContract: false });
    expect(hourBudget([{ ...c, monthlyHourBudget: null }], "2026-12-01", 40).minutes).toBe(2400);
  });
  it("takes the contract valid on the last day of the month that has one (mid-month change)", () => {
    const old = { validFrom: "2026-01-01", validUntil: "2026-12-14", monthlyHourBudget: 40 };
    const raise = { validFrom: "2026-12-15", validUntil: null, monthlyHourBudget: 30 };
    expect(hourBudget([old, raise], "2026-12-01", 40).minutes).toBe(1800);
  });
  it("falls back to an earlier day when the contract ended mid-month", () => {
    const ended = { validFrom: "2026-01-01", validUntil: "2026-12-10", monthlyHourBudget: 20 };
    expect(hourBudget([ended], "2026-12-01", 40)).toEqual({ minutes: 1200, noContract: false });
  });
  it("accepts half hours", () => {
    const c = { validFrom: "2026-01-01", validUntil: null, monthlyHourBudget: 37.5 };
    expect(hourBudget([c], "2026-12-01", 40).minutes).toBe(2250);
  });
});

describe("monthUsage + budgetStatus", () => {
  const shifts = [
    s("2026-12-05", "worked", ["08:00", "16:00"], ["08:00", "16:30"], 30), // 480 worked
    s("2026-12-12", "confirmed", ["08:00", "14:00"]), // 360 confirmed
    s("2026-12-13", "requested", ["10:00", "14:00"]), // 240 requested
    s("2026-12-19", "declined", ["08:00", "16:00"]), // not counted
    s("2026-12-20", "cancelled", ["08:00", "16:00"]), // not counted
    s("2026-11-29", "confirmed", ["08:00", "16:00"]), // other month
  ];
  it("splits used minutes by state and ignores declined/cancelled and other months", () => {
    expect(monthUsage(shifts, "2026-12-01")).toEqual({
      workedMinutes: 480,
      confirmedMinutes: 360,
      requestedMinutes: 240,
    });
  });
  it("levels: ok, tight at ≤ 4 h left, over below 0", () => {
    const usage = monthUsage(shifts, "2026-12-01"); // 1080
    expect(budgetStatus(usage, 2400)).toEqual({ usedMinutes: 1080, leftMinutes: 1320, level: "ok" });
    expect(budgetStatus(usage, 1320).level).toBe("tight"); // 240 left
    expect(budgetStatus(usage, 1321).level).toBe("ok"); // 241 left
    expect(budgetStatus(usage, 1080).level).toBe("tight"); // 0 left
    expect(budgetStatus(usage, 1000)).toEqual({ usedMinutes: 1080, leftMinutes: -80, level: "over" });
  });
});

describe("weekTotals", () => {
  it("sums per ISO week across a month boundary", () => {
    // KW 49/2026 = Mon 30.11. – Sun 06.12.
    const totals = weekTotals([
      s("2026-11-30", "confirmed", ["08:00", "12:00"]),
      s("2026-12-05", "confirmed", ["08:00", "10:00"]),
      s("2026-12-07", "requested", ["08:00", "09:00"]),
    ]);
    expect(totals).toEqual([
      { year: 2026, week: 49, minutes: 360 },
      { year: 2026, week: 50, minutes: 60 },
    ]);
  });
  it("handles KW 53 and the year change (2026 has 53 weeks)", () => {
    const totals = weekTotals([
      s("2026-12-31", "confirmed", ["08:00", "10:00"]), // KW 53/2026
      s("2027-01-03", "confirmed", ["08:00", "09:00"]), // still KW 53/2026
      s("2027-01-04", "confirmed", ["08:00", "09:00"]), // KW 1/2027
    ]);
    expect(totals).toEqual([
      { year: 2026, week: 53, minutes: 180 },
      { year: 2027, week: 1, minutes: 60 },
    ]);
  });
});

describe("shortNotice", () => {
  it("is true for 0–3 days ahead, false from 4 days and for the past", () => {
    expect(shortNotice("2026-12-12", "2026-12-12")).toBe(true);
    expect(shortNotice("2026-12-15", "2026-12-12")).toBe(true); // 3 days
    expect(shortNotice("2026-12-16", "2026-12-12")).toBe(false); // 4 days
    expect(shortNotice("2026-12-17", "2026-12-12")).toBe(false);
    expect(shortNotice("2026-12-11", "2026-12-12")).toBe(false);
  });
  it("counts calendar days across the DST change (29.03.2026)", () => {
    expect(shortNotice("2026-03-30", "2026-03-27")).toBe(true); // 3 days
    expect(shortNotice("2026-03-31", "2026-03-27")).toBe(false); // 4 days
  });
});
```

Check the week numbers before relying on them: 2026-12-31 is a Thursday, so 2026 has 53 ISO weeks. If `isoWeek`
disagrees, `isoWeek` is the reference; fix the test data, not the helper.

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm --filter @marktwerk/core test -- planning`
Expected: FAIL, "Failed to resolve import ./planning".

- [ ] **Step 3: Implement**

```ts
// packages/core/src/staff/planning.ts
import { addDays, daysBetween, isoWeek } from "../dates/calendar";
import { contractOn, monthEnd, monthStart } from "./hours";
import { type ShiftTimesInput, shiftWork } from "./worktime";

/**
 * Shift planning (spec 2026-11-26-shift-allocator-design.md §4). The budget is company policy, not law: the
 * Minijob cap in hours with a margin (40 h per month by default, per person on the contract).
 */
export const DEFAULT_MONTHLY_HOUR_BUDGET = 40;
/** "Knapp": at most one typical market shift left. */
export const TIGHT_MINUTES = 4 * 60;
/** §12 TzBfG: work on call must be announced at least four days ahead. */
export const SHORT_NOTICE_DAYS = 4;

export type BudgetContract = {
  validFrom: string;
  validUntil: string | null;
  monthlyHourBudget: number | null;
};

/** The budget of a month: the contract valid on the month's last day that has one, else the default. */
export function hourBudget(
  contracts: readonly BudgetContract[],
  month: string,
  defaultHours: number,
): { minutes: number; noContract: boolean } {
  const from = monthStart(month);
  for (let day = monthEnd(month); day >= from; day = addDays(day, -1)) {
    const contract = contractOn(contracts, day);
    if (contract)
      return {
        minutes: Math.round((contract.monthlyHourBudget ?? defaultHours) * 60),
        noContract: false,
      };
  }
  return { minutes: Math.round(defaultHours * 60), noContract: true };
}

export type MonthUsage = {
  /** Shifts with recorded times. */
  workedMinutes: number;
  /** Planned, status bestätigt. */
  confirmedMinutes: number;
  /** Planned, status angefragt (not yet answered). */
  requestedMinutes: number;
};

/** Minutes of the month that count against the budget (requested, confirmed and worked shifts). */
export function monthUsage(shifts: readonly ShiftTimesInput[], month: string): MonthUsage {
  const from = monthStart(month);
  const to = monthEnd(month);
  const usage: MonthUsage = { workedMinutes: 0, confirmedMinutes: 0, requestedMinutes: 0 };
  for (const shift of shifts) {
    if (shift.workDate < from || shift.workDate > to) continue;
    const work = shiftWork(shift);
    usage.workedMinutes += work.workedMinutes;
    if (shift.status === "requested") usage.requestedMinutes += work.plannedMinutes;
    else usage.confirmedMinutes += work.plannedMinutes;
  }
  return usage;
}

export type BudgetLevel = "ok" | "tight" | "over";

export function budgetStatus(
  usage: MonthUsage,
  budgetMinutes: number,
): { usedMinutes: number; leftMinutes: number; level: BudgetLevel } {
  const usedMinutes = usage.workedMinutes + usage.confirmedMinutes + usage.requestedMinutes;
  const leftMinutes = budgetMinutes - usedMinutes;
  const level: BudgetLevel = leftMinutes < 0 ? "over" : leftMinutes <= TIGHT_MINUTES ? "tight" : "ok";
  return { usedMinutes, leftMinutes, level };
}

export type WeekTotal = { year: number; week: number; minutes: number };

/** Minutes per ISO week (information only: a Minijob has no weekly limit). */
export function weekTotals(shifts: readonly ShiftTimesInput[]): WeekTotal[] {
  const byWeek = new Map<string, WeekTotal>();
  for (const shift of shifts) {
    const work = shiftWork(shift);
    const minutes = work.workedMinutes + work.plannedMinutes;
    if (minutes === 0) continue;
    const { year, week } = isoWeek(shift.workDate);
    const key = `${year}-${String(week).padStart(2, "0")}`;
    const total = byWeek.get(key) ?? { year, week, minutes: 0 };
    total.minutes += minutes;
    byWeek.set(key, total);
  }
  return [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, total]) => total);
}

/** Less than four days ahead (today counts as 0). Past days are not "short notice". */
export function shortNotice(workDate: string, today: string): boolean {
  const days = daysBetween(today, workDate);
  return days >= 0 && days < SHORT_NOTICE_DAYS;
}
```

`contractOn` is typed `<T extends Validity>`, and `BudgetContract` fits it structurally. If the compiler complains
that `Validity` is not exported, export it from `hours.ts` (`export type Validity`).

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm --filter @marktwerk/core test -- planning`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core && git commit -m "feat(core): hour budget, month usage, week totals and short notice for shift planning"
```

---

### Task 3: Core: staffing, needs from the Zeitplan, gaps, candidate ranking

**Files:**
- Modify: `packages/core/src/staff/planning.ts`
- Modify: `packages/core/src/staff/planning.test.ts`

**Interfaces:**
- Consumes: `rowsForDay`, `SCHEDULE_KINDS`, `ScheduleKind`, `ScheduleRow` (`events/schedule.ts`);
  `checkWorkingTime`, `effectiveSpan`, `shiftCounts`, `WorkingTimeLimits`, `WorkingTimeWarning`,
  `requiredBreakMinutes`, `shiftLength` (`staff/worktime.ts`).
- Produces:
  - `type StaffingRow = { dutyRoleKey: string; count: number; scheduleKind: ScheduleKind }`
  - `MAX_STAFFING_ROWS = 20`, `MAX_HEADCOUNT = 30`
  - `parseStaffing(input: unknown): StaffingRow[] | null`
  - `type NeedDraft = { workDate: string; dutyRoleKey: string; scheduleKind: ScheduleKind; headcount: number; plannedStart: string | null; plannedEnd: string | null }`
  - `needsFromStaffing(staffing: readonly StaffingRow[], schedule: readonly ScheduleRow[], startsOn: string, durationDays: number): NeedDraft[]`
  - `needGaps(headcount: number, statuses: readonly ShiftStatus[]): { filled: number; open: number; over: number }`
  - `type CandidateInput = { staffMemberId: string; displayName: string; usual: boolean; leftMinutes: number; unavailableNote: string | null | undefined; dayShifts: readonly ShiftTimesInput[]; recentShifts: readonly (ShiftTimesInput & { id?: string })[] }` (`unavailableNote`: `undefined` = available, `null` = unavailable without a note)
  - `type CandidateFlag = "unavailable" | "already_scheduled" | "overlap" | "over_budget_after" | "worktime"`
  - `type Candidate = { staffMemberId: string; displayName: string; group: "usual" | "other" | "unavailable"; leftBefore: number; leftAfter: number; flags: CandidateFlag[]; unavailableNote: string | null; worktime: WorkingTimeWarning[] }`
  - `rankCandidates(slot: { workDate: string; plannedStart: string; plannedEnd: string }, people: readonly CandidateInput[], limits?: WorkingTimeLimits): Candidate[]`
  - `needsConfirmation(flags: readonly CandidateFlag[]): boolean` (true for every flag except a bare `already_scheduled`)
  - `slotMinutes(slot: { workDate: string; plannedStart: string; plannedEnd: string }): { net: number; breakMinutes: number }`

- [ ] **Step 1: Write the failing tests (append to `planning.test.ts`)**

```ts
import type { ScheduleRow } from "../events/schedule";
import {
  needGaps,
  needsConfirmation,
  needsFromStaffing,
  parseStaffing,
  rankCandidates,
  slotMinutes,
} from "./planning";

describe("parseStaffing", () => {
  it("accepts valid rows and rejects bad ones", () => {
    expect(parseStaffing([{ dutyRoleKey: "setup", count: 2, scheduleKind: "setup" }])).toEqual([
      { dutyRoleKey: "setup", count: 2, scheduleKind: "setup" },
    ]);
    expect(parseStaffing([])).toEqual([]);
    expect(parseStaffing("x")).toBeNull();
    expect(parseStaffing([{ dutyRoleKey: "", count: 1, scheduleKind: "open" }])).toBeNull();
    expect(parseStaffing([{ dutyRoleKey: "a", count: -1, scheduleKind: "open" }])).toBeNull();
    expect(parseStaffing([{ dutyRoleKey: "a", count: 1.5, scheduleKind: "open" }])).toBeNull();
    expect(parseStaffing([{ dutyRoleKey: "a", count: 1, scheduleKind: "lunch" }])).toBeNull();
  });
  it("rejects the same role and kind twice, allows the same role for two kinds", () => {
    const row = { dutyRoleKey: "crew", count: 1, scheduleKind: "setup" };
    expect(parseStaffing([row, row])).toBeNull();
    expect(parseStaffing([row, { ...row, scheduleKind: "teardown" }])).toHaveLength(2);
  });
});

describe("needsFromStaffing", () => {
  const schedule: ScheduleRow[] = [
    { audience: "vendors", kind: "setup", day: "first", from: "06:00", to: "08:00" },
    { audience: "team", kind: "setup", day: "before", from: "15:00", to: "19:00" },
    { audience: "visitors", kind: "open", day: "each", from: "08:00", to: "16:00" },
    { audience: "vendors", kind: "teardown", day: "last", from: "16:00", to: "18:00" },
  ];
  const staffing = [
    { dutyRoleKey: "crew", count: 2, scheduleKind: "setup" as const },
    { dutyRoleKey: "cash", count: 1, scheduleKind: "open" as const },
    { dutyRoleKey: "crew", count: 2, scheduleKind: "teardown" as const },
  ];
  it("creates one need per day and kind; the team row wins over other audiences", () => {
    expect(needsFromStaffing(staffing, schedule, "2026-12-12", 2)).toEqual([
      // day before: the team setup row
      { workDate: "2026-12-11", dutyRoleKey: "crew", scheduleKind: "setup", headcount: 2, plannedStart: "15:00", plannedEnd: "19:00" },
      // day 1: no team setup row that day → the vendors' setup window
      { workDate: "2026-12-12", dutyRoleKey: "crew", scheduleKind: "setup", headcount: 2, plannedStart: "06:00", plannedEnd: "08:00" },
      { workDate: "2026-12-12", dutyRoleKey: "cash", scheduleKind: "open", headcount: 1, plannedStart: "08:00", plannedEnd: "16:00" },
      { workDate: "2026-12-13", dutyRoleKey: "cash", scheduleKind: "open", headcount: 1, plannedStart: "08:00", plannedEnd: "16:00" },
      { workDate: "2026-12-13", dutyRoleKey: "crew", scheduleKind: "teardown", headcount: 2, plannedStart: "16:00", plannedEnd: "18:00" },
    ]);
  });
  it("skips rows with count 0 and kinds without any row that day", () => {
    expect(needsFromStaffing([{ dutyRoleKey: "x", count: 0, scheduleKind: "open" }], schedule, "2026-12-12", 1)).toEqual([]);
    expect(needsFromStaffing(staffing, [], "2026-12-12", 1)).toEqual([]);
  });
});

describe("needGaps", () => {
  it("counts requested and confirmed as filled; declined/cancelled reopen", () => {
    expect(needGaps(2, ["requested", "declined", "cancelled"])).toEqual({ filled: 1, open: 1, over: 0 });
    expect(needGaps(1, ["confirmed", "requested"])).toEqual({ filled: 2, open: 0, over: 1 });
    expect(needGaps(0, [])).toEqual({ filled: 0, open: 0, over: 0 });
  });
});

describe("rankCandidates", () => {
  const slot = { workDate: "2026-12-12", plannedStart: "08:00", plannedEnd: "16:00" }; // 450 net (30 break)
  const base = { dayShifts: [], recentShifts: [], unavailableNote: undefined };
  it("orders usual → other → unavailable, then by hours left after, then name", () => {
    const ranked = rankCandidates(slot, [
      { ...base, staffMemberId: "a", displayName: "Anna", usual: false, leftMinutes: 1200 },
      { ...base, staffMemberId: "b", displayName: "Ben", usual: true, leftMinutes: 600 },
      { ...base, staffMemberId: "c", displayName: "Cem", usual: false, leftMinutes: 1200 },
      { ...base, staffMemberId: "d", displayName: "Dora", usual: true, leftMinutes: 2000, unavailableNote: "nur bis 15 Uhr" },
      { ...base, staffMemberId: "e", displayName: "Eva", usual: false, leftMinutes: 1800 },
    ]);
    expect(ranked.map((c) => c.staffMemberId)).toEqual(["b", "e", "a", "c", "d"]);
    expect(ranked[4]).toMatchObject({ group: "unavailable", flags: ["unavailable"], unavailableNote: "nur bis 15 Uhr" });
    expect(ranked[0]).toMatchObject({ leftBefore: 600, leftAfter: 150 });
  });
  it("flags over budget after, already scheduled, overlap and ArbZG", () => {
    const [c] = rankCandidates(slot, [
      {
        ...base,
        staffMemberId: "a",
        displayName: "Anna",
        usual: false,
        leftMinutes: 300,
        dayShifts: [{ workDate: "2026-12-12", status: "confirmed", plannedStart: "14:00", plannedEnd: "20:00", actualStart: null, actualEnd: null, breakMinutes: 0 }],
        recentShifts: [{ workDate: "2026-12-12", status: "confirmed", plannedStart: "14:00", plannedEnd: "20:00", actualStart: null, actualEnd: null, breakMinutes: 0 }],
      },
    ]);
    expect(c?.flags).toEqual(["already_scheduled", "overlap", "over_budget_after", "worktime"]);
    expect(needsConfirmation(["already_scheduled"])).toBe(false);
    expect(needsConfirmation(["already_scheduled", "overlap"])).toBe(true);
  });
  it("slotMinutes deducts the statutory break", () => {
    expect(slotMinutes(slot)).toEqual({ net: 450, breakMinutes: 30 });
    expect(slotMinutes({ workDate: "2026-12-12", plannedStart: "08:00", plannedEnd: "12:00" })).toEqual({ net: 240, breakMinutes: 0 });
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm --filter @marktwerk/core test -- planning`
Expected: FAIL with missing exports.

- [ ] **Step 3: Implement (append to `planning.ts`; add the new imports at the top)**

```ts
import { rowsForDay, SCHEDULE_KINDS, type ScheduleKind, type ScheduleRow } from "../events/schedule";
import type { ShiftStatus } from "./hours"; // if ShiftStatus lives elsewhere, import from where worktime.ts gets it
import {
  ARBZG_STATUTORY_LIMITS,
  checkWorkingTime,
  effectiveSpan,
  requiredBreakMinutes,
  shiftCounts,
  shiftLength,
  type WorkingTimeLimits,
  type WorkingTimeWarning,
} from "./worktime";

export type StaffingRow = { dutyRoleKey: string; count: number; scheduleKind: ScheduleKind };
export const MAX_STAFFING_ROWS = 20;
export const MAX_HEADCOUNT = 30;

/** "Personalbedarf" of a market (or event): null when the shape is wrong. Role + kind is unique. */
export function parseStaffing(input: unknown): StaffingRow[] | null {
  if (!Array.isArray(input) || input.length > MAX_STAFFING_ROWS) return null;
  const seen = new Set<string>();
  const rows: StaffingRow[] = [];
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") return null;
    const { dutyRoleKey, count, scheduleKind } = raw as Record<string, unknown>;
    if (typeof dutyRoleKey !== "string" || dutyRoleKey.trim() === "") return null;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > MAX_HEADCOUNT) return null;
    if (typeof scheduleKind !== "string" || !(SCHEDULE_KINDS as readonly string[]).includes(scheduleKind)) return null;
    const key = `${dutyRoleKey}|${scheduleKind}`;
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({ dutyRoleKey, count, scheduleKind: scheduleKind as ScheduleKind });
  }
  return rows;
}

export type NeedDraft = {
  workDate: string;
  dutyRoleKey: string;
  scheduleKind: ScheduleKind;
  headcount: number;
  plannedStart: string | null;
  plannedEnd: string | null;
};

/**
 * The needs of an event: per day (the day before included) and staffing row, the window of that kind that day.
 * The team's own row wins; without one, any row of that kind that day (earliest from, latest to). No row of that
 * kind that day = no need that day.
 */
export function needsFromStaffing(
  staffing: readonly StaffingRow[],
  schedule: readonly ScheduleRow[],
  startsOn: string,
  durationDays: number,
): NeedDraft[] {
  const needs: NeedDraft[] = [];
  for (let dayIndex = -1; dayIndex < durationDays; dayIndex += 1) {
    const rows = rowsForDay(schedule, dayIndex, durationDays);
    if (rows.length === 0) continue;
    const workDate = addDays(startsOn, dayIndex);
    for (const row of staffing) {
      if (row.count === 0) continue;
      const ofKind = rows.filter((r) => r.kind === row.scheduleKind);
      const team = ofKind.filter((r) => r.audience === "team");
      const pick = team.length > 0 ? team : ofKind;
      if (pick.length === 0) continue;
      const from = pick.map((r) => r.from).sort()[0] ?? null;
      const to = pick.map((r) => r.to).sort().at(-1) ?? null;
      needs.push({
        workDate,
        dutyRoleKey: row.dutyRoleKey,
        scheduleKind: row.scheduleKind,
        headcount: row.count,
        plannedStart: from,
        plannedEnd: to,
      });
    }
  }
  const kindOrder = (k: ScheduleKind) => SCHEDULE_KINDS.indexOf(k);
  return needs.sort(
    (a, b) =>
      (a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : 0) ||
      kindOrder(a.scheduleKind) - kindOrder(b.scheduleKind),
  );
}

/** Filled = requested + confirmed (declined and cancelled reopen the slot). */
export function needGaps(
  headcount: number,
  statuses: readonly ShiftStatus[],
): { filled: number; open: number; over: number } {
  const filled = statuses.filter((s) => s === "requested" || s === "confirmed").length;
  return { filled, open: Math.max(0, headcount - filled), over: Math.max(0, filled - headcount) };
}

/** Net minutes of a planned slot with the statutory break deducted (the break a new shift gets). */
export function slotMinutes(slot: {
  workDate: string;
  plannedStart: string;
  plannedEnd: string;
}): { net: number; breakMinutes: number } {
  const gross = shiftLength({ workDate: slot.workDate, start: slot.plannedStart, end: slot.plannedEnd, breakMinutes: 0 })?.netMinutes ?? 0;
  // The break depends on the work time, which depends on the break: ArbZG counts work without breaks.
  let breakMinutes = requiredBreakMinutes(gross);
  if (requiredBreakMinutes(gross - breakMinutes) < breakMinutes) breakMinutes = requiredBreakMinutes(gross - breakMinutes);
  return { net: gross - breakMinutes, breakMinutes };
}

export type CandidateInput = {
  staffMemberId: string;
  displayName: string;
  /** Verantwortlich for this role at this event, or the role is among their preferred roles. */
  usual: boolean;
  /** Budget left this month before the new shift. */
  leftMinutes: number;
  /** undefined = available; null = unavailable without a note. */
  unavailableNote: string | null | undefined;
  /** Shifts of this person on the slot's day (any event). */
  dayShifts: readonly ShiftTimesInput[];
  /** Shifts of the day before, the day and the day after (for the ArbZG check). */
  recentShifts: readonly ShiftTimesInput[];
};

export type CandidateFlag = "unavailable" | "already_scheduled" | "overlap" | "over_budget_after" | "worktime";

export type Candidate = {
  staffMemberId: string;
  displayName: string;
  group: "usual" | "other" | "unavailable";
  leftBefore: number;
  leftAfter: number;
  flags: CandidateFlag[];
  unavailableNote: string | null;
  worktime: WorkingTimeWarning[];
};

/** Every warning but a plain "already has a shift that day" needs one confirmation (nothing blocks). */
export function needsConfirmation(flags: readonly CandidateFlag[]): boolean {
  return flags.some((f) => f !== "already_scheduled");
}

/** The picker's order and flags (spec §4.5). */
export function rankCandidates(
  slot: { workDate: string; plannedStart: string; plannedEnd: string },
  people: readonly CandidateInput[],
  limits: WorkingTimeLimits = ARBZG_STATUTORY_LIMITS,
): Candidate[] {
  const { net, breakMinutes } = slotMinutes(slot);
  const newSpan = { workDate: slot.workDate, start: slot.plannedStart, end: slot.plannedEnd, breakMinutes };
  const candidates = people.map((p): Candidate => {
    const flags: CandidateFlag[] = [];
    const unavailable = p.unavailableNote !== undefined;
    if (unavailable) flags.push("unavailable");
    const active = p.dayShifts.filter((s) => shiftCounts(s.status));
    if (active.length > 0) flags.push("already_scheduled");
    const spans = p.recentShifts
      .filter((s) => shiftCounts(s.status))
      .flatMap((s) => {
        const span = effectiveSpan(s);
        return span ? [span] : [];
      });
    const warnings = checkWorkingTime([...spans, newSpan], limits).filter(
      (w) => w.date === slot.workDate || ("previousDate" in w && w.previousDate === slot.workDate),
    );
    if (warnings.some((w) => w.code === "overlap")) flags.push("overlap");
    const leftAfter = p.leftMinutes - net;
    if (leftAfter < 0) flags.push("over_budget_after");
    const worktime = warnings.filter((w) => w.code !== "overlap");
    if (worktime.length > 0) flags.push("worktime");
    return {
      staffMemberId: p.staffMemberId,
      displayName: p.displayName,
      group: unavailable ? "unavailable" : p.usual ? "usual" : "other",
      leftBefore: p.leftMinutes,
      leftAfter,
      flags,
      unavailableNote: unavailable ? (p.unavailableNote ?? null) : null,
      worktime,
    };
  });
  const groupOrder = { usual: 0, other: 1, unavailable: 2 } as const;
  return candidates.sort(
    (a, b) =>
      groupOrder[a.group] - groupOrder[b.group] ||
      b.leftAfter - a.leftAfter ||
      a.displayName.localeCompare(b.displayName, "de"),
  );
}
```

Notes for the implementer:
- `ShiftStatus` is exported from `@marktwerk/core`. Find where it is declared with
  `grep -rn "export type ShiftStatus" packages/core/src` and import it from there.
- `ARBZG_STATUTORY_LIMITS` is the constant just above `requiredBreakMinutes` in `worktime.ts`. If it isn't
  exported, export it.
- In the flag test: Anna's other shift is 14–20 and the new slot is 08–16, so they overlap ("overlap"). 450 net min
  against 300 left is over budget. 8 h + 6 h on one day exceeds 10 h ("worktime").

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm --filter @marktwerk/core test -- planning`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core && git commit -m "feat(core): staffing rows, needs from the Zeitplan, gaps and candidate ranking"
```

---

### Task 4: Schema and migration

**Files:**
- Modify: `packages/db/src/schema/staff.ts` (after `shift`, plus a column on `employmentContract` and `shift`)
- Modify: `packages/db/src/schema/events.ts` (type + two columns)
- Modify: `packages/db/src/schema/settings.ts`
- Generated: `packages/db/drizzle/00NN_shift_planning.sql` (number assigned by drizzle-kit)

**Interfaces:**
- Produces:
  - Drizzle tables `shiftNeed` and `staffUnavailability`
  - columns `shift.needId`, `employmentContract.monthlyHourBudget`, `eventPreset.staffing`, `event.staffing`,
    `settings.defaultMonthlyHourBudget`
  - type `StaffingRowValue`

- [ ] **Step 1: `events.ts`. Add the type below `DefaultDuties`, then the columns**

```ts
/** "Personalbedarf" (shift allocator, 2026-11-26): same shape as `StaffingRow` in @marktwerk/core. */
export type StaffingRowValue = {
  dutyRoleKey: string;
  count: number;
  scheduleKind: "setup" | "open" | "teardown";
};
```

In `eventPreset`, after `defaultDuties`:

```ts
    /** Personalbedarf per role and Zeitplan part; copied into every new event of this market (like the Zeitplan). */
    staffing: jsonb().$type<StaffingRowValue[]>().notNull().default([]),
```

In `event`, after `schedule`:

```ts
    /** The event's Personalbedarf: copied from the market at instantiation; its needs are `shift_need` rows. */
    staffing: jsonb().$type<StaffingRowValue[]>().notNull().default([]),
```

- [ ] **Step 2: `staff.ts`**

Add `monthlyHourBudget` to `employmentContract`, after `contractedHoursPerWeek`:

```ts
    /** Planning budget in hours per month (shift allocator). Null = settings.default_monthly_hour_budget. */
    monthlyHourBudget: numeric({ precision: 5, scale: 2, mode: "number" }),
```

and extend its `employment_contract_amounts` check with
``and (${t.monthlyHourBudget} is null or ${t.monthlyHourBudget} >= 0)``.

Above `shift`, import `scheduleKind`-compatible text and add:

```ts
export const scheduleKind = app.enum("schedule_kind", ["setup", "open", "teardown"]);

/**
 * What one event day needs for one role and Zeitplan part (shift allocator, spec §3): how many people, and the
 * times new shifts for it start with. Gaps are computed (headcount − requested/confirmed shifts), never stored.
 */
export const shiftNeed = app.table(
  "shift_need",
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    workDate: date().notNull(),
    dutyRoleId: uuid()
      .notNull()
      .references(() => dutyRole.id, { onDelete: "restrict" }),
    scheduleKind: scheduleKind().notNull(),
    headcount: integer().notNull(),
    plannedStart: time(),
    plannedEnd: time(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.eventId, t.workDate, t.dutyRoleId, t.scheduleKind),
    index().on(t.workDate),
    check("shift_need_headcount", sql`${t.headcount} between 0 and 30`),
    check(
      "shift_need_times",
      sql`(${t.plannedStart} is null) = (${t.plannedEnd} is null)`,
    ),
  ],
);
```

In `shift`, after `dutyRoleId`:

```ts
    /** The need (slot) this shift fills; null = entered without one (office hours, an extra helper). */
    needId: uuid().references(() => shiftNeed.id, { onDelete: "set null" }),
```

and add `index().on(t.needId)` to its indexes. Because `shiftNeed` must be declared before `shift`, put it right
above `shift`.

After `shiftRevision`:

```ts
/** "Nicht verfügbar" (shift allocator): entered by the office from WhatsApp. Warns in the planner, never blocks. */
export const staffUnavailability = app.table(
  "staff_unavailability",
  {
    id: id(),
    staffMemberId: uuid()
      .notNull()
      .references(() => staffMember.id, { onDelete: "cascade" }),
    date: date().notNull(),
    note: text(),
    createdByStaffMemberId: uuid().references(() => staffMember.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [unique().on(t.staffMemberId, t.date), index().on(t.date)],
);
```

Check that `time`, `unique`, `check` and `sql` are already imported in `staff.ts`, and add any that are missing.

- [ ] **Step 3: `settings.ts`. After `permitHorizonDays`**

```ts
    /** Shift planning: hours per month a person may be planned for when their contract sets none (company policy). */
    defaultMonthlyHourBudget: numeric({ precision: 5, scale: 2, mode: "number" }).notNull().default(40),
```

plus the check
``check("settings_hour_budget_range", sql`${t.defaultMonthlyHourBudget} between 0 and 200`)``.
Import `numeric`.

- [ ] **Step 4: Generate and apply the migration**

Run: `pnpm db:up && pnpm db:generate --name shift_planning && pnpm db:migrate`
Expected:
- a new `packages/db/drizzle/00NN_shift_planning.sql` that creates `schedule_kind`, `shift_need` and
  `staff_unavailability` and adds the 5 columns;
- the migrate command reports it applied.

Read the SQL. It must not drop or rewrite existing data.

- [ ] **Step 5: Checks and commit**

Run: `pnpm check`
Expected: PASS. The DB schema tests in `packages/db` still pass.

```bash
git add packages/db && git commit -m "feat(db): shift_need, staff_unavailability, staffing and hour budget columns"
```

---

### Task 5: Needs follow the single instantiation and move paths

**Files:**
- Create: `apps/web/src/server/services/staffing.ts`
- Modify: `apps/web/src/server/services/events.ts` (`EventTemplate`, `presetTemplate`, `manualTemplate`, `instantiateEvents`)
- Modify: `apps/web/src/server/services/event-details.ts` (`applySchedule`, the return value of `moveEvent`)
- Modify: `apps/web/src/server/services/shifts.ts` (`needId` in `ShiftInput`, `Fields`, `fieldsOf`, `toDbValues`)
- Modify: `apps/web/src/server/services/presets.ts` (staffing in `PresetInput`, `assertShape`, `normalize`, insert and update)
- Test: `apps/web/test/integration/shift-planning.test.ts` (new; Task 6 extends it)

**Interfaces:**
- Consumes: `needsFromStaffing`, `parseStaffing`, `StaffingRow` (Task 3); schema (Task 4).
- Produces:
  - `createNeedsTx(tx: Tx, events: { id: string; startsOn: string; durationDays: number; staffing: StaffingRow[]; schedule: Schedule }[]): Promise<number>`:
    inserts the missing needs and returns how many were created; idempotent through `onConflictDoNothing`
  - `moveNeedsTx(tx: Tx, actor: Actor, eventId: string, offsetDays: number, next: { startsOn: string; endsOn: string }): Promise<{ reset: string[] }>`
  - `EventTemplate.staffing: StaffingRow[]`
  - `ShiftInput.needId?: string | null`
  - `PresetInput.staffing?: StaffingRow[]` (left out = keep the stored value; a new preset gets `[]`)
  - `moveEvent` result gains `confirmationsReset: number`

- [ ] **Step 1: Write the failing integration tests**

```ts
// apps/web/test/integration/shift-planning.test.ts
import { dutyRole, event, eventPreset, shift, shiftNeed, staffMember } from "@marktwerk/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { moveEvent } from "@/server/services/event-details";
import { createEventsFromPreset } from "@/server/services/events";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let crewRoleId: string;
let crewKey: string;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  const [role] = await db.select().from(dutyRole).orderBy(asc(dutyRole.sort)).limit(1);
  if (!role) throw new Error("seedCatalogue has no duty roles");
  crewRoleId = role.id;
  crewKey = role.key;
  await db
    .update(eventPreset)
    .set({
      staffing: [
        { dutyRoleKey: crewKey, count: 2, scheduleKind: "setup" },
        { dutyRoleKey: crewKey, count: 1, scheduleKind: "open" },
      ],
    })
    .where(eq(eventPreset.id, cat.presets.flea.id));
});

const needsOf = (eventId: string) =>
  db.select().from(shiftNeed).where(eq(shiftNeed.eventId, eventId)).orderBy(asc(shiftNeed.workDate), asc(shiftNeed.scheduleKind));

describe("needs from the preset", () => {
  it("a new event copies the staffing and gets one need per day and kind", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    if (!created) throw new Error("no event");
    const [row] = await db.select().from(event).where(eq(event.id, created.id));
    expect(row?.staffing).toHaveLength(2);
    const needs = await needsOf(created.id);
    expect(needs.map((n) => [n.workDate, n.scheduleKind, n.headcount])).toEqual([
      ["2026-12-13", "setup", 2],
      ["2026-12-13", "open", 1],
    ]);
    expect(needs[0]?.dutyRoleId).toBe(crewRoleId);
  });

  it("editing the preset later does not touch existing events", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    await db.update(eventPreset).set({ staffing: [] }).where(eq(eventPreset.id, cat.presets.flea.id));
    expect(await needsOf(created!.id)).toHaveLength(2);
  });
});

describe("moveEvent moves needs and resets confirmations", () => {
  it("moves needs and linked shifts by the offset; confirmed → requested", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(created!.id);
    const [person] = await db.insert(staffMember).values({ displayName: "Anna A.", firstName: "Anna", lastName: "A." }).returning();
    await db.insert(shift).values({
      eventId: created!.id,
      staffMemberId: person!.id,
      dutyRoleId: crewRoleId,
      needId: need!.id,
      workDate: "2026-12-13",
      plannedStart: "06:00",
      plannedEnd: "08:00",
      status: "confirmed",
    });
    const result = await moveEvent(owner, created!.id, "2026-12-20", "2026-12-13");
    expect(result.confirmationsReset).toBe(1);
    const needs = await needsOf(created!.id);
    expect(needs.every((n) => n.workDate === "2026-12-20")).toBe(true);
    const [moved] = await db.select().from(shift).where(eq(shift.needId, need!.id));
    expect(moved).toMatchObject({ workDate: "2026-12-20", status: "requested", version: 2 });
  });
});
```

The expected needs assume the flea preset in `seedCatalogue` uses the default Zeitplan: vendors' setup on the
first day 06–08, visitors' open each day, and no `before` row. Read `seedCatalogue` first. If its schedule
differs, set the preset's `schedule` to `defaultSchedule()` in this `beforeEach` (import it from `@marktwerk/core`)
so the expectations here and in Task 6 (setup 06:00–08:00) hold.

`seedCatalogue` (`test/helpers/fixtures.ts`) must create at least one `duty_role`. If it doesn't, insert one in
`beforeEach` (`db.insert(dutyRole).values({ key: "crew", nameDe: "Crew", nameEn: "Crew" })`).

Run: `pnpm --filter web test:integration -- shift-planning`
Expected: FAIL. `staffing` is unknown on the insert, and no needs are created.

- [ ] **Step 2: `shifts.ts`. Carry `needId`**

In `ShiftInput`, add `needId?: string | null;`. In `fieldsOf`, add `needId: row.needId,`. In `toDbValues`, add
`needId: f.needId ?? null,`. In `checkIds`, add
`if (fields.needId != null && !UUID.test(fields.needId)) throw new ShiftInputError("invalid_event");`.
The type `Fields` stays `Omit<ShiftInput,"status"> & {status}`, so `needId` is optional there too.

- [ ] **Step 3: Create `staffing.ts`**

```ts
// apps/web/src/server/services/staffing.ts
import "server-only";
import { addDays, daysBetween, needsFromStaffing, type Schedule, type StaffingRow } from "@marktwerk/core";
import { dutyRole, shift, shiftNeed, shiftRevision } from "@marktwerk/db/schema";
import { and, eq, gt, inArray, lt, or } from "drizzle-orm";
import type { Actor } from "../actor";
import type { db } from "../db";
import { audit } from "./audit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Needs of events from their staffing × days × Zeitplan (spec §5). Inside the caller's transaction: called by
 * `instantiateEvents` (the one instantiation path) and by "Personalbedarf aus Vorlage übernehmen". Existing needs
 * stay as they are (idempotent); roles that no longer exist are skipped.
 */
export async function createNeedsTx(
  tx: Tx,
  events: readonly {
    id: string;
    startsOn: string;
    durationDays: number;
    staffing: readonly StaffingRow[];
    schedule: Schedule;
  }[],
): Promise<number> {
  if (events.every((e) => e.staffing.length === 0)) return 0;
  const roles = await tx.select({ id: dutyRole.id, key: dutyRole.key }).from(dutyRole);
  const roleId = new Map(roles.map((r) => [r.key, r.id]));
  const values = events.flatMap((e) =>
    needsFromStaffing(e.staffing, e.schedule, e.startsOn, e.durationDays).flatMap((n) => {
      const id = roleId.get(n.dutyRoleKey);
      return id
        ? [
            {
              eventId: e.id,
              workDate: n.workDate,
              dutyRoleId: id,
              scheduleKind: n.scheduleKind,
              headcount: n.headcount,
              plannedStart: n.plannedStart,
              plannedEnd: n.plannedEnd,
            },
          ]
        : [];
    }),
  );
  if (values.length === 0) return 0;
  const inserted = await tx.insert(shiftNeed).values(values).onConflictDoNothing().returning({ id: shiftNeed.id });
  return inserted.length;
}

/**
 * Part of the one anchor-shift path (`applySchedule`): the event's needs and their linked planned shifts move by
 * the same number of days. Moved "bestätigt" shifts go back to "angefragt" (the person agreed to the old date), with
 * a shift_revision each. Needs that fall outside the new days (a shorter event) are deleted; their shifts stay,
 * unlinked, under "Weitere Schichten".
 */
export async function moveNeedsTx(
  tx: Tx,
  actor: Actor,
  eventId: string,
  offsetDays: number,
  next: { startsOn: string; endsOn: string },
): Promise<{ reset: string[] }> {
  const needs = await tx.select().from(shiftNeed).where(eq(shiftNeed.eventId, eventId));
  if (needs.length === 0) return { reset: [] };
  const reset: string[] = [];
  if (offsetDays !== 0) {
    // Two steps so the unique key never collides while dates move past each other.
    for (const need of needs)
      await tx.update(shiftNeed).set({ workDate: addDays(need.workDate, offsetDays + 10_000) }).where(eq(shiftNeed.id, need.id));
    for (const need of needs)
      await tx.update(shiftNeed).set({ workDate: addDays(need.workDate, offsetDays) }).where(eq(shiftNeed.id, need.id));

    const linked = await tx
      .select()
      .from(shift)
      .where(and(inArray(shift.needId, needs.map((n) => n.id)), inArray(shift.status, ["requested", "confirmed"])))
      .for("update");
    for (const current of linked) {
      const workDate = addDays(current.workDate, offsetDays);
      const status = current.status === "confirmed" ? "requested" : current.status;
      if (current.status === "confirmed") reset.push(current.id);
      await tx.insert(shiftRevision).values({
        shiftId: current.id,
        version: current.version,
        reason: "Veranstaltung verschoben",
        before: JSON.parse(JSON.stringify(current)) as Record<string, unknown>,
        changedByStaffMemberId: actor.staffMemberId,
      });
      await tx.update(shift).set({ workDate, status, version: current.version + 1 }).where(eq(shift.id, current.id));
      await audit(tx, actor.id, [
        {
          action: "shift.update",
          entityType: "shift",
          entityId: current.id,
          diff: {
            reason: "event_move",
            before: { workDate: current.workDate, status: current.status },
            after: { workDate, status },
          },
        },
      ]);
    }
  }
  // Day before = startsOn − 1 is still part of the event's days for needs.
  const first = addDays(next.startsOn, -1);
  await tx
    .delete(shiftNeed)
    .where(and(eq(shiftNeed.eventId, eventId), or(lt(shiftNeed.workDate, first), gt(shiftNeed.workDate, next.endsOn))));
  return { reset };
}

export { daysBetween };
```

Drop the trailing `export { daysBetween }` if Biome flags it. It is only there so `event-details.ts` can import
`daysBetween` from one place; importing it from `@marktwerk/core` directly is fine too.

The `+10_000` step: `addDays` gives a date about 27 years away, which is safe against the unique key. Check that
`addDays` accepts it. If it doesn't, drop the unique constraint for the move by deleting and re-inserting the needs
in this function, keeping their ids.

- [ ] **Step 4: `events.ts`. Template and instantiation**

```ts
// EventTemplate: add
  /** Personalbedarf every new event gets a copy of (shift allocator); empty for events without a preset. */
  staffing: StaffingRow[];
```

In `presetTemplate`, add `staffing: preset.staffing,`. In `manualTemplate`'s returned object, add `staffing: [],`.
In `instantiateEvents`, add `staffing: template.staffing.map((row) => ({ ...row })),` to the `event` insert values.
After the loop, before `instantiateTemplatesForEvents`:

```ts
  // Shift allocator: the needs of the new days (one service path, same transaction).
  await createNeedsTx(
    tx,
    created.map((c, i) => {
      const day = days[i];
      const durationDays = typeof day === "string" || day === undefined ? template.durationDays : day.durationDays;
      return { id: c.id, startsOn: c.startsOn, durationDays, staffing: template.staffing, schedule: template.schedule };
    }),
  );
```

Import `createNeedsTx` from `./staffing` and `StaffingRow` from `@marktwerk/core`. Search for other places that
build an `EventTemplate`: `grep -rn "EventTemplate\b\|: EventTemplate" apps/web/src`. Each one needs `staffing`
(`[]` unless it comes from a preset).

- [ ] **Step 5: `event-details.ts`. Hook into `applySchedule`**

In `applySchedule`, after the anchor upsert loop and before `shiftTasks`:

```ts
  const staffingMove = await moveNeedsTx(
    tx,
    actor,
    current.id,
    daysBetween(current.startsOn, next.startsOn),
    { startsOn: next.startsOn, endsOn: next.endsOn },
  );
```

Add `confirmationsReset: number` to its return type and value (`confirmationsReset: staffingMove.reset.length`).
In `moveEvent`:
- add `confirmationsReset` to the result type;
- use `confirmationsReset: 0` on the unchanged return;
- pass through `confirmationsReset` from `applySchedule` on the changed return;
- add `...(confirmationsReset > 0 ? { confirmationsReset } : {})` to the audit diff.

`updateEventBasics` also calls `applySchedule`. Destructure and ignore the new field there; its audit may log it the
same way.

- [ ] **Step 6: `presets.ts`. Staffing on the Vorlage**

- `PresetInput`: add `staffing?: StaffingRow[];` (left out = keep stored; a new preset gets `[]`).
- `assertShape`: add `&& (input.staffing === undefined || parseStaffing(input.staffing) !== null)`.
- `normalize`: add `staffing: input.staffing === undefined ? undefined : (parseStaffing(input.staffing) ?? []),`.
- In the checks that validate `defaultDuties` keys against `duty_role.key` (lines ~148–210), validate
  `staffing[].dutyRoleKey` against the same set of known keys. On an unknown key, throw
  `new PresetInputError("invalid_input")`.
- Insert (around line 374): `staffing: input.staffing ?? [],`. Update (around line 576):
  `...(input.staffing !== undefined ? { staffing: input.staffing } : {}),`.
- The form row type (lines ~228/246/268): add `staffing: row.staffing` so the form gets it.

- [ ] **Step 7: Run the tests and see them pass**

Run: `pnpm --filter web test:integration -- shift-planning`
Expected: PASS (3 tests).
Then: `pnpm --filter web test:integration`
Expected: everything still green, in particular the event move and event creation suites.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(staffing): needs from preset staffing at instantiation; needs and shifts move with the event"
```

---

### Task 6: Planning services and server actions

**Files:**
- Create: `apps/web/src/server/services/shift-planning.ts`
- Create: `apps/web/src/app/(app)/team/planung/actions.ts`
- Modify: `apps/web/test/integration/shift-planning.test.ts`

**Interfaces:**
- Consumes: `createShift`, `updateShift`, `ShiftInputError` (`shifts.ts`); `createNeedsTx` (Task 5);
  `rankCandidates`, `needsConfirmation`, `slotMinutes`, `CandidateFlag` (Task 3). Task 6 also creates
  `queries/planning-candidates.ts` (`loadCandidateInputs`, `defaultHourBudget`), and Task 7 reuses it.
- Produces:
  - `class PlanningInputError extends Error { code: "not_found" | "invalid_input" | "needs_confirmation"; flags?: CandidateFlag[] }`
  - `assignToNeed(actor, needId: string, staffMemberId: string, opts?: { confirm?: boolean; today?: string }): Promise<{ shiftId: string; shortNotice: boolean }>`
  - `setShiftStatus(actor, shiftId: string, status: "requested" | "confirmed" | "declined" | "cancelled", expectedVersion: number): Promise<{ previous: ShiftStatus; version: number }>`
  - `updateNeed(actor, needId: string, patch: { headcount?: number; plannedStart?: string | null; plannedEnd?: string | null }): Promise<void>`
  - `setUnavailability(actor, staffMemberId: string, from: string, to: string, note: string | null): Promise<{ dates: string[] }>`
  - `clearUnavailability(actor, staffMemberId: string, dates: string[]): Promise<void>`
  - `applyPresetStaffing(actor, eventId: string): Promise<{ created: number }>`
  - `setDefaultHourBudget(actor, hours: number): Promise<void>`
  - actions: `assignToNeedAction`, `setShiftStatusAction`, `updateNeedAction`, `setUnavailabilityAction`,
    `clearUnavailabilityAction`, `applyPresetStaffingAction`, `setDefaultHourBudgetAction`, all returning
    `ActionResult<T>` (re-use the type from `team/actions.ts`)

- [ ] **Step 1: Write the failing tests (append)**

```ts
import { auditLog, staffUnavailability } from "@marktwerk/db/schema";
import {
  applyPresetStaffing,
  assignToNeed,
  PlanningInputError,
  setShiftStatus,
  setUnavailability,
  updateNeed,
} from "@/server/services/shift-planning";

const isForbidden = (error: unknown) => String((error as { digest?: unknown })?.digest ?? "").includes("403");

async function person(name: string) {
  const [p] = await db.insert(staffMember).values({ displayName: name, firstName: name, lastName: "T." }).returning();
  return p!;
}

describe("assigning and answering", () => {
  it("assign → requested with the need's times; decline reopens; undo restores", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const anna = await person("Anna");
    const { shiftId, shortNotice } = await assignToNeed(owner, need!.id, anna.id, { today: "2026-11-26" });
    expect(shortNotice).toBe(false);
    const [row] = await db.select().from(shift).where(eq(shift.id, shiftId));
    expect(row).toMatchObject({ status: "requested", needId: need!.id, plannedStart: "06:00:00", plannedEnd: "08:00:00" });

    const declined = await setShiftStatus(owner, shiftId, "declined", row!.version);
    expect(declined.previous).toBe("requested");
    const undone = await setShiftStatus(owner, shiftId, declined.previous as "requested", declined.version);
    expect(undone.version).toBe(declined.version + 1);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, shiftId));
    expect(audits.map((a) => a.action)).toEqual(["shift.create", "shift.update", "shift.update"]);
  });

  it("a warning without confirmation is refused, with confirmation saved", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const ben = await person("Ben");
    await setUnavailability(owner, ben.id, "2026-12-13", "2026-12-13", "Urlaub");
    await expect(assignToNeed(owner, need!.id, ben.id, { today: "2026-11-26" })).rejects.toMatchObject({
      code: "needs_confirmation",
      flags: ["unavailable"],
    });
    await expect(assignToNeed(owner, need!.id, ben.id, { today: "2026-11-26", confirm: true })).resolves.toMatchObject({ shortNotice: false });
  });

  it("short notice when the day is less than 4 days ahead", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const cem = await person("Cem");
    expect((await assignToNeed(owner, need!.id, cem.id, { today: "2026-12-11" })).shortNotice).toBe(true);
  });

  it("staff and field roles are refused", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const dora = await person("Dora");
    for (const role of ["staff", "field"] as const) {
      const actor = await createActor(role, `${role}2@test.local`);
      await assignToNeed(actor, need!.id, dora.id).then(
        () => expect.fail("allowed"),
        (e) => expect(isForbidden(e)).toBe(true),
      );
    }
  });
});

describe("needs and unavailability", () => {
  it("updateNeed changes one day only and is audited", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    await updateNeed(owner, need!.id, { headcount: 3, plannedStart: "05:30", plannedEnd: "08:00" });
    const [row] = await db.select().from(shiftNeed).where(eq(shiftNeed.id, need!.id));
    expect(row).toMatchObject({ headcount: 3, plannedStart: "05:30:00" });
    await expect(updateNeed(owner, need!.id, { headcount: -1 })).rejects.toBeInstanceOf(PlanningInputError);
  });

  it("setUnavailability writes one row per day and replaces the note on repeat", async () => {
    const eva = await person("Eva");
    expect((await setUnavailability(owner, eva.id, "2026-12-12", "2026-12-14", null)).dates).toHaveLength(3);
    await setUnavailability(owner, eva.id, "2026-12-13", "2026-12-13", "nur bis 15 Uhr");
    const rows = await db.select().from(staffUnavailability).where(eq(staffUnavailability.staffMemberId, eva.id)).orderBy(asc(staffUnavailability.date));
    expect(rows.map((r) => r.note)).toEqual([null, "nur bis 15 Uhr", null]);
  });

  it("applyPresetStaffing is idempotent for events created before the preset had staffing", async () => {
    await db.update(eventPreset).set({ staffing: [] }).where(eq(eventPreset.id, cat.presets.flea.id));
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    await db.update(eventPreset).set({ staffing: [{ dutyRoleKey: crewKey, count: 1, scheduleKind: "open" }] }).where(eq(eventPreset.id, cat.presets.flea.id));
    expect((await applyPresetStaffing(owner, ev!.id)).created).toBe(1);
    expect((await applyPresetStaffing(owner, ev!.id)).created).toBe(0);
  });
});
```

Run: `pnpm --filter web test:integration -- shift-planning`
Expected: FAIL, "Cannot find module @/server/services/shift-planning".

- [ ] **Step 2: Implement the service**

```ts
// apps/web/src/server/services/shift-planning.ts
import "server-only";
import {
  addDays,
  can,
  type CandidateFlag,
  eachDay,
  isClockTime,
  isIsoDate,
  MAX_HEADCOUNT,
  needsConfirmation,
  parseStaffing,
  rankCandidates,
  type ShiftStatus,
  shortNotice as isShortNotice,
  slotMinutes,
} from "@marktwerk/core";
import { event, eventPreset, settings, shift, shiftNeed, staffMember, staffUnavailability } from "@marktwerk/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { loadCandidateInputs } from "../queries/planning-candidates";
import { audit } from "./audit";
import { createShift, updateShift } from "./shifts";
import { createNeedsTx } from "./staffing";

export type PlanningError = "not_found" | "invalid_input" | "needs_confirmation";

export class PlanningInputError extends Error {
  constructor(
    readonly code: PlanningError,
    readonly flags: CandidateFlag[] = [],
  ) {
    super(code);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;
const berlinToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
const MAX_UNAVAILABLE_DAYS = 62;
const STATUS_REASON: Record<string, string> = {
  requested: "Status: angefragt",
  confirmed: "Status: bestätigt",
  declined: "Status: abgesagt",
  cancelled: "Entfernt",
};

function assertManage(actor: Actor) {
  if (!can(actor.role, "team", "manage")) forbidden();
}

async function loadNeed(needId: string) {
  if (!UUID.test(needId)) throw new PlanningInputError("not_found");
  const [need] = await db.select().from(shiftNeed).where(eq(shiftNeed.id, needId));
  if (!need) throw new PlanningInputError("not_found");
  return need;
}

/**
 * "Einplanen" (spec §5): a new shift for this need, angefragt, with the need's times and the statutory break.
 * Warnings (nicht verfügbar, über Budget, ArbZG, overlap) are checked here too: without `confirm` they come back as
 * `needs_confirmation` with the flags, nothing saved. Goes through `createShift` (one path, audited).
 */
export async function assignToNeed(
  actor: Actor,
  needId: string,
  staffMemberId: string,
  opts: { confirm?: boolean; today?: string } = {},
): Promise<{ shiftId: string; shortNotice: boolean }> {
  assertManage(actor);
  const need = await loadNeed(needId);
  if (!need.plannedStart || !need.plannedEnd) throw new PlanningInputError("invalid_input");
  const slot = { workDate: need.workDate, plannedStart: need.plannedStart.slice(0, 5), plannedEnd: need.plannedEnd.slice(0, 5) };
  const inputs = await loadCandidateInputs({ ...slot, eventId: need.eventId, dutyRoleId: need.dutyRoleId }, [staffMemberId]);
  const [candidate] = rankCandidates(slot, inputs);
  if (!candidate) throw new PlanningInputError("not_found");
  if (needsConfirmation(candidate.flags) && !opts.confirm)
    throw new PlanningInputError("needs_confirmation", candidate.flags);

  const created = await createShift(
    actor,
    {
      eventId: need.eventId,
      staffMemberId,
      dutyRoleId: need.dutyRoleId,
      needId: need.id,
      workDate: need.workDate,
      plannedStart: slot.plannedStart,
      plannedEnd: slot.plannedEnd,
      actualStart: null,
      actualEnd: null,
      breakMinutes: slotMinutes(slot).breakMinutes,
      status: "requested",
    },
    { today: opts.today },
  );
  return { shiftId: created.id, shortNotice: isShortNotice(need.workDate, opts.today ?? berlinToday()) };
}

/** angefragt ↔ bestätigt, abgesagt, Entfernen (= cancelled, never deleted). Undo passes the previous status back. */
export async function setShiftStatus(
  actor: Actor,
  shiftId: string,
  status: "requested" | "confirmed" | "declined" | "cancelled",
  expectedVersion: number,
): Promise<{ previous: ShiftStatus; version: number }> {
  assertManage(actor);
  if (!UUID.test(shiftId)) throw new PlanningInputError("not_found");
  const [current] = await db.select({ status: shift.status }).from(shift).where(eq(shift.id, shiftId));
  if (!current) throw new PlanningInputError("not_found");
  const result = await updateShift(actor, shiftId, { status }, STATUS_REASON[status] ?? "Status", expectedVersion);
  return { previous: current.status, version: result.version };
}

/** Headcount and times of one day's need ("only this day": the preset and the other days stay). */
export async function updateNeed(
  actor: Actor,
  needId: string,
  patch: { headcount?: number; plannedStart?: string | null; plannedEnd?: string | null },
): Promise<void> {
  assertManage(actor);
  const need = await loadNeed(needId);
  const next = {
    headcount: patch.headcount ?? need.headcount,
    plannedStart: patch.plannedStart === undefined ? need.plannedStart?.slice(0, 5) ?? null : patch.plannedStart,
    plannedEnd: patch.plannedEnd === undefined ? need.plannedEnd?.slice(0, 5) ?? null : patch.plannedEnd,
  };
  if (!Number.isInteger(next.headcount) || next.headcount < 0 || next.headcount > MAX_HEADCOUNT)
    throw new PlanningInputError("invalid_input");
  if ((next.plannedStart === null) !== (next.plannedEnd === null)) throw new PlanningInputError("invalid_input");
  if (next.plannedStart !== null && (!isClockTime(next.plannedStart) || !isClockTime(next.plannedEnd ?? "")))
    throw new PlanningInputError("invalid_input");
  await db.transaction(async (tx) => {
    await tx.update(shiftNeed).set(next).where(eq(shiftNeed.id, needId));
    await audit(tx, actor.id, [
      {
        action: "shift_need.update",
        entityType: "shift_need",
        entityId: needId,
        diff: {
          before: { headcount: need.headcount, plannedStart: need.plannedStart, plannedEnd: need.plannedEnd },
          after: next,
        },
      },
    ]);
  });
}

/** "Nicht verfügbar" from–to: one row per day; a repeat replaces the note. */
export async function setUnavailability(
  actor: Actor,
  staffMemberId: string,
  from: string,
  to: string,
  note: string | null,
): Promise<{ dates: string[] }> {
  assertManage(actor);
  if (!UUID.test(staffMemberId) || !isIsoDate(from) || !isIsoDate(to) || to < from)
    throw new PlanningInputError("invalid_input");
  const dates = eachDay(from, to);
  if (dates.length > MAX_UNAVAILABLE_DAYS) throw new PlanningInputError("invalid_input");
  const clean = note?.trim() ? note.trim().slice(0, 200) : null;
  return db.transaction(async (tx) => {
    const [person] = await tx.select({ id: staffMember.id }).from(staffMember).where(and(eq(staffMember.id, staffMemberId), isNull(staffMember.archivedAt)));
    if (!person) throw new PlanningInputError("not_found");
    await tx
      .insert(staffUnavailability)
      .values(dates.map((date) => ({ staffMemberId, date, note: clean, createdByStaffMemberId: actor.staffMemberId })))
      .onConflictDoUpdate({ target: [staffUnavailability.staffMemberId, staffUnavailability.date], set: { note: clean } });
    await audit(tx, actor.id, [
      { action: "staff_unavailability.set", entityType: "staff_member", entityId: staffMemberId, diff: { from, to, note: clean } },
    ]);
    return { dates };
  });
}

export async function clearUnavailability(actor: Actor, staffMemberId: string, dates: string[]): Promise<void> {
  assertManage(actor);
  if (!UUID.test(staffMemberId) || dates.length === 0 || !dates.every(isIsoDate)) throw new PlanningInputError("invalid_input");
  await db.transaction(async (tx) => {
    await tx
      .delete(staffUnavailability)
      .where(and(eq(staffUnavailability.staffMemberId, staffMemberId), inArray(staffUnavailability.date, dates)));
    await audit(tx, actor.id, [
      { action: "staff_unavailability.clear", entityType: "staff_member", entityId: staffMemberId, diff: { dates } },
    ]);
  });
}

/**
 * "Personalbedarf aus Vorlage übernehmen" (decision 2026-11-26: no backfill): copies the market's current staffing
 * into this event and creates the missing needs. A deliberate action; existing needs stay.
 */
export async function applyPresetStaffing(actor: Actor, eventId: string): Promise<{ created: number }> {
  assertManage(actor);
  if (!UUID.test(eventId)) throw new PlanningInputError("not_found");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: event.id, startsOn: event.startsOn, endsOn: event.endsOn, schedule: event.schedule, presetStaffing: eventPreset.staffing })
      .from(event)
      .innerJoin(eventPreset, eq(eventPreset.id, event.presetId))
      .where(and(eq(event.id, eventId), isNull(event.archivedAt)));
    if (!row) throw new PlanningInputError("not_found");
    const staffing = parseStaffing(row.presetStaffing) ?? [];
    await tx.update(event).set({ staffing }).where(eq(event.id, eventId));
    const durationDays = Math.round((Date.parse(row.endsOn) - Date.parse(row.startsOn)) / 86_400_000) + 1;
    const created = await createNeedsTx(tx, [{ id: row.id, startsOn: row.startsOn, durationDays, staffing, schedule: row.schedule }]);
    await audit(tx, actor.id, [
      { action: "event.staffing_apply", entityType: "event", entityId: eventId, diff: { staffing, created } },
    ]);
    return { created };
  });
}

/** Einstellungen → Rechtliches → Planung: the default hour budget (company policy). */
export async function setDefaultHourBudget(actor: Actor, hours: number): Promise<void> {
  if (!can(actor.role, "settings", "write")) forbidden();
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0 || hours > 200 || Math.round(hours * 2) !== hours * 2)
    throw new PlanningInputError("invalid_input");
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ hours: settings.defaultMonthlyHourBudget }).from(settings);
    await tx.update(settings).set({ defaultMonthlyHourBudget: hours }).where(eq(settings.id, 1));
    await audit(tx, actor.id, [
      { action: "settings.update", entityType: "settings", entityId: "1", diff: { defaultMonthlyHourBudget: { from: before?.hours ?? null, to: hours } } },
    ]);
  });
}
```

Notes:
- `eachDay`, `isClockTime` and `isIsoDate` are in `@marktwerk/core`; check them with
  `grep -n "export function eachDay\|export function isClockTime" packages/core/src -r`.
- Check the `settings` permission name with `grep -n "settings:" packages/core/src/auth/permissions.ts`. Use the
  write action that `updateCompanySettings` checks.
- Check that `entityId` on `audit_log` accepts the string "1" (see how `updateCompanySettings` audits settings) and
  copy that.
- Use `addDays` or drop it from the import, depending on what Biome reports.

- [ ] **Step 3: Candidate inputs loader (`apps/web/src/server/queries/planning-candidates.ts`)**

```ts
// apps/web/src/server/queries/planning-candidates.ts
import "server-only";
import {
  addDays,
  budgetStatus,
  type CandidateInput,
  DEFAULT_MONTHLY_HOUR_BUDGET,
  hourBudget,
  monthStart,
  monthUsage,
} from "@marktwerk/core";
import { employmentContract, eventDuty, settings, shift, staffMember, staffUnavailability } from "@marktwerk/db/schema";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** The default budget in hours from settings (company policy, 40 h unless changed). */
export async function defaultHourBudget(): Promise<number> {
  const [row] = await db.select({ hours: settings.defaultMonthlyHourBudget }).from(settings);
  return row?.hours ?? DEFAULT_MONTHLY_HOUR_BUDGET;
}

/**
 * Everything `rankCandidates` needs for one slot: active staff (or only `only`), whether they are "usual" for this
 * role here, budget left this month, nicht verfügbar that day, and their shifts around the day.
 */
export async function loadCandidateInputs(
  slot: { workDate: string; eventId: string; dutyRoleId: string },
  only?: readonly string[],
): Promise<CandidateInput[]> {
  const month = monthStart(slot.workDate);
  const monthTo = addDays(monthStart(addDays(month, 32)), -1);
  const people = await db
    .select({ id: staffMember.id, displayName: staffMember.displayName, preferred: staffMember.preferredDutyRoleIds })
    .from(staffMember)
    .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt), only ? inArray(staffMember.id, [...only]) : undefined))
    .orderBy(asc(staffMember.displayName));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);
  const duty = await db
    .select({ staffMemberId: eventDuty.staffMemberId })
    .from(eventDuty)
    .where(and(eq(eventDuty.eventId, slot.eventId), eq(eventDuty.dutyRoleId, slot.dutyRoleId)));
  const shifts = await db
    .select()
    .from(shift)
    .where(and(inArray(shift.staffMemberId, ids), gte(shift.workDate, addDays(month, -1)), lte(shift.workDate, addDays(monthTo, 1))));
  const contracts = await db
    .select({ staffMemberId: employmentContract.staffMemberId, validFrom: employmentContract.validFrom, validUntil: employmentContract.validUntil, monthlyHourBudget: employmentContract.monthlyHourBudget })
    .from(employmentContract)
    .where(and(inArray(employmentContract.staffMemberId, ids), lte(employmentContract.validFrom, monthTo), or(isNull(employmentContract.validUntil), gte(employmentContract.validUntil, month))));
  const away = await db
    .select({ staffMemberId: staffUnavailability.staffMemberId, note: staffUnavailability.note })
    .from(staffUnavailability)
    .where(and(inArray(staffUnavailability.staffMemberId, ids), eq(staffUnavailability.date, slot.workDate)));
  const fallback = await defaultHourBudget();
  const usual = new Set(duty.map((d) => d.staffMemberId));
  const awayNote = new Map(away.map((a) => [a.staffMemberId, a.note]));
  return people.map((p) => {
    const own = shifts
      .filter((s) => s.staffMemberId === p.id)
      .map((s) => ({ ...s, plannedStart: hhmm(s.plannedStart), plannedEnd: hhmm(s.plannedEnd), actualStart: hhmm(s.actualStart), actualEnd: hhmm(s.actualEnd) }));
    const budget = hourBudget(contracts.filter((c) => c.staffMemberId === p.id), month, fallback);
    const status = budgetStatus(monthUsage(own, month), budget.minutes);
    return {
      staffMemberId: p.id,
      displayName: p.displayName,
      usual: usual.has(p.id) || p.preferred.includes(slot.dutyRoleId),
      leftMinutes: status.leftMinutes,
      unavailableNote: awayNote.has(p.id) ? (awayNote.get(p.id) ?? null) : undefined,
      dayShifts: own.filter((s) => s.workDate === slot.workDate),
      recentShifts: own.filter((s) => s.workDate >= addDays(slot.workDate, -1) && s.workDate <= addDays(slot.workDate, 1)),
    };
  });
}
```

`monthEnd` exists in core (`staff/hours.ts`). You can use `monthEnd(month)` instead of the `addDays(…32)`
construction. That's simpler, so prefer it.

- [ ] **Step 4: Server actions (`app/(app)/team/planung/actions.ts`)**

```ts
"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  applyPresetStaffing,
  assignToNeed,
  clearUnavailability,
  PlanningInputError,
  setDefaultHourBudget,
  setShiftStatus,
  setUnavailability,
  updateNeed,
} from "@/server/services/shift-planning";
import { ShiftInputError } from "@/server/services/shifts";
import { requirePermission } from "@/server/session";
import type { ActionResult } from "../actions";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T> | { ok: false; error: "needs_confirmation"; flags: string[] }> {
  await requirePermission("team", "manage");
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof PlanningInputError)
      return error.code === "needs_confirmation"
        ? { ok: false, error: "needs_confirmation", flags: error.flags }
        : { ok: false, error: error.code };
    if (error instanceof ShiftInputError) {
      if (error.code === "conflict" || error.code === "period_locked") refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

export async function assignToNeedAction(needId: string, staffMemberId: string, confirm = false) {
  return run(async () => assignToNeed(await getActor(), needId, staffMemberId, { confirm }));
}
export async function setShiftStatusAction(shiftId: string, status: "requested" | "confirmed" | "declined" | "cancelled", version: number) {
  return run(async () => setShiftStatus(await getActor(), shiftId, status, version));
}
export async function updateNeedAction(needId: string, patch: { headcount?: number; plannedStart?: string | null; plannedEnd?: string | null }) {
  return run(async () => updateNeed(await getActor(), needId, patch));
}
export async function setUnavailabilityAction(staffMemberId: string, from: string, to: string, note: string | null) {
  return run(async () => setUnavailability(await getActor(), staffMemberId, from, to, note));
}
export async function clearUnavailabilityAction(staffMemberId: string, dates: string[]) {
  return run(async () => clearUnavailability(await getActor(), staffMemberId, dates));
}
export async function applyPresetStaffingAction(eventId: string) {
  return run(async () => applyPresetStaffing(await getActor(), eventId));
}
export async function setDefaultHourBudgetAction(hours: number) {
  await requirePermission("settings", "write");
  return run(async () => setDefaultHourBudget(await getActor(), hours));
}
```

Check the exact name of the settings write action and use it in both the service and here.

- [ ] **Step 5: Run the tests and see them pass**

Run: `pnpm --filter web test:integration -- shift-planning`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(planning): assign to need, status answers with undo, need edits, unavailability, preset staffing"
```

---

### Task 7: Planning queries (month grid + event day blocks)

**Files:**
- Create: `apps/web/src/server/queries/planning.ts`
- Modify: `apps/web/test/integration/shift-planning.test.ts`

**Interfaces:**
- Consumes: `loadCandidateInputs`, `defaultHourBudget` (Task 6); core planning functions; `isoWeek`, `eachDay`,
  `monthEnd`.
- Produces:
  ```ts
  type PlanningShift = { id: string; version: number; eventId: string | null; needId: string | null; workDate: string;
    status: ShiftStatus; plannedStart: string | null; plannedEnd: string | null; roleName: string | null;
    marketShortCode: string | null; marketColor: string | null };
  type PlanningNeed = { id: string; eventId: string; eventName: string; workDate: string; dutyRoleId: string; roleName: string;
    scheduleKind: ScheduleKind; headcount: number; plannedStart: string | null; plannedEnd: string | null;
    filled: number; open: number; over: number; marketShortCode: string | null; marketColor: string | null };
  type PlanningPerson = { staffMemberId: string; displayName: string; usual: boolean; budgetMinutes: number;
    noContract: boolean; usage: MonthUsage; leftMinutes: number; level: BudgetLevel;
    weeks: Record<string, number>; shiftsByDay: Record<string, PlanningShift[]>; unavailable: Record<string, string | null> };
  type PlanningMonth = { month: string; days: string[]; weeks: { key: string; week: number; days: string[] }[];
    needsByDay: Record<string, PlanningNeed[]>; people: PlanningPerson[] };
  getPlanningMonth(month: string, opts?: { allDays?: boolean }): Promise<PlanningMonth>
  type EventPlanningDay = { workDate: string; needs: (PlanningNeed & { shifts: (PlanningShift & { displayName: string })[] })[] };
  getEventPlanning(eventId: string): Promise<{ days: EventPlanningDay[]; loose: (PlanningShift & { displayName: string })[]; canApplyPreset: boolean; openTotal: number }>
  listCandidates(needId: string): Promise<Candidate[]>
  ```
  Week keys are `"2026-W49"`. `days` holds only the days with needs unless `allDays` is set.

- [ ] **Step 1: Failing test (append)**

```ts
import { getEventPlanning, getPlanningMonth, listCandidates } from "@/server/queries/planning";

describe("planning queries", () => {
  it("month: people with budget, week totals, needs with gaps; event: day blocks and candidates", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const needs = await needsOf(ev!.id);
    const anna = await person("Anna");
    await assignToNeed(owner, needs[0]!.id, anna.id, { today: "2026-11-26" }); // setup 06–08 = 120 min

    const month = await getPlanningMonth("2026-12-01");
    expect(month.days).toEqual(["2026-12-13"]);
    expect(month.needsByDay["2026-12-13"]?.map((n) => [n.scheduleKind, n.open])).toEqual([["setup", 1], ["open", 1]]);
    const row = month.people.find((p) => p.staffMemberId === anna.id)!;
    expect(row).toMatchObject({ budgetMinutes: 2400, noContract: true, leftMinutes: 2280, level: "ok" });
    expect(row.usage.requestedMinutes).toBe(120);
    expect(row.weeks["2026-W50"]).toBe(120);

    const plan = await getEventPlanning(ev!.id);
    expect(plan.openTotal).toBe(2);
    expect(plan.days[0]?.needs[0]?.shifts[0]?.displayName).toBe("Anna");

    const candidates = await listCandidates(needs[1]!.id);
    // createActor may add a staff member for the owner, so look Anna up rather than taking the first row.
    expect(candidates.find((c) => c.staffMemberId === anna.id)?.flags).toContain("already_scheduled");
  });
});
```

Run: `pnpm --filter web test:integration -- shift-planning`
Expected: FAIL (module missing).

- [ ] **Step 2: Implement `planning.ts`**

```ts
// apps/web/src/server/queries/planning.ts
import "server-only";
import {
  type BudgetLevel,
  budgetStatus,
  type Candidate,
  eachDay,
  hourBudget,
  isoWeek,
  monthEnd,
  type MonthUsage,
  monthStart,
  monthUsage,
  needGaps,
  rankCandidates,
  type ScheduleKind,
  type ShiftStatus,
  weekTotals,
} from "@marktwerk/core";
import { dutyRole, employmentContract, event, eventPreset, shift, shiftNeed, staffMember, staffUnavailability } from "@marktwerk/db/schema";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";
import { defaultHourBudget, loadCandidateInputs } from "./planning-candidates";

export type PlanningShift = {
  id: string;
  version: number;
  eventId: string | null;
  needId: string | null;
  workDate: string;
  status: ShiftStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  roleName: string | null;
  marketShortCode: string | null;
  marketColor: string | null;
};
export type PlanningNeed = {
  id: string;
  eventId: string;
  eventName: string;
  workDate: string;
  dutyRoleId: string;
  roleName: string;
  scheduleKind: ScheduleKind;
  headcount: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  filled: number;
  open: number;
  over: number;
  marketShortCode: string | null;
  marketColor: string | null;
};
export type PlanningPerson = {
  staffMemberId: string;
  displayName: string;
  usual: boolean;
  budgetMinutes: number;
  noContract: boolean;
  usage: MonthUsage;
  leftMinutes: number;
  level: BudgetLevel;
  /** "2026-W49" → minutes (information only). */
  weeks: Record<string, number>;
  shiftsByDay: Record<string, PlanningShift[]>;
  /** date → note (null = no note) for "nicht verfügbar". */
  unavailable: Record<string, string | null>;
};
export type PlanningMonth = {
  month: string;
  days: string[];
  weeks: { key: string; week: number; days: string[] }[];
  needsByDay: Record<string, PlanningNeed[]>;
  people: PlanningPerson[];
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const weekKey = (date: string) => {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
};
const KIND_ORDER: Record<ScheduleKind, number> = { setup: 0, open: 1, teardown: 2 };

async function loadNeeds(where: ReturnType<typeof and>) {
  const rows = await db
    .select({
      id: shiftNeed.id,
      eventId: shiftNeed.eventId,
      eventName: event.name,
      workDate: shiftNeed.workDate,
      dutyRoleId: shiftNeed.dutyRoleId,
      roleName: dutyRole.nameDe,
      scheduleKind: shiftNeed.scheduleKind,
      headcount: shiftNeed.headcount,
      plannedStart: shiftNeed.plannedStart,
      plannedEnd: shiftNeed.plannedEnd,
      marketShortCode: eventPreset.shortCode,
      marketColor: eventPreset.color,
    })
    .from(shiftNeed)
    .innerJoin(event, eq(event.id, shiftNeed.eventId))
    .innerJoin(dutyRole, eq(dutyRole.id, shiftNeed.dutyRoleId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(and(where, isNull(event.archivedAt)))
    .orderBy(asc(shiftNeed.workDate), asc(event.name));
  return rows.sort((a, b) => (a.workDate === b.workDate ? KIND_ORDER[a.scheduleKind] - KIND_ORDER[b.scheduleKind] : 0));
}

async function loadShifts(where: ReturnType<typeof and>) {
  return db
    .select({
      id: shift.id,
      version: shift.version,
      staffMemberId: shift.staffMemberId,
      displayName: staffMember.displayName,
      eventId: shift.eventId,
      needId: shift.needId,
      workDate: shift.workDate,
      status: shift.status,
      plannedStart: shift.plannedStart,
      plannedEnd: shift.plannedEnd,
      actualStart: shift.actualStart,
      actualEnd: shift.actualEnd,
      breakMinutes: shift.breakMinutes,
      roleName: dutyRole.nameDe,
      marketShortCode: eventPreset.shortCode,
      marketColor: eventPreset.color,
    })
    .from(shift)
    .innerJoin(staffMember, eq(staffMember.id, shift.staffMemberId))
    .leftJoin(dutyRole, eq(dutyRole.id, shift.dutyRoleId))
    .leftJoin(event, eq(event.id, shift.eventId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(where);
}

type ShiftRowDb = Awaited<ReturnType<typeof loadShifts>>[number];
const toPlanningShift = (s: ShiftRowDb): PlanningShift => ({
  id: s.id,
  version: s.version,
  eventId: s.eventId,
  needId: s.needId,
  workDate: s.workDate,
  status: s.status,
  plannedStart: hhmm(s.plannedStart),
  plannedEnd: hhmm(s.plannedEnd),
  roleName: s.roleName,
  marketShortCode: s.marketShortCode,
  marketColor: s.marketColor,
});
const timesOf = (s: ShiftRowDb) => ({
  workDate: s.workDate,
  status: s.status,
  plannedStart: hhmm(s.plannedStart),
  plannedEnd: hhmm(s.plannedEnd),
  actualStart: hhmm(s.actualStart),
  actualEnd: hhmm(s.actualEnd),
  breakMinutes: s.breakMinutes,
});

function withGaps(
  needs: Awaited<ReturnType<typeof loadNeeds>>,
  shifts: readonly ShiftRowDb[],
): PlanningNeed[] {
  return needs.map((n) => ({
    ...n,
    plannedStart: hhmm(n.plannedStart),
    plannedEnd: hhmm(n.plannedEnd),
    ...needGaps(n.headcount, shifts.filter((s) => s.needId === n.id).map((s) => s.status)),
  }));
}

/** Team → Planung: people × market days of one month (spec §6). */
export async function getPlanningMonth(monthInput: string, opts: { allDays?: boolean } = {}): Promise<PlanningMonth> {
  const month = monthStart(monthInput);
  const to = monthEnd(month);
  const inMonth = (col: typeof shift.workDate | typeof shiftNeed.workDate) => and(gte(col, month), lte(col, to));
  const needs = await loadNeeds(inMonth(shiftNeed.workDate));
  const shifts = await loadShifts(inMonth(shift.workDate));
  const people = await db
    .select({ id: staffMember.id, displayName: staffMember.displayName, preferred: staffMember.preferredDutyRoleIds })
    .from(staffMember)
    .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
    .orderBy(asc(staffMember.displayName));
  const contracts = await db
    .select({ staffMemberId: employmentContract.staffMemberId, validFrom: employmentContract.validFrom, validUntil: employmentContract.validUntil, monthlyHourBudget: employmentContract.monthlyHourBudget })
    .from(employmentContract)
    .where(and(lte(employmentContract.validFrom, to), or(isNull(employmentContract.validUntil), gte(employmentContract.validUntil, month))));
  const away = await db.select().from(staffUnavailability).where(and(gte(staffUnavailability.date, month), lte(staffUnavailability.date, to)));
  const fallback = await defaultHourBudget();

  const planningNeeds = withGaps(needs, shifts);
  const needsByDay: Record<string, PlanningNeed[]> = {};
  for (const n of planningNeeds) (needsByDay[n.workDate] ??= []).push(n);
  const neededRoles = new Set(planningNeeds.map((n) => n.dutyRoleId));
  const days = opts.allDays ? eachDay(month, to) : Object.keys(needsByDay).sort();
  const weeks: PlanningMonth["weeks"] = [];
  for (const day of days) {
    const key = weekKey(day);
    const last = weeks.at(-1);
    if (last?.key === key) last.days.push(day);
    else weeks.push({ key, week: isoWeek(day).week, days: [day] });
  }

  const rows: PlanningPerson[] = people.map((p) => {
    const own = shifts.filter((s) => s.staffMemberId === p.id);
    const budget = hourBudget(contracts.filter((c) => c.staffMemberId === p.id), month, fallback);
    const usage = monthUsage(own.map(timesOf), month);
    const status = budgetStatus(usage, budget.minutes);
    const shiftsByDay: Record<string, PlanningShift[]> = {};
    for (const s of own) (shiftsByDay[s.workDate] ??= []).push(toPlanningShift(s));
    const unavailable: Record<string, string | null> = {};
    for (const a of away) if (a.staffMemberId === p.id) unavailable[a.date] = a.note;
    return {
      staffMemberId: p.id,
      displayName: p.displayName,
      usual: p.preferred.some((id) => neededRoles.has(id)),
      budgetMinutes: budget.minutes,
      noContract: budget.noContract,
      usage,
      leftMinutes: status.leftMinutes,
      level: status.level,
      weeks: Object.fromEntries(weekTotals(own.map(timesOf)).map((w) => [`${w.year}-W${String(w.week).padStart(2, "0")}`, w.minutes])),
      shiftsByDay,
      unavailable,
    };
  });
  rows.sort((a, b) => Number(b.usual) - Number(a.usual) || a.displayName.localeCompare(b.displayName, "de"));
  return { month, days, weeks, needsByDay, people: rows };
}

export type EventPlanningShift = PlanningShift & { displayName: string };
export type EventPlanningDay = { workDate: string; needs: (PlanningNeed & { shifts: EventPlanningShift[] })[] };

/** Event → Team: one block per day with its needs and their shifts; shifts without a need are "Weitere Schichten". */
export async function getEventPlanning(eventId: string): Promise<{
  days: EventPlanningDay[];
  loose: EventPlanningShift[];
  canApplyPreset: boolean;
  openTotal: number;
}> {
  const needs = await loadNeeds(and(eq(shiftNeed.eventId, eventId)));
  const shifts = await loadShifts(and(eq(shift.eventId, eventId)));
  const planningNeeds = withGaps(needs, shifts);
  const visible = (s: ShiftRowDb) => s.status !== "cancelled";
  const asEventShift = (s: ShiftRowDb): EventPlanningShift => ({ ...toPlanningShift(s), displayName: s.displayName });
  const byDay = new Map<string, EventPlanningDay>();
  for (const n of planningNeeds) {
    const day = byDay.get(n.workDate) ?? { workDate: n.workDate, needs: [] };
    day.needs.push({ ...n, shifts: shifts.filter((s) => s.needId === n.id && visible(s)).map(asEventShift) });
    byDay.set(n.workDate, day);
  }
  const [preset] = await db
    .select({ staffing: eventPreset.staffing })
    .from(event)
    .innerJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(eq(event.id, eventId));
  return {
    days: [...byDay.values()],
    loose: shifts.filter((s) => s.needId === null && visible(s)).map(asEventShift),
    canApplyPreset: needs.length === 0 && (preset?.staffing.length ?? 0) > 0,
    openTotal: planningNeeds.reduce((sum, n) => sum + n.open, 0),
  };
}

/** The picker for one need: ranked candidates with flags (spec §4.5). */
export async function listCandidates(needId: string): Promise<Candidate[]> {
  const [need] = await db.select().from(shiftNeed).where(eq(shiftNeed.id, needId));
  if (!need?.plannedStart || !need.plannedEnd) return [];
  const slot = { workDate: need.workDate, plannedStart: need.plannedStart.slice(0, 5), plannedEnd: need.plannedEnd.slice(0, 5) };
  const inputs = await loadCandidateInputs({ ...slot, eventId: need.eventId, dutyRoleId: need.dutyRoleId });
  return rankCandidates(slot, inputs);
}
```

Use the locale-dependent role name: `dutyRole.nameDe` is used here, and the UI swaps to `nameEn` on the `en`
locale. Select both columns (`roleNameDe`, `roleNameEn`) if `en` matters for the e2e test. Otherwise `nameDe` plus
a later follow-up is acceptable; say which one you chose in the PR.

- [ ] **Step 3: Run the tests and see them pass**

Run: `pnpm --filter web test:integration -- shift-planning`
Expected: PASS (11 tests).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(planning): month planning and event day-block queries with candidates"
```

---

### Task 8: Team → Planung grid

**Files:**
- Create: `apps/web/src/app/(app)/team/planung/page.tsx`
- Create: `apps/web/src/components/planning/planning-grid.tsx` (client component)
- Create: `apps/web/src/components/planning/budget-bar.tsx`
- Create: `apps/web/src/components/planning/shift-chip.tsx`
- Create: `apps/web/src/components/planning/planning-toasts.ts` (shared toast helpers for grid and event tab)
- Modify: `apps/web/src/components/team/team-nav.tsx` (tab `planning` first)
- Modify: `apps/web/src/app/(app)/team/page.tsx` (`TeamTabs active="people"` stays; the sidebar "Team" link goes to `/team/planung`)
- Modify: `apps/web/src/components/shell/app-sidebar.tsx` (Team href → `/team/planung`)
- Modify: `apps/web/messages/de.json`, `apps/web/messages/en.json` (namespace `planning`)

**Interfaces:**
- Consumes: `getPlanningMonth`, `PlanningMonth`, `PlanningNeed`, `PlanningShift` (Task 7); actions (Task 6).
- Produces:
  - `<BudgetBar usedMinutes budgetMinutes level requestedMinutes noContract />`
  - `<ShiftChip shift />`
  - `usePlanningActions()`, a hook that returns `assign(needId, staffMemberId, workDate, name)`,
    `setStatus(shift, status)`, `markUnavailable(...)` and `clearUnavailable(...)`, with toasts, undo and the
    confirmation loop. The event tab (Task 9) uses it too.

- [ ] **Step 1: Messages.** Add to both files. German values below; the English file gets the same keys with
  English values.

```json
"planning": {
  "title": "Planung",
  "allDays": "Alle Tage",
  "marketDays": "Nur Markttage",
  "noDays": "In diesem Monat gibt es keinen Personalbedarf. Lege ihn in der Vorlage unter „Personalbedarf“ an.",
  "budget": "{used} / {budget} h · {left} h frei",
  "budgetOver": "{used} / {budget} h · {over} h über Budget",
  "requestedPart": "davon {hours} h angefragt",
  "noContract": "kein Vertrag",
  "level": { "ok": "Im Budget", "tight": "Knapp", "over": "Über Budget" },
  "weekTotal": "KW {week}",
  "open": "{count} offen",
  "full": "Besetzt",
  "overNeed": "+{count} über Bedarf",
  "status": { "requested": "angefragt", "confirmed": "bestätigt", "declined": "abgesagt", "cancelled": "entfernt", "worked": "gearbeitet", "no_show": "nicht erschienen" },
  "unavailable": "nicht verfügbar",
  "menu": {
    "assign": "Einplanen…",
    "assignTo": "{market} · {role} · {from}–{to}",
    "markUnavailable": "Nicht verfügbar",
    "clearUnavailable": "Wieder verfügbar",
    "confirm": "Bestätigt",
    "decline": "Abgesagt",
    "request": "Wieder angefragt",
    "editTimes": "Zeiten ändern",
    "remove": "Entfernen"
  },
  "toast": {
    "assigned": "{name} am {date} eingeplant (angefragt)",
    "shortNotice": "Kurzfristig: nur mit Zustimmung (§ 12 TzBfG)",
    "status": "{name}: {status}",
    "unavailableSet": "{name} am {date} nicht verfügbar",
    "unavailableCleared": "{name} am {date} wieder verfügbar",
    "undo": "Rückgängig"
  },
  "confirm": {
    "title": "Trotzdem einplanen?",
    "unavailable": "{name} ist an dem Tag nicht verfügbar{note}.",
    "over_budget_after": "Danach über dem Stundenbudget.",
    "overlap": "Überschneidet sich mit einer anderen Schicht.",
    "worktime": "Arbeitszeitgesetz: Höchstarbeitszeit, Ruhezeit oder Pause verletzt.",
    "action": "Trotzdem einplanen",
    "cancel": "Abbrechen"
  },
  "error": "Das hat nicht geklappt. Bitte neu laden und noch einmal versuchen."
}
```

and in `team.tabs` add `"planning": "Planung"` (both files).

Run: `pnpm --filter web test`
Expected: PASS (the message key check finds both files in sync).

- [ ] **Step 2: Tabs.** In `team-nav.tsx`:

```ts
  active: "planning" | "people" | "hours" | "shifts";
  …
  const tabs = [
    { key: "planning", href: `/team/planung${suffix}` },
    { key: "people", href: "/team" },
    { key: "hours", href: `/team/stunden${suffix}` },
    { key: "shifts", href: `/team/schichten${suffix}` },
  ] as const;
```

Point the sidebar's Team entry at `/team/planung`. Keep `/team` itself as the Personen tab, so existing links and
the Vorschau `?person=` keep working.

- [ ] **Step 3: `budget-bar.tsx`** (server-safe; no hooks)

```tsx
import { CircleAlert, CircleCheck, CircleDot } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatMinutesAsHours } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICON = { ok: CircleCheck, tight: CircleDot, over: CircleAlert } as const;
const TONE = { ok: "text-success", tight: "text-warning", over: "text-danger" } as const;
const BAR = { ok: "bg-success", tight: "bg-warning", over: "bg-danger" } as const;

/** Month budget of one person: bar + "28 / 40 h · 12 h frei" + level as icon and text (colour never alone). */
export function BudgetBar(props: {
  usedMinutes: number;
  budgetMinutes: number;
  requestedMinutes: number;
  level: "ok" | "tight" | "over";
  noContract: boolean;
}) {
  const t = useTranslations("planning");
  const locale = useLocale();
  const h = (m: number) => formatMinutesAsHours(m, locale);
  const Icon = ICON[props.level];
  const left = props.budgetMinutes - props.usedMinutes;
  const pct = props.budgetMinutes > 0 ? Math.min(100, (props.usedMinutes / props.budgetMinutes) * 100) : 100;
  return (
    <div className="flex min-w-44 flex-col gap-0.5 text-xs">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className={cn("h-full", BAR[props.level])} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("inline-flex items-center gap-1 font-medium", TONE[props.level])}>
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{t(`level.${props.level}`)}: </span>
        {left >= 0
          ? t("budget", { used: h(props.usedMinutes), budget: h(props.budgetMinutes), left: h(left) })
          : t("budgetOver", { used: h(props.usedMinutes), budget: h(props.budgetMinutes), over: h(-left) })}
      </span>
      {(props.requestedMinutes > 0 || props.noContract) && (
        <span className="text-muted-foreground">
          {props.requestedMinutes > 0 && t("requestedPart", { hours: h(props.requestedMinutes) })}
          {props.requestedMinutes > 0 && props.noContract && " · "}
          {props.noContract && t("noContract")}
        </span>
      )}
    </div>
  );
}
```

Use the project's real token class names for the tones (`grep -rn "text-success\|text-warning" apps/web/src | head`).
`StatusBadge` in `components/ui/status-badge.tsx` may already map tones; prefer it if it fits.

- [ ] **Step 4: `shift-chip.tsx`**

```tsx
import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { useTranslations } from "next-intl";
import { MarketMarker } from "@/components/ui/market-marker";
import type { PlanningShift } from "@/server/queries/planning";

const ICON = { requested: CircleHelp, confirmed: CircleCheck, declined: CircleX } as const;

/** "ALT · Aufbau · 6–8" with ? angefragt / ✓ bestätigt; status in text for screen readers. */
export function ShiftChip({ shift }: { shift: PlanningShift }) {
  const t = useTranslations("planning");
  const Icon = ICON[shift.status as keyof typeof ICON] ?? CircleCheck;
  const time = shift.plannedStart && shift.plannedEnd ? `${shift.plannedStart.replace(/:00$/, "")}–${shift.plannedEnd.replace(/:00$/, "")}` : "";
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded border border-input bg-card px-1 py-0.5 text-[11px]">
      <MarketMarker color={shift.marketColor} />
      <span className="font-medium">{shift.marketShortCode ?? ""}</span>
      {shift.roleName && <span className="truncate text-muted-foreground">{shift.roleName}</span>}
      <span>{time}</span>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">{t(`status.${shift.status}`)}</span>
    </span>
  );
}
```

Read `components/ui/market-marker.tsx` for its real props and match them (it may take the preset colour key and a
fallback).

- [ ] **Step 5: `planning-toasts.ts`, the shared action hook**

```ts
"use client";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useShell } from "@/components/shell/shell-context";
import {
  assignToNeedAction,
  clearUnavailabilityAction,
  setShiftStatusAction,
  setUnavailabilityAction,
} from "@/app/(app)/team/planung/actions";

type Confirm = (flags: string[], name: string, note: string | null) => Promise<boolean>;

/** Every planning action with its toast and undo (UX concept: undo over confirmation; warnings ask once). */
export function usePlanningActions(confirmWarnings: Confirm) {
  const t = useTranslations("planning");
  const { showToast, showError } = useShell();
  const [pending, start] = useTransition();

  const assign = (needId: string, staffMemberId: string, name: string, dateLabel: string, note: string | null = null) =>
    start(async () => {
      let result = await assignToNeedAction(needId, staffMemberId);
      if (!result.ok && result.error === "needs_confirmation" && "flags" in result) {
        if (!(await confirmWarnings(result.flags, name, note))) return;
        result = await assignToNeedAction(needId, staffMemberId, true);
      }
      if (!result.ok) return showError(t("error"));
      const { shiftId, shortNotice } = result.data;
      showToast({
        message: `${t("toast.assigned", { name, date: dateLabel })}${shortNotice ? ` · ${t("toast.shortNotice")}` : ""}`,
        actionLabel: t("toast.undo"),
        onAction: async () => {
          // The new shift is at version 1; undo = Entfernen.
          await setShiftStatusAction(shiftId, "cancelled", 1);
        },
      });
    });

  const setStatus = (
    shift: { id: string; version: number },
    status: "requested" | "confirmed" | "declined" | "cancelled",
    name: string,
  ) =>
    start(async () => {
      const result = await setShiftStatusAction(shift.id, status, shift.version);
      if (!result.ok) return showError(t("error"));
      const { previous, version } = result.data;
      showToast({
        message: t("toast.status", { name, status: t(`status.${status}`) }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          await setShiftStatusAction(shift.id, previous as "requested", version);
        },
      });
    });

  const markUnavailable = (staffMemberId: string, date: string, name: string, dateLabel: string) =>
    start(async () => {
      const result = await setUnavailabilityAction(staffMemberId, date, date, null);
      if (!result.ok) return showError(t("error"));
      showToast({
        message: t("toast.unavailableSet", { name, date: dateLabel }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          await clearUnavailabilityAction(staffMemberId, [date]);
        },
      });
    });

  const clearUnavailable = (staffMemberId: string, date: string, note: string | null, name: string, dateLabel: string) =>
    start(async () => {
      const result = await clearUnavailabilityAction(staffMemberId, [date]);
      if (!result.ok) return showError(t("error"));
      showToast({
        message: t("toast.unavailableCleared", { name, date: dateLabel }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          await setUnavailabilityAction(staffMemberId, date, date, note);
        },
      });
    });

  return { pending, assign, setStatus, markUnavailable, clearUnavailable };
}
```

Check how the shell context is consumed (`grep -n "export function useShell\|useContext" apps/web/src/components/shell/shell-context.tsx`)
and use that hook name. The undo of an assignment is "Entfernen" at version 1. That matches only while nobody has
edited the shift; on a version conflict, the error toast is correct.

- [ ] **Step 6: The confirmation dialog + grid (`planning-grid.tsx`)**

The grid is a client component that receives the serialised `PlanningMonth`. It renders:
- a `<table>` with a sticky first column (name + `BudgetBar`);
- one `<th>` per day: weekday + date, market markers from `needsByDay[day]`, plus "N offen" with an amber icon or
  "Besetzt" with a check;
- after each week's last day, a narrow `<th>` "KW n" and per person a `<td>` with `weeks[key]` formatted as hours;
- a cell with chips, or a hatched "nicht verfügbar" cell (`bg-[repeating-linear-gradient(...)]` plus the text and
  the note in `title` and `aria-description`), or empty.

Keyboard: each cell is a `<button>` with `data-row` and `data-col`. An `onKeyDown` on the table moves focus with
the arrow keys, and Enter/Space opens the cell's menu.

The menu is a small popover anchored to the cell. Build it with the same pattern the project already uses for
menus; check with `grep -rln "role=\"menu\"" apps/web/src/components | head -3` and copy it. It lists:
- for each open need that day, `menu.assignTo` (market · role · times). If there is exactly one open need, the
  first entry reads `menu.assign` and assigns directly;
- `menu.markUnavailable` / `menu.clearUnavailable`;
- for each chip: `menu.confirm`, `menu.decline`, `menu.request` (only when not requested), `menu.editTimes` and
  `menu.remove`.

`menu.editTimes` opens the existing `ShiftDialog` (`components/team/shift-dialog.tsx`) for that shift. Read its
props and pass the shift id. Times then go through `updateShift`, with the revision and reason.

```tsx
"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { BudgetBar } from "./budget-bar";
import { ShiftChip } from "./shift-chip";
import { usePlanningActions } from "./planning-toasts";
import { useWarningConfirm } from "./warning-confirm";
import { formatDateWeekdayDay, formatMinutesAsHours, formatWeekdayDayMonth } from "@/lib/format";
import type { PlanningMonth, PlanningNeed, PlanningPerson, PlanningShift } from "@/server/queries/planning";

export function PlanningGrid({ data }: { data: PlanningMonth }) {
  const t = useTranslations("planning");
  const locale = useLocale();
  const { confirm, dialog } = useWarningConfirm();
  const actions = usePlanningActions(confirm);
  const [menu, setMenu] = useState<{ person: PlanningPerson; day: string; anchor: HTMLElement } | null>(null);
  const table = useRef<HTMLTableElement>(null);

  const move = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    const row = Number(el.dataset.row);
    const col = Number(el.dataset.col);
    if (Number.isNaN(row)) return;
    const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!delta) return;
    e.preventDefault();
    table.current?.querySelector<HTMLElement>(`[data-row="${row + delta[0]}"][data-col="${col + delta[1]}"]`)?.focus();
  };

  if (data.days.length === 0) return <p className="text-muted-foreground">{t("noDays")}</p>;

  const openNeeds = (day: string) => (data.needsByDay[day] ?? []).filter((n) => n.open > 0);
  const dayLabel = (day: string) => formatWeekdayDayMonth(day, locale);

  return (
    <>
      <div className="overflow-x-auto">
        <table ref={table} onKeyDown={move} className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card" />
              {data.weeks.flatMap((w) => [
                ...w.days.map((day) => <DayHeader key={day} day={day} needs={data.needsByDay[day] ?? []} />),
                <th key={w.key} className="px-1 text-xs text-muted-foreground">{t("weekTotal", { week: w.week })}</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {data.people.map((person, r) => {
              let c = 0;
              return (
                <tr key={person.staffMemberId}>
                  <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-medium">
                    <div>{person.displayName}</div>
                    <BudgetBar
                      usedMinutes={person.budgetMinutes - person.leftMinutes}
                      budgetMinutes={person.budgetMinutes}
                      requestedMinutes={person.usage.requestedMinutes}
                      level={person.level}
                      noContract={person.noContract}
                    />
                  </th>
                  {data.weeks.flatMap((w) => [
                    ...w.days.map((day) => {
                      const col = c++;
                      const shifts = (person.shiftsByDay[day] ?? []).filter((s) => s.status !== "cancelled");
                      const away = day in person.unavailable;
                      return (
                        <td key={day} className="border-t border-input p-0.5 align-top">
                          <button
                            type="button"
                            data-row={r}
                            data-col={col}
                            className={`flex min-h-10 w-28 flex-col items-start gap-0.5 rounded p-0.5 text-left focus-visible:ring-2 ${away ? "bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-sunken)_6px_12px)]" : ""}`}
                            aria-label={`${person.displayName}, ${dayLabel(day)}`}
                            onClick={(e) => setMenu({ person, day, anchor: e.currentTarget })}
                          >
                            {shifts.map((s) => <ShiftChip key={s.id} shift={s} />)}
                            {away && (
                              <span className="text-xs text-muted-foreground" title={person.unavailable[day] ?? undefined}>
                                {t("unavailable")}
                                {person.unavailable[day] ? `: ${person.unavailable[day]}` : ""}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    }),
                    <td key={w.key} className="border-t border-input px-1 text-right text-xs tabular-nums text-muted-foreground">
                      {person.weeks[w.key] ? formatMinutesAsHours(person.weeks[w.key] ?? 0, locale) : ""}
                    </td>,
                  ])}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {menu && (
        <CellMenu
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          items={[
            ...openNeeds(menu.day).map((need: PlanningNeed) => ({
              label: openNeeds(menu.day).length === 1 ? t("menu.assign") : t("menu.assignTo", { market: need.marketShortCode ?? need.eventName, role: need.roleName, from: need.plannedStart ?? "", to: need.plannedEnd ?? "" }),
              run: () => actions.assign(need.id, menu.person.staffMemberId, menu.person.displayName, dayLabel(menu.day), menu.person.unavailable[menu.day] ?? null),
            })),
            menu.day in menu.person.unavailable
              ? { label: t("menu.clearUnavailable"), run: () => actions.clearUnavailable(menu.person.staffMemberId, menu.day, menu.person.unavailable[menu.day] ?? null, menu.person.displayName, dayLabel(menu.day)) }
              : { label: t("menu.markUnavailable"), run: () => actions.markUnavailable(menu.person.staffMemberId, menu.day, menu.person.displayName, dayLabel(menu.day)) },
            ...(menu.person.shiftsByDay[menu.day] ?? [])
              .filter((s: PlanningShift) => s.status !== "cancelled")
              .flatMap((s: PlanningShift) => [
                ...(s.status !== "confirmed" ? [{ label: t("menu.confirm"), run: () => actions.setStatus(s, "confirmed", menu.person.displayName) }] : []),
                ...(s.status !== "declined" ? [{ label: t("menu.decline"), run: () => actions.setStatus(s, "declined", menu.person.displayName) }] : []),
                ...(s.status === "declined" || s.status === "confirmed" ? [{ label: t("menu.request"), run: () => actions.setStatus(s, "requested", menu.person.displayName) }] : []),
                { label: t("menu.remove"), run: () => actions.setStatus(s, "cancelled", menu.person.displayName) },
              ]),
          ]}
        />
      )}
      {dialog}
    </>
  );
}
```

`DayHeader` (same file, not exported) renders:
- the weekday and date via `formatDateWeekdayDay`;
- for each distinct market of that day's needs, a `MarketMarker` plus its Kürzel;
- the sum of `open`: if it is above 0, an amber `CircleDot` plus `t("open", { count })`; otherwise a `CircleCheck`
  plus `t("full")`; if the sum of `over` is above 0, also `t("overNeed", { count })`.

`CellMenu` (same file) is the project's popover/menu pattern, positioned at `anchor`. Items are buttons with
`role="menuitem"`; Escape closes it and returns focus to the anchor. Each item calls `run()` and then `onClose()`.

Leave out "Zeiten ändern" from `CellMenu` in this task if `ShiftDialog` needs more than a shift id; Task 9 adds it
to the event day list, where times are edited most. Note that in the PR.

`warning-confirm.tsx` (new, `components/planning/`) exports `useWarningConfirm()` → `{ confirm, dialog }`. `confirm`
returns a `Promise<boolean>`, resolved by a `Modal` (`components/ui/modal.tsx`; read its props) that shows:
- `confirm.title`;
- one line per flag (`confirm.unavailable` with `note` formatted as `: ${note}` or an empty string, then
  `confirm.over_budget_after`, `confirm.overlap`, `confirm.worktime`);
- the buttons `confirm.action` / `confirm.cancel`.

The UX concept prefers undo over confirmation dialogs. This dialog is the one confirmation the product owner decided
on for warnings (decision 2026-11-26, "Trotzdem einplanen").

- [ ] **Step 7: The page**

```tsx
// apps/web/src/app/(app)/team/planung/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PlanningGrid } from "@/components/planning/planning-grid";
import { Page } from "@/components/shell/page";
import { MonthSwitcher, TeamTabs, monthParam } from "@/components/team/team-nav";
import { todayIn } from "@/lib/format";
import { getPlanningMonth } from "@/server/queries/planning";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("planning"))("title") };
}

/** Team › Planung: people × market days with the month budget (spec §6). */
export default async function PlanningPage({ searchParams }: PageProps<"/team/planung">) {
  await requirePermission("team", "read");
  const sp = await searchParams;
  const [t, tNav, tTeam] = await Promise.all([getTranslations("planning"), getTranslations("nav"), getTranslations("team")]);
  const month = monthParam(typeof sp.month === "string" ? sp.month : undefined, todayIn());
  const allDays = sp.days === "all";
  const data = await getPlanningMonth(month, { allDays });
  const toggle = `/team/planung?month=${month.slice(0, 7)}${allDays ? "" : "&days=all"}`;
  return (
    <Page crumbs={[{ label: tNav("team"), href: "/team/planung" }, { label: tTeam("tabs.planning") }]} wide>
      <div className="flex flex-wrap items-center gap-3">
        <TeamTabs active="planning" month={month} />
        <MonthSwitcher path="/team/planung" month={month} />
        <Link href={toggle as never} className="text-sm underline">{allDays ? t("marketDays") : t("allDays")}</Link>
      </div>
      <PlanningGrid data={data} />
    </Page>
  );
}
```

Look in `team-nav.tsx` for the existing month switcher's name and props (it imports `ChevronLeft`/`ChevronRight`,
so there is one) and use it exactly. `PlanningGrid` gets plain data. `PlanningMonth` is JSON-safe: strings, numbers
and records.

`team:read` lets owner and manager view the page. The actions check `team:manage`.

- [ ] **Step 8: Verify in the browser**

Run the dev server with preview_start `{name: "web"}` (or the name in `.claude/launch.json`), then open
`/team/planung?month=2026-12`. Check that:
- the grid renders, or the "noDays" text shows until Task 11 seeds data. To get a need now, add staffing to one
  preset with SQL against the **local Docker DB only** and use "Markt planen" for a December date;
- clicking a cell → Einplanen → toast "… eingeplant (angefragt)" → Rückgängig removes it;
- the arrow keys move between cells.

Take a screenshot.

- [ ] **Step 9: `pnpm check` and commit**

```bash
git add -A && git commit -m "feat(planning): Team → Planung grid with budgets, week totals, gaps and cell menu"
```

---

### Task 9: Event Team tab: day blocks and picker

**Files:**
- Create: `apps/web/src/components/planning/event-planning.tsx` (server wrapper)
- Create: `apps/web/src/components/planning/day-blocks.tsx` (client)
- Create: `apps/web/src/components/planning/candidate-picker.tsx` (client)
- Create: `apps/web/src/app/(app)/team/planung/candidates-action.ts`, which holds `listCandidatesAction(needId)`
  (`team:read`)
- Modify: `apps/web/src/app/(app)/veranstaltungen/[id]/team/page.tsx`
- Modify: `apps/web/src/components/event-detail/overview-panels.tsx` (TeamSummaryPanel: "N offene Schichten")
- Modify: `de.json` / `en.json` (`planning.event.*`)

**Interfaces:**
- Consumes: `getEventPlanning`, `listCandidates` (Task 7); `usePlanningActions`, `useWarningConfirm`, `ShiftChip`
  (Task 8); `updateNeedAction` and `applyPresetStaffingAction` (Task 6).
- Produces: `<EventPlanning eventId canManage />`.

- [ ] **Step 1: Messages (both files)**

```json
"event": {
  "title": "Schichtplanung",
  "need": "{role} · {from}–{to} · {count} benötigt",
  "addPerson": "+ Person",
  "edit": "Bedarf ändern",
  "headcount": "Anzahl",
  "from": "von",
  "to": "bis",
  "save": "Speichern",
  "loose": "Weitere Schichten",
  "applyPreset": "Personalbedarf aus Vorlage übernehmen",
  "applied": "{count} Bedarfe angelegt",
  "none": "Für diese Veranstaltung ist kein Personalbedarf hinterlegt.",
  "openTotal": "{count, plural, =0 {Alle Schichten besetzt} one {# offene Schicht} other {# offene Schichten}}",
  "search": "Person suchen",
  "group": { "usual": "Üblich", "other": "Weitere", "unavailable": "Nicht verfügbar" },
  "left": "noch {before} h → {after} h",
  "flag": { "already_scheduled": "schon eingeplant", "overlap": "Überschneidung", "over_budget_after": "danach über Budget", "worktime": "ArbZG", "unavailable": "nicht verfügbar" }
}
```

Nest this under `planning`.

- [ ] **Step 2: `candidates-action.ts`**

```ts
"use server";
import { listCandidates } from "@/server/queries/planning";
import { requirePermission } from "@/server/session";

export async function listCandidatesAction(needId: string) {
  await requirePermission("team", "read");
  return listCandidates(needId);
}
```

- [ ] **Step 3: `candidate-picker.tsx`**

The picker is a popover on desktop and a bottom sheet below 640 px. Check how existing pickers switch (for example
`components/ui/record-picker.tsx`) and reuse that if it fits. When it opens, it calls `listCandidatesAction(needId)`
and then renders:
- a search input (filters by `displayName`, case-insensitive);
- three groups with headings (`event.group.*`). Each row shows the name, `event.left` (hours via
  `formatMinutesAsHours`), the flags as small text chips (`event.flag.*`, with icon + text), and the unavailable note.

Clicking a row calls `actions.assign(needId, id, name, dateLabel, unavailableNote)` and closes the picker.
Arrow keys plus Enter work in the list.

```tsx
"use client";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { Candidate } from "@marktwerk/core";
import { listCandidatesAction } from "@/app/(app)/team/planung/candidates-action";
import { formatMinutesAsHours } from "@/lib/format";

export function CandidatePicker({ needId, onPick, onClose }: { needId: string; onPick: (c: Candidate) => void; onClose: () => void }) {
  const t = useTranslations("planning.event");
  const locale = useLocale();
  const [all, setAll] = useState<Candidate[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    listCandidatesAction(needId).then((c) => live && setAll(c));
    return () => {
      live = false;
    };
  }, [needId]);
  const shown = useMemo(() => (all ?? []).filter((c) => c.displayName.toLowerCase().includes(q.trim().toLowerCase())), [all, q]);
  const h = (m: number) => formatMinutesAsHours(m, locale);
  return (
    <div role="dialog" aria-label={t("addPerson")} className="w-80 rounded-lg border border-input bg-card p-2 shadow-lg" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="mb-2 w-full rounded border border-input px-2 py-1" />
      {(["usual", "other", "unavailable"] as const).map((group) => {
        const rows = shown.filter((c) => c.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group}>
            <h3 className="px-1 pt-1 text-xs font-semibold text-muted-foreground">{t(`group.${group}`)}</h3>
            <ul className="m-0 list-none p-0">
              {rows.map((c) => (
                <li key={c.staffMemberId}>
                  <button type="button" onClick={() => onPick(c)} className="flex w-full flex-col items-start rounded px-1 py-1 text-left hover:bg-hover focus-visible:ring-2">
                    <span className="font-medium">{c.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("left", { before: h(c.leftBefore), after: h(c.leftAfter) })}
                      {c.flags.filter((f) => f !== "unavailable").map((f) => ` · ${t(`flag.${f}`)}`).join("")}
                      {c.unavailableNote ? ` · ${c.unavailableNote}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: `day-blocks.tsx`**

Renders, for each `EventPlanningDay`, a `Panel` with the day as its title (`formatDateWithWeekday`). For each need:
- a line `t("need", { role, from, to, count: headcount })`, plus the gap status (open / full / over, as in
  `DayHeader`);
- the filled shifts: name, `ShiftChip`, a status menu (Bestätigt / Abgesagt / Wieder angefragt / Entfernen via
  `actions.setStatus`), and "Zeiten ändern", which opens the existing `ShiftDialog` for that shift;
- `open` × "+ Person" buttons, each opening the `CandidatePicker` for this need;
- with `canManage`, "Bedarf ändern": an inline form for headcount, from and to, saved with `updateNeedAction`,
  showing a toast with undo that restores the previous values.

Below the days, render "Weitere Schichten" (`loose`) the same way, without "+ Person".

If `days` is empty: show `t("none")`, and if `canApplyPreset && canManage`, a button `t("applyPreset")`. It calls
`applyPresetStaffingAction(eventId)` and shows the toast `t("applied", { count })`, with no undo: deleting needs
isn't offered, and the needs can be set to 0 instead.

Without `team:manage`, all controls are hidden and the view is read-only.

- [ ] **Step 5: `event-planning.tsx` and the page**

```tsx
// components/planning/event-planning.tsx
import { getTranslations } from "next-intl/server";
import { getEventPlanning } from "@/server/queries/planning";
import { DayBlocks } from "./day-blocks";

export async function EventPlanning({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const [t, plan] = await Promise.all([getTranslations("planning.event"), getEventPlanning(eventId)]);
  return (
    <section aria-labelledby="planning-title" className="flex flex-col gap-3">
      <h2 id="planning-title" className="text-base font-semibold">
        {t("title")} · <span className="font-normal">{t("openTotal", { count: plan.openTotal })}</span>
      </h2>
      <DayBlocks eventId={eventId} plan={plan} canManage={canManage} />
    </section>
  );
}
```

In `veranstaltungen/[id]/team/page.tsx`:

```tsx
  return (
    <>
      <TeamTable event={event} staff={staff} />
      {can(actor.role, "team", "read") && (
        <>
          <EventPlanning eventId={event.id} canManage={can(actor.role, "team", "manage")} />
          {/* Time recording stays here once the event has started (spec correction 3). */}
          {todayIn() >= event.startsOn && <EventShifts event={event} actor={actor} />}
        </>
      )}
    </>
  );
```

Update the page's doc comment.

- [ ] **Step 6: TeamSummaryPanel.** In `overview-panels.tsx`, find `TeamSummaryPanel`. Load
  `getEventPlanning(event.id)` there, or pass `openTotal` in from the page, and add a line
  `t("planning.event.openTotal", { count })` with a `CircleDot` icon when the count is above 0 and a `CircleCheck`
  otherwise. Show it only when the event has needs.

- [ ] **Step 7: Verify in the browser.** Open an event with needs → Team tab. Check that:
  - "+ Person" lists the ranked candidates;
  - picking a person shows the toast, and Rückgängig removes the assignment;
  - Abgesagt reopens the slot;
  - "Bedarf ändern" to 3 shows one more open slot.

  Resize the window to mobile (375 px) and check that the picker is usable. Take a screenshot.

- [ ] **Step 8: `pnpm check` and commit**

```bash
git add -A && git commit -m "feat(planning): event Team tab day blocks with ranked picker, need edits and preset staffing"
```

---

### Task 10: Smaller screens: Vorlage Personalbedarf, contract budget, unavailability on the person, default budget

**Files:**
- Modify: `apps/web/src/components/presets/preset-form.tsx` (section "Personalbedarf")
- Modify: `apps/web/src/server/queries/presets.ts` or `getPresetFormOptions` (duty roles for the selector, if not already loaded)
- Modify: `apps/web/src/server/services/contracts.ts` (`monthlyHourBudget` in `ContractInput`, validated 0–200 in 0.5 steps, stored)
- Modify: `apps/web/src/server/queries/hours.ts` (`contractColumns` + `ContractRow` get `monthlyHourBudget`)
- Modify: `apps/web/src/components/team/contract-button.tsx` (field + € hint)
- Modify: `apps/web/src/components/team/contract-section.tsx` (shows the budget)
- Create: `apps/web/src/components/planning/unavailability-section.tsx` (person Vorschau list + add dialog)
- Modify: `apps/web/src/components/people/person-vorschau.tsx` (renders the section with `team:manage`)
- Modify: `apps/web/src/app/(app)/einstellungen/rechtliches/page.tsx` (Planung block)
- Modify: `de.json` / `en.json`
- Test: extend `apps/web/test/integration/shift-planning.test.ts` (contract budget saved; preset staffing validated)

**Interfaces:**
- Consumes: `setUnavailabilityAction`, `clearUnavailabilityAction`, `setDefaultHourBudgetAction` (Task 6);
  `parseStaffing` (Task 3).
- Produces: `ContractInput.monthlyHourBudget: number | null`.

- [ ] **Step 1: Failing tests (append)**

```ts
import { employmentContract } from "@marktwerk/db/schema";
import { saveContract } from "@/server/services/contracts";
import { updatePreset } from "@/server/services/presets";

describe("budget and staffing inputs", () => {
  it("saves a contract's monthly hour budget", async () => {
    const anna = await person("Anna");
    await saveContract(owner, anna.id, {
      type: "minijob",
      hourlyRateCents: 1600,
      contractedHoursPerWeek: 10,
      fixedMonthlyPayCents: null,
      workingTimeAccount: false,
      otherMinijobDeclared: false,
      validFrom: "2026-01-01",
      validUntil: null,
      notes: null,
      monthlyHourBudget: 35,
    });
    const [c] = await db.select().from(employmentContract).where(eq(employmentContract.staffMemberId, anna.id));
    expect(c?.monthlyHourBudget).toBe(35);
  });
});
```

Copy the exact `ContractInput` field set from `contracts.ts:44`, and add a staffing test against `updatePreset`
following the call shape that existing preset tests use (`grep -rn "updatePreset(" apps/web/test | head -2`).
Unknown role keys → `PresetInputError`.

Run: `pnpm --filter web test:integration -- shift-planning`
Expected: FAIL (`monthlyHourBudget` is unknown).

- [ ] **Step 2: Contracts.**
- `ContractInput`: add `monthlyHourBudget: number | null;`. Validate it as `null`, or a finite number from 0 to 200
  with `Math.round(v * 2) === v * 2`. Otherwise throw `new ContractInputError("invalid_input")`, or the closest
  existing code (check the `ContractError` union).
- Store it in the insert and update.
- Add it to `contractColumns` and `ContractRow` in `queries/hours.ts`.

Run the tests: PASS.

- [ ] **Step 3: Contract form (`contract-button.tsx`).** Add a field "Stundenbudget pro Monat" (`hours.contract.budget`)
  next to the hours per week. It holds a decimal in hours, and empty means the default. Below it, render the hint
  text only, with no tone:
  `hours.contract.budgetHint` = "≈ {hours} h × {rate} = {pay}". `hours` is the typed value or the default from a new
  prop `defaultBudget`; `rate` is the typed hourly rate; `pay` = `formatMoney(round(hours × rate))`. Leave the hint
  out when there is no rate. Pass `monthlyHourBudget` in the save call. `contract-section.tsx` shows
  "Stundenbudget: 35 h", or "40 h (Standard)" when it isn't set.

  Messages (both files): `hours.contract.budget`, `hours.contract.budgetHint`, `hours.contract.budgetDefault`
  ("{hours} h (Standard)").

- [ ] **Step 4: Vorlage "Personalbedarf" (`preset-form.tsx`).**
- Add state `const [staffing, setStaffing] = useState(initial.staffing ?? [])`.
- Render a section titled `presets.staffing.title` with one row per entry:
  - a role select (duty roles from the form options; use `listDutyRoles()` if they're missing);
  - a number input 0–30;
  - a Zeitplan part select (`presets.staffing.kind.setup|open|teardown` = Aufbau / Markt / Abbau);
  - a remove button.
- Add a "+ Zeile" button (`presets.staffing.add`).
- Submit with `staffing` in the payload.
- On an `invalid_input` error, keep the existing error handling.
- Show the help text `presets.staffing.help`: "Gilt für neue Termine. Bestehende Termine übernehmen ihn auf dem
  Team-Tab." This is the "never silently propagate" rule.

- [ ] **Step 5: `unavailability-section.tsx`.**
- A server component, given a `staffMemberId`, loads the next 90 days of `staff_unavailability` and lists them,
  grouping consecutive days into "12.–14.12." ranges with the note.
- Each range has an "Entfernen" button: a client button calling `clearUnavailabilityAction(id, dates)`, with an
  undo toast that calls `setUnavailabilityAction` with the same range and note.
- "Hinzufügen" opens a small dialog with from (DateField), to (DateField, defaults to from) and a note (max 200),
  saved through `setUnavailabilityAction`.
- Render it inside `person-vorschau.tsx` when `can(actor.role, "team", "manage")`.
- Messages: `planning.unavailability.{title,add,from,to,note,remove,empty}`.

- [ ] **Step 6: Rechtliches → Planung.**
- On `einstellungen/rechtliches/page.tsx`, add a `Panel` titled `settings.legal.planning.title`, holding the default
  budget input (`settings.legal.planning.budget`, hours) and a save button, as a small client component calling
  `setDefaultHourBudgetAction`.
- Add the note `settings.legal.planning.note`: "Firmenregel, kein gesetzlicher Wert. 40 h liegen unter der
  Minijob-Grenze bei Mindestlohn."
- Read the current value with `defaultHourBudget()` (Task 6).

- [ ] **Step 7: Verify in the browser.**
- Vorlage: add Personalbedarf and save it.
- Contract: set 35 h and see the hint.
- Person: add "nicht verfügbar" 12.–14.12. and see the hatched cells in Planung.
- Settings: change the default to 38 and see the budgets of people without a contract budget change.

Take a screenshot.

- [ ] **Step 8: `pnpm check` and commit**

```bash
git add -A && git commit -m "feat(planning): Personalbedarf on the Vorlage, contract hour budget, unavailability on the person, default budget"
```

---

### Task 11: Synthetic seed

**Files:**
- Create: `packages/synthetic/src/generators/planning.ts`
- Modify: `packages/synthetic/src/types.ts` (dataset types: `ShiftNeed`, `StaffUnavailability`; `Shift.needId`;
  `EmploymentContract.monthlyHourBudget`; `EventPreset.staffing`; `Event.staffing`)
- Modify: `packages/synthetic/src/dataset.ts` (call the generator)
- Modify: `packages/synthetic/src/dataset.test.ts` (invariants)
- Modify: `apps/web/scripts/seed/staff.ts` (insert `shift_need` and `staff_unavailability`; pass the new columns)

**Interfaces:**
- Consumes: `needsFromStaffing`, `slotMinutes` (core); the existing dataset (`events`, `contracts`, crew ids,
  duty roles).
- Produces: `buildPlanning(rng, ctx): { needs: ShiftNeed[]; shifts: Shift[]; unavailability: StaffUnavailability[]; budgets: Map<string, number> }`.

- [ ] **Step 1: Failing invariant tests (append to `dataset.test.ts`)**

```ts
describe("shift planning seed (reference date 2026-11-25)", () => {
  it("every preset has staffing; December has needs, mixed statuses and open gaps", () => {
    expect(data.eventPresets.every((p) => p.staffing.length > 0)).toBe(true);
    const december = data.shiftNeeds.filter((n) => n.workDate.startsWith("2026-12"));
    expect(december.length).toBeGreaterThan(10);
    const planned = data.shifts.filter((s) => s.needId && s.workDate.startsWith("2026-12"));
    expect(new Set(planned.map((s) => s.status))).toEqual(new Set(["requested", "confirmed", "declined"]));
    const open = december.filter((n) => planned.filter((s) => s.needId === n.id && s.status !== "declined").length < n.headcount);
    expect(open.length).toBeGreaterThan(0);
  });
  it("3–4 unavailable days, one €16/h person with 35 h, a declined shift whose slot is open", () => {
    expect(data.staffUnavailability.length).toBeGreaterThanOrEqual(3);
    expect(data.staffUnavailability.length).toBeLessThanOrEqual(4);
    expect(data.employmentContracts.some((c) => c.hourlyRateCents === 1600 && c.monthlyHourBudget === 35)).toBe(true);
    const declined = data.shifts.find((s) => s.needId && s.status === "declined");
    expect(declined).toBeDefined();
  });
  it("planned December shifts keep every person within their budget", () => {
    // sum of slot minutes per person (requested + confirmed) ≤ budget (contract or 40 h)
  });
});
```

Complete the third test: group the December need-linked requested and confirmed shifts by person, sum
`slotMinutes(...)`, and compare that with `(contract.monthlyHourBudget ?? 40) * 60`. Look at how the file already
names the dataset object (`data`) and its fields (`eventPresets`, `employmentContracts`, `shifts`) and match them.

Run: `pnpm --filter @marktwerk/synthetic test`
Expected: FAIL.

- [ ] **Step 2: Implement `generators/planning.ts`.**
- Staffing per preset:
  - Flohmarkt: `setup` 2 · `open` 1 · `teardown` 2, using the crew duty role key from the dataset (the same one the
    shifts generator uses as `setupDutyRoleId`) and the cash/office role for `open`;
  - Stadtfest: 3 · 2 · 3.
- For every event with `startsOn` from 2026-12-01 to 2026-12-31 and status not cancelled:
  - build `needsFromStaffing(event.staffing, event.schedule, event.startsOn, durationDays)`;
  - fill about 70 % of the slots with crew, picking the person with the most budget left (the same "least earned
    first" idea as `buildShifts`);
  - statuses: 60 % confirmed, 30 % requested, and exactly one declined whose slot stays open;
  - set `breakMinutes` from `slotMinutes`.
- Budgets: the crew member with the highest rate gets `hourlyRateCents = 1600` and `monthlyHourBudget = 35`.
  Everyone else keeps `null`.
- Unavailability: 3–4 rows for crew members on December market days, two of them with notes ("nur bis 15 Uhr",
  "Urlaub").
- Use the dataset's `rng`, so the seed stays deterministic. Generate ids the same way as the other generators.

- [ ] **Step 3: Wire it in (`dataset.ts`) and load it (`scripts/seed/staff.ts`).**
- In `dataset.ts`, call `buildPlanning` after `buildShifts`. Append its shifts to `shifts` and expose `shiftNeeds`
  and `staffUnavailability`.
- In the seed script, insert `shift_need` before `shift` (FK), then `staff_unavailability`. Pass `staffing`,
  `monthlyHourBudget` and `needId` through.

Run: `pnpm --filter @marktwerk/synthetic test`
Expected: PASS.
Run: `pnpm db:seed` (check the exact script name in the root `package.json`) against the **local Docker DB**.
Then open `/team/planung?month=2026-12` and check that the grid is filled, with gaps.

- [ ] **Step 4: `pnpm check` and commit**

```bash
git add -A && git commit -m "feat(synthetic): December needs, planned shifts, unavailability and hour budgets for the planner"
```

---

### Task 12: e2e smoke, docs, PR

**Files:**
- Create: `apps/web/e2e/planning.spec.ts`
- Modify: `docs/architecture/data-model.md` (shift_need, staff_unavailability, the new columns)
- Modify: `docs/product/glossary.md` (Personalbedarf = staffing, Bedarf = shift need, Stundenbudget = monthly
  hour budget, Nicht verfügbar = unavailability)
- Modify: `docs/product/roadmap.md` (if M4 lists shift planning, mark v1 done)
- Modify: `docs/superpowers/specs/2026-11-26-shift-allocator-design.md` (already carries the 3 corrections; check)

- [ ] **Step 1: e2e test**

```ts
// apps/web/e2e/planning.spec.ts
import { expect, test } from "@playwright/test";

test("plan a person on a market day and see budget and gap update", async ({ page }) => {
  await page.goto("/team/planung?month=2026-12");
  await expect(page.getByRole("heading", { level: 1 }).or(page.getByText("Planung")).first()).toBeVisible();
  const openBefore = await page.getByText(/\d+ offen/).first().textContent();
  // First empty cell of the first person on the first day with an open need.
  const cell = page.locator("td button[data-row='0'][data-col='0']");
  await cell.click();
  await page.getByRole("menuitem", { name: /Einplanen|·/ }).first().click();
  const confirm = page.getByRole("button", { name: "Trotzdem einplanen" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByText(/eingeplant \(angefragt\)/)).toBeVisible();
  await expect(page.getByText(/\d+ offen/).first()).not.toHaveText(openBefore ?? "");
  await page.getByRole("button", { name: "Rückgängig" }).click();
});
```

Match the setup of `smoke.spec.ts`: auth comes from `auth.setup.ts`, and the seed date is 2026-11-25. If the first
cell already holds a shift or has no open need, look for a cell whose day header shows "offen" and whose row has an
empty cell, using a `locator` filter.

Run: `pnpm --filter web test:e2e -- planning`
Expected: PASS.

- [ ] **Step 2: Docs.** Add the tables and columns to `data-model.md`, matching the existing style, and add the
  glossary entries in both German and English. `docs/research/14-shift-allocator.md` and `open-questions.md`
  already hold the decisions.

- [ ] **Step 3: Full check**

Run: `pnpm check && pnpm --filter web test:integration && pnpm --filter web test:e2e`
Expected: all green. If anything fails, report the output; don't weaken tests to get green.

- [ ] **Step 4: Commit, push, PR**

```bash
git add -A && git commit -m "test(planning): e2e smoke; docs: data model and glossary for shift planning"
git push -u origin feat/shift-allocator
gh pr create --base exp/stand-allocation --title "Shift allocator v1 (Schichtplanung)" --body "…summary of tasks, screenshots, test counts…"
```

Bind the PR in the app (`get_status`, then `bind_pr` if it isn't bound) and ask Arda before merging. Tick SHA2 in
the Fahrplan tracker and update `meta/plan.lastSession`.

---

## Self-review against the spec

| Spec item | Task |
|---|---|
| §2 decisions 1, 10 (budget, week info) | 2, 7, 8 |
| §2 decisions 2, 6, 7 (views, unavailability, ranking) | 3, 6, 7, 8, 9, 10 |
| §2 decision 3 (needs from preset, editable per day) | 4, 5, 6, 9, 10 |
| §2 decision 4 (times from the Zeitplan) | 3 (`needsFromStaffing`), 6 (assign uses need times) |
| §2 decision 5 (status, no draft) | 6 (`setShiftStatus`), 8, 9 |
| §2 decision 8 (owner + manager) | 6 (`team:manage`), 8/9 (`team:read`) |
| §2 decision 9 (flag split) | 1 |
| §2 decision 11 (no € in the planner) | none on purpose; contract hint only (10) |
| §2 decision 12 (nothing blocks, one confirmation) | 3 (`needsConfirmation`), 6, 8 (`useWarningConfirm`) |
| §2 decision 13 (date moves) | 5 (`moveNeedsTx`) |
| §2 decision 14 (no backfill, button) | 6 (`applyPresetStaffing`), 9 |
| §3 data model | 4 (+ `schedule_kind` correction) |
| §4 rules 1–6 | 2, 3 |
| §5 services | 5, 6 |
| §6 screens | 8, 9, 10 |
| §7 rollout, seed | 1–11 |
| §8 tests | 2, 3, 5, 6, 7, 10, 11, 12 |
