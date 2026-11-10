# Client Feedback 9 (2026-11-04) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> The design is fixed in `docs/superpowers/specs/2026-11-04-client-feedback-9-design.md`: read it first; this plan
> does not repeat its rationale. If something here contradicts the spec, the spec wins; if both are silent, ask the
> product owner (CLAUDE.md "Ask before deciding").

**Goal:** Ship CF9-1…CF9-5: a "Termin" record, a re-ordered Übersicht, saved (not yet sent) task notifications,
legible market colours, and a text-only Checkliste tab status.

**Architecture:** One branch `feat/client-feedback-9`, one commit per task, PR at the end. New domain rules
(appointment validation, notify moment) in `packages/core` with Vitest. Two migrations (task notify columns, appointment
table). Every mutation goes through a service: permission → transaction → `audit()` → (no jobs here).

**Tech Stack:** Next.js 16 (read `apps/web/node_modules/next/dist/docs/` before Next code), Drizzle/Postgres,
next-intl, Base UI, Tailwind 4 tokens in `apps/web/src/app/globals.css`, Vitest (core + `apps/web/test/integration`),
Playwright (`apps/web/e2e/smoke.spec.ts`).

## Global Constraints
- `pnpm check` (lint + typecheck + tests) passes before every commit; `pnpm db:up` must be running for integration tests.
- Protected pages / actions start with `requireUser()` / `requirePermission()`; services check `can(actor.role, …)`.
- No inline UI strings: every new key in **both** `apps/web/messages/de/*.json` and `apps/web/messages/en/*.json`
  (`pnpm --filter web test` runs `scripts/check-messages.ts`).
- Status = colour + icon + text. Undo toasts over confirmation dialogs. German-first, neutral wording, "du".
- Code says `event`, never `market`, in new identifiers (existing `MarketMarker`, `--market-*` stay).
- Instants `timestamptz`; days `date` in Europe/Berlin; wall-clock times Postgres `time`.
- Never edit applied migrations: `pnpm db:generate --name <change>` then `pnpm db:migrate`.
- Biome only (`pnpm lint:fix`). TypeScript 6.
- Update `docs/product/ux-concept.md`, `docs/architecture/data-model.md` and the Decided table in
  `docs/open-questions.md` in the task that changes the behaviour.

## File map

| Area | Create | Modify |
|---|---|---|
| CF9-5 | – | `components/event-detail/event-header.tsx`, `components/event-detail/event-tabs.tsx`, messages `board.json` |
| CF9-2 | – | `app/(app)/page.tsx`, `components/overview/weekend-card.tsx`, messages `overview.json` |
| CF9-4 | `components/ui/market-color-picker.tsx`, `server/queries/market-colors.ts` | `globals.css`, `app/(app)/veranstaltungen/page.tsx`, `components/ui/event-type-tag.tsx`, `components/ui/market-marker.tsx`, `components/presets/preset-form.tsx`, `components/events/new-market-form.tsx`, `components/events/generate-sheet.tsx`, messages `templates.json` |
| CF9-3 | `packages/core/src/tasks/notify-moment.ts` (+test), `components/task/notify-fields.tsx` | `packages/db/src/schema/tasks.ts`, `server/services/tasks.ts`, `components/board/new-task-dialog.tsx`, `components/task/task-drawer.tsx`, board actions, messages `board.json` |
| CF9-1 | `packages/core/src/appointments/{input.ts,input.test.ts,index.ts}`, `packages/db/src/schema/appointments.ts`, `server/services/appointments.ts`, `server/queries/appointments.ts`, `components/appointments/{appointment-dialog.tsx,appointment-vorschau.tsx,appointment-chip.tsx}`, `app/(app)/termin-actions.ts`, `test/integration/appointments.test.ts`, messages `appointments.json` (de+en) | `packages/core/src/index.ts`, `packages/db/src/schema/index.ts`, `lib/creatable.ts`, `components/shell/topbar.tsx`, palette actions, `app/(app)/layout.tsx`, `server/queries/due.ts` (layer list), `components/kalender/{layers.ts,layer-panel.tsx,month-grid.tsx,list-view.tsx}`, `app/(app)/kalender/page.tsx`, `server/queries/kalender.ts`, `components/overview/today-card.tsx`, `server/queries/overview.ts`, `i18n/messages.ts` |

(All `components/…`, `app/…`, `server/…`, `lib/…` paths are under `apps/web/src/`.)

---

### Task 0: Branch

- [ ] `git status`: the working tree had an unrelated change in `apps/web/src/app/layout.tsx` on `feat/client-feedback-8`
  when this plan was written. Ask the product owner what to do with it before switching; do not discard it.
- [ ] `git fetch && git switch -c feat/client-feedback-9 origin/main` (or from `feat/client-feedback-8` if it is not merged
  yet — ask).
- [ ] `pnpm db:up && pnpm db:migrate && pnpm check` → green baseline.

---

### Task 1 (CF9-5): Checkliste tab without ▲/■

**Files:** Modify `apps/web/src/components/event-detail/event-header.tsx:88-102`,
`apps/web/src/components/event-detail/event-tabs.tsx:11-45`, `apps/web/messages/{de,en}/board.json` (`tab.*`).

