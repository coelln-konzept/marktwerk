# Research 14: Shift allocator (Schichtplanung) for Minijob crews

*2026-11-26. Eleven parallel research passes, ten on the web and one on this repo. They build on
[research 06](06-staff-whatsapp-shifts-kanban.md) and update it where marked. Vendor help pages are the strongest
sources. Reviews and blogs are anecdotal, and points marked (unverified) were not confirmed. For legal points,
confirm with the tax advisor.*

**The ask (Jerome, via the product owner):** a lightweight first version. Assign team members, mostly
Minijobbers, to individual market days. See for each person how many hours they have used and how many are left,
so the office can plan and stay on top of shifts.

---

## 1. What we already have (M4, UI hidden behind `HIDDEN_MODULES.team`)

| Piece | Where | Relevance |
|---|---|---|
| `shift`: one row = one person on one day; planned and actual `time`, break, status `requested / confirmed / declined / worked / no_show / cancelled`; versioned with `shift_revision` | `packages/db/src/schema/staff.ts` | This is already the assignment record. No new core table is needed. |
| `employment_contract`: type, dated hourly rate, `contracted_hours_per_week`, other Minijobs declared | same | Gives the rate for converting € ↔ h. |
| `legal_parameter`: minimum wage, Minijob limit, overrun factor, ArbZG limits, all dated | `legal.ts` | 2026: 1390 / 60300; 2027: 1460 / 63300. |
| `personMonth`, `minijobEarningsStatus`: remaining allowance, amber/red, overrun months, YTD | `packages/core/src/staff/hours.ts`, `minijob.ts` | **Planned shifts already count** toward used allowance (worked + planned). |
| `checkWorkingTime`: ArbZG daily maximum, rest period, missing break, overlap | `worktime.ts` | Can run live while assigning. |
| `/team/stunden`: a person × day grid for a month with totals and status | `components/team/month-grid.tsx` | Display only. It has no assign interaction. |
| `/veranstaltungen/[id]/team`: one person per duty role for the whole event (`event_duty`), plus that event's shift list | | Not per day, and not linked to shifts. |
| `event.schedule`: team rows (setup / open / teardown) per day | `events.ts` | Never used to pre-fill planned times. |

**Gaps:**
- There is no planning screen. Shifts are created one at a time in a dialog.
- There are no weekly figures.
- Planned times are not taken from the event's schedule.
- The seed has no future planned shifts.
- `team` is one flag that also gates task assignees, search and the Kalender layer.

## 2. What the market does

**German SMB tools**

| Tool | Cap model |
|---|---|
| Shiftbase | The only one with an explicit Minijob concept. Shows a piggy-bank icon with used / max **hours** per month (past = approved actual, future = planned), derived from the wage. **Warns only once the limit is exceeded and never blocks.** Carries balances over. No annual view. |
| Papershift | Target hours per week or month, as a soft limit (colour) or a hard limit (blocks planning). No € logic. |
| Staffomatic, Factorial | Show planned vs contracted hours. No Minijob logic. |