**Interfaces:** `EventTab.count` gains `alert?: string` (text rendered in critical colour with a `Clock` icon after the main
text). `level` stays for other tabs.

- [ ] **Step 1:** In `event-tabs.tsx`, extend the type and `Count`:

```tsx
export type EventTab = {
  // …
  count?: { text: string; short?: string; level?: HealthLevel; alert?: string; sr?: string };
};

function Count({ count }: { count: NonNullable<EventTab["count"]> }) {
  return (
    <span className="tabular inline-flex items-center gap-1 text-small text-foreground-2">
      {count.level && <HealthShape level={count.level} className="size-3" />}
      <span aria-hidden={count.sr ? true : undefined}>
        {count.short ? (
          <>
            <span className="sm:hidden">{count.short}</span>
            <span className="max-sm:hidden">{count.text}</span>
          </>
        ) : (
          count.text
        )}
      </span>
      {count.alert && (
        <span aria-hidden={count.sr ? true : undefined} className="inline-flex items-center gap-0.5 text-status-critical">
          <span aria-hidden className="text-foreground-2">·</span>
          <Clock aria-hidden className="size-3" />
          {count.alert}
        </span>
      )}
      {/* keep the existing sr-only rendering of count.sr below */}
    </span>
  );
}
```
  (Import `Clock` from `lucide-react`. Keep whatever sr-only element already follows in the file.)

- [ ] **Step 2:** In `event-header.tsx`, the `board` tab count becomes (no `level`):

```tsx
count: {
  text: tBoard("tab.openShort", { count: tasks.open }),
  alert: tasks.overdue > 0 ? tBoard("tab.overdue", { count: tasks.overdue }) : undefined,
  sr:
    tasks.overdue > 0
      ? tBoard("tab.openOverdue", { open: tasks.open, overdue: tasks.overdue })
      : tBoard("tab.open", { count: tasks.open }),
},
```
  Add `board.tab.overdue` = de `"{count} überfällig"`, en `"{count} overdue"`. Keep `tab.openOverdue` (now sr text).
  On phones the alert stays visible (it is short), so drop the old phone comment.

- [ ] **Step 3:** `pnpm check`. In the browser (`/veranstaltungen/<id>/board` of an event with overdue tasks, and one
  without): "29 offen · ⏱ 3 überfällig" in red; "29 offen" alone; no ▲/■. Screen reader text via `read_page`.
- [ ] **Step 4:** Update `docs/product/ux-concept.md` (event tabs paragraph) and add a Decided row
  `2026-11-04 | Checkliste tab | Text count, overdue in red with clock icon; no health shape (CF9-5)`.
- [ ] **Step 5:** Commit `feat(event): Checkliste tab shows "N überfällig" as text, no ▲/■ (CF9-5)`.

---

### Task 2 (CF9-2): Übersicht: Heute left, simplified weekend right

**Files:** Modify `apps/web/src/app/(app)/page.tsx:92-104`, `apps/web/src/components/overview/weekend-card.tsx`,
`apps/web/messages/{de,en}/overview.json` (`weekend.*`), `apps/web/e2e/smoke.spec.ts`, `apps/web/test/integration/overview.test.ts`
only if it asserts blocker counts.

**Interfaces:** Produces `TOP_BLOCKERS = 5` (exported from `weekend-card.tsx`) and a client component
`TopTasksToggle({ label, children })` in `components/overview/top-tasks-toggle.tsx`.

- [ ] **Step 1:** In `page.tsx`, swap the two children of the `KeyboardRows` grid so `<TodayCard …/>` comes first,
  `<WeekendCard …/>` second. Keep `lg:grid-cols-2`. J/K order follows DOM order — that is wanted (Heute first).
- [ ] **Step 2:** Create `components/overview/top-tasks-toggle.tsx`:

```tsx
"use client";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** "Top-5-Aufgaben anzeigen": collapsed every visit (not persisted, CF9-2). */
export function TopTasksToggle({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="pb-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="ml-6 inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-small font-medium text-foreground-2 hover:bg-hover"
      >
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
        {label}
      </button>
      <div id={id} hidden={!open}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 3:** In `weekend-card.tsx`: delete `blockerRows` and the `rows` prop; in `MarketBlock` replace the whole
  `{shown.length > 0 && (<ul …>…</ul>)}` block with:

```tsx
{blockers.length > 0 && (
  <TopTasksToggle label={t("topTasks", { count: Math.min(blockers.length, TOP_BLOCKERS) })}>
    <ul aria-label={t("blockers", { name: row.name })} className="m-0 flex list-none flex-col p-0">
      {blockers.slice(0, TOP_BLOCKERS).map((item) => (
        <Blocker key={`${item.kind}-${item.id}`} item={item} today={today} reserveStar={reserveStar} />
      ))}
    </ul>
    {blockers.length > TOP_BLOCKERS && (
      <Link href={href as never} className="ml-7 inline-flex min-h-8 items-center text-small font-medium hover:underline">
        {t("allInSummary", { count: blockers.length })}
      </Link>
    )}
  </TopTasksToggle>
)}
```
  Remove now-unused imports (`MoreDisclosure`, `MORE_IN_PLACE_MAX`). Messages: `weekend.topTasks` de
  `"{count, plural, one {Wichtigste Aufgabe anzeigen} other {Top-#-Aufgaben anzeigen}}"`, en
  `"{count, plural, one {Show top task} other {Show top # tasks}}"`; `weekend.allInSummary` de
  `"Alle {count} in der Zusammenfassung"`, en `"All {count} in the summary"`. Delete `blockersMore`/`blockersMoreLink`
  if no longer referenced. Update the component doc comment.
- [ ] **Step 4:** E2E in `smoke.spec.ts` (Übersicht test): assert the first `section`/panel heading in the grid is
  "Heute" (whatever `TodayCard`'s title key renders), that weekend blockers are hidden, and clicking
  "Top-…-Aufgaben anzeigen" reveals ≤ 5 rows. Run `pnpm --filter web test:e2e -g Übersicht`.
- [ ] **Step 5:** Browser check at desktop and 375px: Heute first on both. `pnpm check`. Update ux-concept (Übersicht
  section) + Decided row. Commit `feat(overview): Heute left, weekend right with Top-5 toggle (CF9-2)`.

---

### Task 3 (CF9-4a): Distinct market palette and legible events list (tinted rows)

**Files:** Modify `apps/web/src/app/globals.css:100-109` (and the dark block if separate), `components/ui/market-marker.tsx`,
`components/ui/event-type-tag.tsx`, `app/(app)/veranstaltungen/page.tsx:395-410`, `messages/{de,en}/templates.json`
(`form.color.names`).

**Interfaces:** Produces `marketRowClass(color: string | null | undefined): string | undefined` in `market-marker.tsx`.

- [ ] **Step 1:** Retune tokens (keys unchanged). Light values from the spec; dark = same hue, lighter:

```css
--market-plum: light-dark(#a2337f, #e59ad0);
--market-rose: light-dark(#d0455f, #f29aac);
--market-brown: light-dark(#8a5a2b, #d9b08a);
--market-sand: light-dark(#c48a12, #f0c766);   /* now amber */
--market-olive: light-dark(#5f8a1c, #b7d77a);
--market-petrol: light-dark(#0f8a6e, #7fd8bf);  /* now teal */
--market-cyan: light-dark(#1f86c4, #8ccbf0);
--market-slate: light-dark(#3157c9, #a5b8f5);   /* now blue */
--market-indigo: light-dark(#6a3fc9, #c3aaf5);  /* now violet */
--market-graphite: light-dark(#4a4945, #c9c7c2);
```
  Rename visible names in `templates.json` (de: sand → "Bernstein", petrol → "Türkis", slate → "Blau", indigo → "Violett";
  en: "Amber", "Teal", "Blue", "Violet"). Verify each pair is visibly distinct in the browser (swatch row in a
  Marktvorlage form) in light and dark; adjust a value if two still look alike, and note the final values in the commit.
- [ ] **Step 2:** In `market-marker.tsx` add a static row-class map (Tailwind must see literal class names) and export it:

```tsx
const ROW: Record<MarketColor, string> = {
  plum: "[--row-tint:var(--market-plum)]",
  rose: "[--row-tint:var(--market-rose)]",
  brown: "[--row-tint:var(--market-brown)]",
  sand: "[--row-tint:var(--market-sand)]",
  olive: "[--row-tint:var(--market-olive)]",
  petrol: "[--row-tint:var(--market-petrol)]",
  cyan: "[--row-tint:var(--market-cyan)]",
  slate: "[--row-tint:var(--market-slate)]",
  indigo: "[--row-tint:var(--market-indigo)]",
  graphite: "[--row-tint:var(--market-graphite)]",
};

/** Tinted list row in the market colour (events list only, CF9-4 option B); undefined = no tint. */
export function marketRowClass(color: string | null | undefined): string | undefined {
  return isMarketColor(color) ? cn("market-row", ROW[color]) : undefined;
}
```
  In `globals.css` (components layer):

```css
.market-row { background: color-mix(in oklab, var(--row-tint) 12%, transparent); }
.market-row:hover { background: color-mix(in oklab, var(--row-tint) 20%, transparent); }
.market-row[aria-selected="true"] {
  background: color-mix(in oklab, var(--row-tint) 20%, transparent);
  box-shadow: inset 0 0 0 2px var(--row-tint);
}
@media (prefers-color-scheme: dark) { .market-row { background: color-mix(in oklab, var(--row-tint) 18%, transparent); } }
```
  (If the app switches theme by class rather than media query, mirror the dark rule on that selector — check how
  `light-dark()` is driven in `globals.css`.) The global `focus-visible` ring must stay visible on top; the row's
  existing `focus-visible:bg-selected` is removed for tinted rows so focus = ring, not a colour swap.
- [ ] **Step 3:** In `veranstaltungen/page.tsx` row `className`, add
  `r.status !== "cancelled" && marketRowClass(r.color)` and drop `focus-visible:bg-selected` when the tint applies.
  Rows without colour keep today's hover/selected classes. Keep `MarketMarker size="lg"`.
- [ ] **Step 4:** `event-type-tag.tsx`: raise contrast — text from `--type-*` to a darker stop. Add tokens
  `--type-<key>-strong` (light ≈ 15 % darker than `--type-<key>`, dark ≈ lighter) and use `text-type-<key>-strong`
  in `STYLES`; check ≥ 4.5:1 with the browser's contrast tool or a quick JS luminance calc via `javascript_tool`.
- [ ] **Step 5:** Browser check `/veranstaltungen` at 1400px and 375px, light and dark: rest, hover, `?vorschau=<id>`
  (selected), Tab-focus, a cancelled row, a row without colour. Screenshot for the PR.
- [ ] **Step 6:** `pnpm check`. ux-concept: replace "never a background" for the events list; Decided row
  `2026-11-04 | Events list colour | Tinted rows in the market colour (reverses 2026-10-22 for this list only), distinct palette (CF9-4)`.
  Commit `feat(events): distinct market palette, tinted rows with clear hover/selected/focus (CF9-4)`.

---

### Task 4 (CF9-4b): Colour picker with usage legend in "Neuen Markt anlegen" and the Marktvorlage form

**Files:** Create `components/ui/market-color-picker.tsx`, `server/queries/market-colors.ts`; modify
`components/presets/preset-form.tsx:305-348`, `components/events/new-market-form.tsx`, `components/events/generate-sheet.tsx`
(passes usage in), the Marktvorlage page that renders `PresetForm`, `app/(app)/veranstaltungen/actions.ts`
(`createMarketAction` must accept `color` — check it already passes it, line 112 of the form suggests yes), messages
`templates.json` (`form.color.usedBy`, `form.color.free`).

**Interfaces:**
- `listMarketColorUsage(): Promise<Record<string, string[]>>` — key = colour key, value = names of active
  (non-archived, `active = true`) `event_preset`s using it, sorted by name.
- `MarketColorPicker({ name, value, onChange, usage, error })` — `value: string | null`.

- [ ] **Step 1:** Query:

```ts
import "server-only";
import { eventPreset } from "@marktwerk/db/schema";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";

export async function listMarketColorUsage(): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ color: eventPreset.color, name: eventPreset.name })
    .from(eventPreset)
    .where(and(isNotNull(eventPreset.color), isNull(eventPreset.archivedAt), eq(eventPreset.active, true)))
    .orderBy(asc(eventPreset.name));
  const usage: Record<string, string[]> = {};
  for (const r of rows) if (r.color) (usage[r.color] ??= []).push(r.name);
  return usage;
}
```
  (`eventPreset` is exported from `packages/db/src/schema/events.ts:26`.) Call sites must
  have passed `requirePermission("event","read")` already.
- [ ] **Step 2:** Move the swatch fieldset out of `preset-form.tsx` (lines ~305-348) into `MarketColorPicker`, unchanged
  in look, plus: each swatch `title`/`aria-label` = `"<Name> – genutzt von: A, B"` or `"<Name> – noch frei"`; under the row
  a compact legend `<ul>` with one line per *used* colour: swatch dot + name + market names (`text-small text-muted-foreground`).
  "Keine" option stays. Preset form uses the picker (behaviour identical + legend).
- [ ] **Step 3:** `new-market-form.tsx`: add `const [color, setColor] = useState<string | null>(initialValue?.color ?? null)`,
  render `<MarketColorPicker name="new-market-color" value={color} onChange={setColor} usage={usage} />` after the
  rhythm builder, send `color` in `createMarketAction`. New prop `usage: Record<string, string[]>`, threaded from the
  server component that renders the generate sheet (call `listMarketColorUsage()` there).
- [ ] **Step 4:** Integration: extend `test/integration/markets.test.ts` — creating a market with `color: "petrol"`
  stores it; `listMarketColorUsage()` returns `{ petrol: ["<name>"] }`; archived presets are excluded.
  Run `pnpm --filter web test:integration markets`.
- [ ] **Step 5:** Browser: Markt planen → Neuen Markt anlegen shows the picker and legend; pick a colour, create, see the
  tint on `/veranstaltungen`. `pnpm check`. Commit `feat(markets): colour picker with usage legend when creating a market (CF9-4)`.

---

### Task 5 (CF9-3a): Notify rule in core + task columns

**Files:** Create `packages/core/src/tasks/notify-moment.ts`, `packages/core/src/tasks/notify-moment.test.ts`; modify
`packages/core/src/tasks/index.ts` (export), `packages/db/src/schema/tasks.ts`, new migration.

**Interfaces (produces):**

```ts
export const NOTIFY_CHANNELS = ["email", "whatsapp"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];
export const NOTIFY_TIMINGS = ["on_create", "due_day", "before_1d", "before_3d", "before_7d", "custom"] as const;
export type NotifyTiming = (typeof NOTIFY_TIMINGS)[number];
export type NotifySetting = { channels: NotifyChannel[]; timing: NotifyTiming | null; at: Date | null };
export type NotifyProblem = "timing_required" | "at_required" | "due_required" | "unexpected_timing";
export function checkNotifySetting(s: NotifySetting, hasDue: boolean): NotifyProblem | null;
export function notifyMoment(s: NotifySetting, due: Date | null, createdAt: Date, timeZone?: string): Date | null;
```

- [ ] **Step 1: failing tests** (`notify-moment.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { checkNotifySetting, type NotifySetting, type NotifyTiming, notifyMoment } from "./notify-moment";

const due = new Date("2026-03-30T07:00:00Z"); // Mo 30.03.2026 09:00 Berlin (CEST, day after DST switch)
const created = new Date("2026-03-01T10:00:00Z");

describe("checkNotifySetting", () => {
  it("accepts no channels and no timing", () =>
    expect(checkNotifySetting({ channels: [], timing: null, at: null }, false)).toBeNull());
  it("rejects a timing without channels", () =>
    expect(checkNotifySetting({ channels: [], timing: "due_day", at: null }, true)).toBe("unexpected_timing"));
  it("needs a timing once a channel is ticked", () =>
    expect(checkNotifySetting({ channels: ["email"], timing: null, at: null }, true)).toBe("timing_required"));
  it("needs a moment for custom", () =>
    expect(checkNotifySetting({ channels: ["email"], timing: "custom", at: null }, true)).toBe("at_required"));
  it("needs a due date for relative timings", () =>
    expect(checkNotifySetting({ channels: ["whatsapp"], timing: "before_1d", at: null }, false)).toBe("due_required"));
  it("allows on_create without a due date", () =>
    expect(checkNotifySetting({ channels: ["email"], timing: "on_create", at: null }, false)).toBeNull());
});

describe("notifyMoment", () => {
  const s = (timing: NotifyTiming, at: Date | null = null): NotifySetting => ({ channels: ["email"], timing, at });
  it("on_create is the creation instant", () => expect(notifyMoment(s("on_create"), due, created)).toEqual(created));
  it("due_day is 08:00 Berlin on the due day (CEST)", () =>
    expect(notifyMoment(s("due_day"), due, created)).toEqual(new Date("2026-03-30T06:00:00Z")));
  it("before_1d lands on the DST switch day and is 08:00 CEST (06:00Z)", () =>
    expect(notifyMoment(s("before_1d"), due, created)).toEqual(new Date("2026-03-29T06:00:00Z")));
  it("before_7d is 08:00 Berlin seven days earlier (CET)", () =>
    expect(notifyMoment(s("before_7d"), due, created)).toEqual(new Date("2026-03-23T07:00:00Z")));
  it("custom returns the stored instant", () => {
    const at = new Date("2026-03-20T15:30:00Z");
    expect(notifyMoment(s("custom", at), due, created)).toEqual(at);
  });
  it("relative timing without due is null", () => expect(notifyMoment(s("due_day"), null, created)).toBeNull());
  it("no channels → null", () =>
    expect(notifyMoment({ channels: [], timing: null, at: null }, due, created)).toBeNull());
});
```
  Note 2026-03-29 is the DST switch day itself (02:00 → 03:00): 08:00 that day is already CEST = 06:00Z. Double-check
  each expected value by hand before running; fix the test, not the implementation, if a hand calculation was wrong.
- [ ] **Step 2:** `pnpm --filter @marktwerk/core test notify-moment` → FAIL (module missing).
- [ ] **Step 3: implement** using existing helpers `berlinDay` (`tasks/board.ts:41`), `addDays` (`dates/calendar.ts`) and
  `resolveRelativeDue(date, 0, "08:00", tz)` (`dates/relative.ts:23`, the same call `dueInstantFor` makes):

```ts
import { addDays } from "../dates/calendar";
import { DEFAULT_TIME_ZONE, resolveRelativeDue } from "../dates/relative";
import { berlinDay } from "./board";

const SEND_TIME = "08:00";
const BEFORE: Partial<Record<NotifyTiming, number>> = { due_day: 0, before_1d: 1, before_3d: 3, before_7d: 7 };

export function checkNotifySetting(s: NotifySetting, hasDue: boolean): NotifyProblem | null {
  if (s.channels.length === 0) return s.timing || s.at ? "unexpected_timing" : null;
  if (!s.timing) return "timing_required";
  if (s.timing === "custom") return s.at ? null : "at_required";
  if (s.at) return "unexpected_timing";
  if (s.timing !== "on_create" && !hasDue) return "due_required";
  return null;
}

export function notifyMoment(s: NotifySetting, due: Date | null, createdAt: Date, timeZone = DEFAULT_TIME_ZONE): Date | null {
  if (s.channels.length === 0 || !s.timing) return null;
  if (s.timing === "on_create") return createdAt;
  if (s.timing === "custom") return s.at;
  if (!due) return null;
  const day = addDays(berlinDay(due, timeZone), -(BEFORE[s.timing] ?? 0));
  return resolveRelativeDue(day, 0, SEND_TIME, timeZone);
}
```
  Export from `packages/core/src/tasks/index.ts`. Run tests → PASS.
- [ ] **Step 4:** Schema (`packages/db/src/schema/tasks.ts`), next to `snoozedUntil`:

```ts
export const taskNotifyTiming = app.enum("task_notify_timing", [
  "on_create", "due_day", "before_1d", "before_3d", "before_7d", "custom",
]);
// in task columns:
/** "Benachrichtigung senden an" (CF9-3): saved now, sent once mail/WhatsApp are connected. */
notifyChannels: text().array().notNull().default([]),
notifyTiming: taskNotifyTiming(),
notifyAt: timestamp({ withTimezone: true }),
// in the table's constraint list:
check("task_notify_channels", sql`${t.notifyChannels} <@ array['email','whatsapp']::text[]`),
check("task_notify_custom", sql`(${t.notifyTiming} = 'custom') = (${t.notifyAt} is not null)`),
check("task_notify_empty", sql`cardinality(${t.notifyChannels}) > 0 or ${t.notifyTiming} is null`),
```
  (Make `task_notify_custom` null-safe: `coalesce(${t.notifyTiming} = 'custom', false) = (${t.notifyAt} is not null)`.)
  `pnpm db:generate --name task_notify && pnpm db:migrate`. Inspect the generated SQL.
- [ ] **Step 5:** `pnpm check`. Commit `feat(tasks): notify setting rule and columns (CF9-3)`.

---

### Task 6 (CF9-3b): Notify fields in "Neue Aufgabe" and the task drawer

**Files:** Create `components/task/notify-fields.tsx`; modify `server/services/tasks.ts` (`NewTask`, `createTask`,
`updateTask`), the task query feeding the drawer (adds `notifyChannels`, `notifyTiming`, `notifyAt`, assignee email/phone),
`components/board/new-task-dialog.tsx`, `components/task/task-drawer.tsx`, the board server actions that call these services,
messages `board.json` (`notify.*`), `test/integration/` (the existing task service test file, e.g. `board-overview.test.ts`
or a new `task-notify.test.ts`).

**Interfaces:** `NewTask` and the `updateTask` input gain `notify?: { channels: NotifyChannel[]; timing: NotifyTiming | null; at: string | null }`
(`at` ISO instant). Service maps `checkNotifySetting` problems to `TaskInputError("invalid_notify")`. Audited in the
existing `task.create` / `task.update` diff.

- [ ] **Step 1: failing integration test** `test/integration/task-notify.test.ts`: create a task with
  `notify: { channels: ["email"], timing: "before_1d", at: null }` and a due date → row has those values;
  same without due date → `TaskInputError` with code `invalid_notify`; `updateTask` clearing channels clears timing.
  Use `createActor("owner")` / `resetDatabase()` from `../helpers/fixtures` like `venues.test.ts`.
- [ ] **Step 2:** Run `pnpm --filter web test:integration task-notify` → FAIL.
- [ ] **Step 3:** Implement in `createTask` / `updateTask`: parse `notify` (default empty), call
  `checkNotifySetting(setting, dueOn != null)`, write the three columns.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** `NotifyFields` client component (controlled; props `value`, `onChange`, `assignee: { name: string; email: string | null; phone: string | null } | null`, `hasDue: boolean`):
  - fieldset legend "Benachrichtigung senden an"; checkboxes "Mail", "WhatsApp";
  - when ≥ 1 ticked: `<select>` "Wann" with the six options (labels: "Sofort beim Anlegen", "Am Fälligkeitstag",
    "1 Tag vorher", "3 Tage vorher", "1 Woche vorher", "Eigenes Datum/Uhrzeit"); relative options `disabled` with hint
    "Braucht ein Fälligkeitsdatum" when `!hasDue`; custom reveals `<input type="datetime-local">` (convert to an
    instant as Europe/Berlin on submit — reuse the conversion the shift dialog uses, search for `datetime-local` in
    `components/team/shift-dialog.tsx`);
  - recipient line "An: {name}" or hint "Ohne zuständige Person wird nichts gesendet."; per channel missing data hint
    "{name} hat keine E-Mail-Adresse hinterlegt." / "… keine Telefonnummer hinterlegt.";
  - info note (status info style, `Info` icon + text): "Versand folgt, sobald Mail und WhatsApp angebunden sind."
  All strings under `board.notify.*` in de + en.
- [ ] **Step 6:** Wire into `new-task-dialog.tsx` (below Zuständig; `hasDue` from the due field, assignee from the
  selected staff option — extend the staff options query with `email`, `phoneE164` if missing) and into the task drawer
  (read-only summary "Mail · 1 Tag vorher an Anna" with "Ändern" opening the same fields inline, saving via `updateTask`).
- [ ] **Step 7:** Browser: create a task with Mail + "1 Tag vorher", reopen in the drawer, change to WhatsApp + custom.
  `pnpm check`. ux-concept (task dialog + drawer), data-model (task columns), Decided row. Commit
  `feat(tasks): "Benachrichtigung senden an" saved on the task, sending follows later (CF9-3)`.

---

### Task 7 (CF9-1a): Appointment validation, table and service

**Files:** Create `packages/core/src/appointments/{input.ts,input.test.ts,index.ts}`, `packages/db/src/schema/appointments.ts`,
`apps/web/src/server/services/appointments.ts`, `apps/web/test/integration/appointments.test.ts`; modify
`packages/core/src/index.ts`, `packages/db/src/schema/index.ts`.

**Interfaces (produces):**

```ts
// core
export type AppointmentDraft = {
  title: string; onDate: string; startsAt: string | null; endsAt: string | null;
  venueId: string | null; locationText: string | null; notes: string | null;
  contactId: string | null; contactName: string | null; contactPhone: string | null; contactEmail: string | null;
  saveContact: boolean;
};
export type AppointmentProblem =
  | "title_required" | "date_invalid" | "end_without_start" | "end_before_start" | "time_invalid"
  | "two_locations" | "contact_name_required" | "email_invalid";
export function checkAppointment(d: AppointmentDraft): AppointmentProblem | null;
// web service
export class AppointmentInputError extends Error { constructor(public code: AppointmentProblem | "not_found" | "conflict" | "phone_invalid") }
export async function createAppointment(actor: Actor, input: AppointmentDraft): Promise<{ id: string; title: string }>;
export async function updateAppointment(actor: Actor, id: string, input: AppointmentDraft): Promise<{ changed: boolean }>;
export async function archiveAppointment(actor: Actor, id: string): Promise<{ title: string }>;
export async function restoreAppointment(actor: Actor, id: string): Promise<{ title: string }>;
```

- [ ] **Step 1: failing core tests** — one `it` per problem code plus the happy paths: all-day; 09:00–10:30;
  end "00:00" with start "23:00" → `end_before_start` (no overnight appointments); venue + text → `two_locations`;
  phone only without name → `contact_name_required`; `contactId` set ignores inline fields; "a@b" → `email_invalid`.
  Use `clockTime` from `tasks/due.ts` for time parsing and `isIsoDate` for the date.
- [ ] **Step 2:** FAIL → implement `checkAppointment` (trim strings; empty → null first) → PASS.
- [ ] **Step 3:** Schema `appointments.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, date, index, text, time, uuid } from "drizzle-orm/pg-core";
import { archivedAt, id, timestamps } from "./_columns";
import { app } from "./_schema";
import { contact, venue } from "./catalogue";

/** "Termin" (CF9-1): a dated appointment for the business, with who to reach out to. Not a task. */
export const appointment = app.table(
  "appointment",
  {
    id: id(),
    title: text().notNull(),
    onDate: date().notNull(),
    startsAt: time(),
    endsAt: time(),
    venueId: uuid().references(() => venue.id, { onDelete: "set null" }),
    locationText: text(),
    notes: text(),
    contactId: uuid().references(() => contact.id, { onDelete: "set null" }),
    contactName: text(),
    contactPhoneE164: text("contact_phone_e164"),
    contactEmail: text(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (t) => [
    index().on(t.onDate),
    check("appointment_end_needs_start", sql`${t.endsAt} is null or ${t.startsAt} is not null`),
    check("appointment_end_after_start", sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check("appointment_one_location", sql`not (${t.venueId} is not null and ${t.locationText} is not null)`),
  ],
);
```
  Export from `schema/index.ts`. `pnpm db:generate --name appointment && pnpm db:migrate`.
- [ ] **Step 4: failing integration tests** `appointments.test.ts`: create (audit row `appointment.create`);
  create with typed contact + `saveContact: true` → exactly one new `contact` (kind `other`, phone normalised via
  `normalizePhone` from `@marktwerk/core` the way `services/contacts.ts` does) and the appointment has `contactId` set
  and inline fields null; `saveContact: false` keeps inline fields and creates no contact; field role without
  `event` write → forbidden; update records `{changes}`; archive + restore; restore of a non-archived → `conflict`.
- [ ] **Step 5:** Implement the service following `services/venues.ts` (create/update/archive/restore pattern):
  `if (!can(actor.role, "event", "write")) forbidden();` → `checkAppointment` → `db.transaction` → optional contact
  insert (reuse `parseContactInput` from `services/contacts.ts` to validate/normalise; insert inside the same `tx`, audit
  `contact.create` too) → insert/update → `audit(tx, actor.id, [...])`. Check `venueId`/`contactId` exist and are not archived.
- [ ] **Step 6:** Tests PASS. `pnpm check`. data-model.md (new table). Commit `feat(appointments): Termin table, rules and service (CF9-1)`.

---

### Task 8 (CF9-1b): Create / edit dialog, "+ Neu" and palette entry

**Files:** Create `components/appointments/appointment-dialog.tsx`, `app/(app)/termin-actions.ts`,
`server/queries/appointments.ts`, messages `appointments.json` (de + en, register in `i18n/messages.ts`); modify
`lib/creatable.ts`, `components/shell/topbar.tsx`, the palette actions list (search `palette.actions` usage),
`app/(app)/layout.tsx` (mount the dialog like the other `?neu=` dialogs), `messages/*/shell.json`.

**Interfaces:** `getAppointment(id)` / `listAppointmentsBetween(from, to)` / `listAppointmentsOn(day)` in
`server/queries/appointments.ts` returning
`{ id, title, onDate, startsAt, endsAt, venueId, venueName, locationText, notes, contact: { id: string|null, name, phone, email } | null }`;
server actions `createAppointmentAction`, `updateAppointmentAction`, `archiveAppointmentAction`, `restoreAppointmentAction`
returning `{ ok: true, id } | { ok: false, error: string, field?: string }` like the other action files (copy the shape
from `app/(app)/kalender/actions.ts` / `veranstaltungen/actions.ts`, each starting with `requirePermission`).

- [ ] **Step 1:** `CREATABLE` gets `"appointment"` with grant `can(role, "event", "write")`. Topbar `entries` gets, after
  `single`: `{ id: "appointment", group: "appointment", href: hrefWith(pathname, {neu: "termin"}), label: t("newAppointment"), icon: CalendarClock }`
  (on `/kalender` keep existing query params). Palette action "Termin anlegen". Messages `topbar.newAppointment`
  "Termin" / "Appointment", `palette.actions.appointment`.
- [ ] **Step 2:** Dialog (Base UI `Modal` like `new-task-dialog.tsx`; opened by `use-new-param.ts` when `neu=termin`,
  reads `datum` to pre-fill; `bearbeiten=<id>` opens it in edit mode). Fields per spec: Name, Datum, Ganztägig switch
  (default on) → Von/Bis `type="time"`, Wo (venue `<select>` of `listVenueOptions()` plus option "Adresse eingeben …"
  switching to a text input), Ansprechpartner (search input over contacts — reuse the contact options the venue form
  uses for landowners, `listLandownerOptions` in `server/queries/venues.ts`, or add `listContactOptions()` returning all
  non-archived contacts; option "Neuer Kontakt …" reveals Name/Telefon/E-Mail + checkbox "Als Kontakt speichern"
  checked by default), Notizen. Errors map problem codes to `appointments.errors.*` next to the field.
  Success toast "Termin angelegt" with Rückgängig → `archiveAppointmentAction`.
- [ ] **Step 3:** E2E `smoke.spec.ts`: press `c`, choose Termin, fill name + today, save → toast.
- [ ] **Step 4:** `pnpm check`. Commit `feat(appointments): create and edit Termin from "+ Neu" (CF9-1)`.

---

### Task 9 (CF9-1c): Kalender layer "Termine", Vorschau, Übersicht "Termine heute"

**Files:** Create `components/appointments/{appointment-chip.tsx,appointment-vorschau.tsx}`; modify
`server/queries/due.ts` (`CALENDAR_LAYERS`), `components/kalender/layers.ts` (`DEFAULT_LAYERS`, `PRESETS`,
`DEADLINE_GROUPS.deadlines`), `components/kalender/layer-panel.tsx`, `server/queries/kalender.ts`,
`app/(app)/kalender/page.tsx`, `components/kalender/{month-grid.tsx,list-view.tsx,day-more.tsx}`,
`components/overview/today-card.tsx`, `server/queries/overview.ts`, `app/(app)/page.tsx`, `test/integration/kalender-layers.test.ts`.

- [ ] **Step 1: failing test** in `kalender-layers.test.ts`: `"appointments"` is in `DEFAULT_LAYERS.deadlines` and the
  "marketsDeadlines" preset; parsing a URL without it turns it off; saved views without the key (older saves) treat it as on.
  Run → FAIL.
- [ ] **Step 2:** Add `"appointments"` to `CALENDAR_LAYERS` (after `"tasks"`), to `DEADLINE_GROUPS.deadlines`, icon
  `CalendarClock` in `LAYER_ICONS`, label `calendar.layers.appointments` "Termine"/"Appointments". Make older saved
  selections include it (in `parseLayers`/`getSavedLayers`, add missing new layer keys as on). Tests PASS.
- [ ] **Step 3:** `kalender/page.tsx`: when the layer is on, load `listAppointmentsBetween(gridFrom, gridTo)`, skip them
  when "Nur Achtung und Kritisch" is on, and render `AppointmentChip` (icon + "09:00" or "ganztägig" + title, neutral
  style, link to `?vorschau=termin:<id>` keeping params) before deadline chips in a day; list view rows likewise;
  "+N weitere" counts them.
- [ ] **Step 4:** `AppointmentVorschau` drawer (pattern of `components/events/event-vorschau.tsx`): title, date with
  weekday + KW, time, Wo (Ort link or text), notes, contact (name; phone via `formatPhone` as `tel:`; email `mailto:`;
  "In Kontakte öffnen" when linked), buttons Bearbeiten (`?neu=termin&bearbeiten=<id>`) and Archivieren (undo toast).
  Mount wherever `vorschau` is parsed on Kalender and Übersicht (`vorschau=termin:<id>` prefix).
- [ ] **Step 5:** Übersicht: `getOverview` (or `page.tsx`) also loads `listAppointmentsOn(today)`; `TodayCard` gets
  `appointments` and renders a first group "Termine heute" (all-day first, then by time) with keyboard rows
  (`data-row`, `data-peek="/?vorschau=termin:<id>"`). Empty → group not shown.
- [ ] **Step 6:** E2E: the Termin created in Task 8's test appears in `/kalender` and in the Übersicht Heute card;
  its Vorschau shows the contact. `pnpm --filter web test:e2e`.
- [ ] **Step 7:** `pnpm check`. ux-concept (Kalender layers, Übersicht, new Vorschau), Decided rows for CF9-1
  (own record, `event` permissions reused, contact save checkbox). Commit `feat(appointments): Kalender layer, Vorschau and "Termine heute" (CF9-1)`.

---

### Task 10: Wrap-up

- [ ] `pnpm check`, `pnpm --filter web test:integration`, `pnpm --filter web test:e2e` all green.
- [ ] Browser pass over every CF9 item in light + dark and at 375px; collect screenshots.
- [ ] Use superpowers:requesting-code-review on the branch; fix findings.
- [ ] Ask the product owner before pushing / opening the PR (`gh pr create`, body ends with the Claude Code line).