**US SMB tools: When I Work, Deputy, Homebase, 7shifts, Sling**
- All of them use a **person × day grid** as the main view.
- They show "scheduled / max" under each name, red when over (When I Work, Sling).
- They **warn but don't block**.
- Draft vs published state (e.g. Sling's dotted border), copy-week, and optional staff confirmation.
- Reviews praise the grid, copy and templates, and notifications on publish. Auto-scheduling, forecasting and labour
  budgets get mixed reviews.

**Event-staffing tools: Crew Brain, Staffcloud, Rentman, Stager**
- The **event is the main object**: per-role headcount, with open slots shown as gaps (e.g. "4/6").
- Each slot has a status (open / requested / confirmed / declined).
- Conflicts are warnings, not blocks.
- None of them tracks a Minijob earnings cap.

**Overall:** nobody shows the Minijob cap in euros against the legal rules (monthly, 2-in-12 overruns, annual).
This is where a custom tool can beat the off-the-shelf options.

## 3. How small operators do it today

- One master sheet (Excel or paper) kept by one office person. "Wer kann Sonntag?" goes out in WhatsApp groups,
  and the answers are copied over by hand.
- Confirmations and sick notices arrive by chat, separately from the plan.
- Hours are reconciled after the fact for payroll. This matches the client's monthly document (research 05).
- Flea markets rely on a **small trusted core** of 3–4 reliable helpers. Set-up windows are fixed and early
  (06–08 h), so the morning slot cannot be missed.
- **Pain points, ranked:**
  1. No single current version of the plan.
  2. Last-minute cancellations.
  3. Not knowing who is free.
  4. Breaking the Minijob cap.
  5. No-shows.
  6. Fairness: the same few people get all the work.

## 4. Legal frame for the allocator (updates research 06)

1. **The limit is on money, monthly. There is no weekly limit.**
   - €603/month (2026) and €633 (2027) = minimum wage × 130 ÷ 3, so ≈ 43.4 h/month at minimum wage. A higher
     personal rate means fewer hours.
   - Annual: 12 × limit (€7,236 / €7,596), judged as a forward-looking forecast.
   - The ≈ 10 h/week behind the formula is only a soft planning guide.
2. **Overruns:**
   - Allowed only if unforeseeable (e.g. covering for a sick colleague), **max 2 months in a rolling 12-month window
     ("Zeitjahr")**, each ≤ 2 × the limit.
   - **Never for planned extra shifts.** A planned overrun is therefore a real red flag. Only an unforeseen
     cover-shift justifies one (with a recorded reason, `overrun_justification`).
3. **Sunday and holiday surcharges:** tax-free and social-insurance-free (§3b EStG) and do **not** count toward the
   limit, if the base pay is ≤ €25/h and the hours were actually worked. **Use the base rate for the budget.**
4. **Several Minijobs add up** against one limit. We can't see other employers, so we need the declared other
   earnings.
5. **§12 TzBfG (on-call work):**
   - The contract must state hours (otherwise 20 h/week are deemed agreed, which blows the limit).
   - If no daily hours are agreed, each call-up is ≥ 3 consecutive hours.
   - Staff need not work unless told **≥ 4 days ahead**. This matters for last-minute assignment.
6. **ArbZG:** break 30 min > 6 h and 45 min > 9 h (unpaid, deducted); max 10 h/day; 11 h rest; ≥ 15 free Sundays
   a year; a substitute rest day within 2 weeks for each Sunday worked. Markets are an allowed Sunday exception
   (§10(1) Nr. 9).
7. **Travel:** the commute to a fixed site is unpaid. Travel from the depot to the market, transport and set-up are
   paid working time.
8. **Werkstudenten:** ≤ 20 h/week across all jobs during lecture periods. Pensioners on an old-age pension have no
   earnings cap since 2023.
9. **§17 MiLoG:** record actual times within 7 days and keep them 2 years (already built).
10. The electronic time-recording law was still a draft on 2026-11-18 and has not passed.

## 5. UX conventions for this scale (10–25 people, 3–6 event days per weekend)

- **Main view:** a person × event-day matrix for a week or weekend.
  - Column header: "Sa 14.6 · Domplatz · 3/4".
  - Sticky name column with the person's month figure always visible, even in week view.
  - Footer row with the number of staff per day and "fehlt 1" for gaps.
- **Assigning:** click (or Enter) on a cell opens a popover: assign or remove, role, times.
  - A "+ Person" control on a column opens a searchable picker **sorted available-first, showing each person's
    hours left after this shift**.
  - Drag is optional and always needs a menu alternative.
  - Use a popover, not a modal, so the grid stays in view.
- **Warnings:**
  - Stay quiet by default. Only the person's capacity bar changes colour.
  - Mark the cell that tips someone over with a small flag; the explanation goes in the popover.
  - Colour is never the only signal: always add an icon and text.
- **Unavailability:** a hatched, muted cell with "nicht verfügbar". It can still be assigned, after a confirmation.
- **Mobile:** a day-by-day list (one card per market day, with "+ Person" and hours left). Horizontal scroll with a
  sticky name column is acceptable for a few day columns.
- **Accessibility:** use the ARIA grid pattern with roving tabindex, or a plain table with buttons. A half-built
  `role="grid"` is worse than either. Cell labels read like "Anna, Samstag 14.6., Domplatz, eingeteilt, 6 h", and
  changes are announced in a live region.
- **Avoid:**
  - an hour-by-hour time axis (one slot per person per day);
  - a 31-column month grid (use weekends as columns for the month summary);
  - several alternative views.

## 6. Showing hours used and left

- **The unit is the month.** Weekly targets mislead for weekend-only crews: a 0 / 0 / 0 / 12 h month would show
  normal weekends in red.
- **Primary figure:** € against the limit, with hours alongside, e.g. "€412 von €603 · noch 9,5 h".
  - Hours alone break with personal rates and mid-month rate changes.
  - Cost each shift at the rate valid on its date. Convert "remaining" at the current rate.
- **Stacked bar:**
  - solid = worked (past);
  - lighter or hatched = planned (future);
  - empty = remaining;
  - a marker previews the shift being assigned right now.
- **Colour by planned + worked, not worked only.** Otherwise everything looks green until it's too late.
  - < 85 %: neutral
  - 85–100 %: amber, with the remaining figure in bold
  - \> 100 %: red, with "Überschreitung", the overrun count (n of 2) and the 2× ceiling
- **Secondary line:** "Jahr €5.100 von €7.236 · Überschreitungen 0 von 2" (rolling 12 months).
- **Weekly:** a plain count of this week's hours and shifts, with no target and no colour, unless the person has
  contracted weekly hours (non-Minijob) or is a Werkstudent.

## 7. Data model choices seen elsewhere

- **Need vs assignment:**
  - Timefold, Odoo, TimeTrex and Deputy model a need ("2× Kasse") as **open shift rows with no person**, one per
    head.
  - Event tools use event → day → slot (role, headcount) → assignment.
  - Nobody keeps both a requirements table and open rows in a small system.
- **Draft vs published:** always a flag or timestamp on the shift (`published_at`) plus a "publish range" action.
  Never a copy of the plan.
- **Planned vs actual:** large tools use separate tables (roster vs timesheet). Our single row with planned and
  actual columns is fine with one actual block per shift.
- **Totals:** compute them (query or view, or a pure function as we do now). Don't store them.
- **Availability:** `staff_availability(staff_member_id, date, kind)`. Treat "no answer" as different from
  "available".
- **Recurrence and templates:** not needed. Markets are dated events, and event presets already exist.

## 8. Do's and don'ts for a lightweight v1 (consolidated, ranked)

**Do**
1. **Keep the human as the allocator.** The tool ranks "who's free and has hours left" and the office decides.
   Auto-scheduling at 15 people with irregular one-off events performs worse than people do.
2. **One authoritative plan per market day.** This is the core value over Excel plus WhatsApp.
3. **Warn, don't block.** Allow an override, with a reason where the law needs one (overrun months).
4. **Show the cap where the decision happens:** in the picker ("after this shift: 38 / 43 h") and in the row
   header.
5. **Pre-fill times from `event.schedule`** (team set-up / open / teardown), so assigning is one click.
6. **Keep recording actual times cheap:** confirm the planned times per market day in one pass (already designed
   for M4).
7. **Make fairness visible:** a simple count of shifts or weekends per person, and sort by "least recently
   assigned". No scoring.
8. **Publish early and keep the plan stable.** Respect the 4-day notice rule.

**Don't**
1. No auto-scheduler, forecasting or labour-cost budgets.
2. No staff app, and no forced logins (M7 brings magic links and wa.me).
3. No notification spam: at most "plan published" and "your shift changed", digested.
4. No surveillance: no read receipts used against staff, no GPS (§87 BetrVG, GDPR).
5. No front-loaded setup: no skills matrices, rules engines or availability templates.
6. No hard caps set once and impossible to change, and no rigid fixed-day target-hours models.
7. No shift swaps, open-shift bidding or auto-release in v1. With WhatsApp, silence is common, and auto-release
   would drop real bookings.
8. No payroll or DATEV logic beyond what M4 already has.

## 9. Open product questions (to settle with the product owner, logged in open-questions.md)

1. ~~What does "hours left" mean?~~ **Decided 2026-11-26:** monthly hours budget, default 40 h, adjustable per person.
2. ~~Event-centric or person-centric?~~ **Decided 2026-11-26:** both, on one data model (people grid for the office, market-day list on the event Team tab and mobile).
3. ~~Model needs?~~ **Decided 2026-11-26:** yes. They come from the event preset (role × headcount) and can be edited per day. Open slots show as gaps.
4. ~~Times pre-filled?~~ **Decided 2026-11-26 (follows from 3):** yes. A slot takes its times from the event Zeitplan (team setup/open/teardown for that day) and can be edited per shift.
5. ~~Draft/publish?~~ **Decided 2026-11-26:** no. Assignments are live at once.
6. ~~Unavailability?~~ **Decided 2026-11-26:** yes. The office records "nicht verfügbar" per person and date(s), with an optional note. It is a warning, not a block. No recurring rules or self-service in v1.
7. ~~Confirmation?~~ **Decided 2026-11-26:** yes, set by the office: angefragt → bestätigt / abgesagt.
8. ~~Relation to `event_duty`?~~ **Decided 2026-11-26:** slots start empty. `event_duty` (Verantwortlich) and preferred roles rank the picker, and there is no auto-fill.
9. ~~Visibility?~~ **Decided 2026-11-26:** split the flag. `team` stays hidden and covers task assignment only. A new flag shows the people and shift area: Team pages, the event Team tab, Rechtliches and staff search.
10. ~~Who uses it?~~ **Decided 2026-11-26:** owner and manager only, through the existing `team` permission. No new permission. Field leads' day view waits for the M7 magic links.
