# Handoff: session 2 → session 3 (local Claude Code)

**Written 2026-10-21 at the end of session 2.** Session 2 ran in the Claude Code cloud environment on branch
`claude/kind-ramanujan-80fns3` (pull request against `main`). Session 3 continues **locally** in Claude Code on the
product owner's machine. Read this file first, then the documents it points to. Repository:
[`coelln-konzept/marktwerk`](https://github.com/coelln-konzept/marktwerk).

> **Where things stand:** design direction **A, classic screens** is decided ([ADR 0019](./architecture/adr/0019-classic-screens.md)),
> the Claude Design output is integrated (tokens, components, docs), and **M1 is largely built**: schema + seed, app
> shell, Übersicht, Kalender, Veranstaltungen (+ "Aus Vorlage erzeugen"), the event page, Orte, Kontakte, Vorlagen,
> Team, Händler, with unit, integration and e2e tests. What's left of M1 is mostly **editing** master data (§7).

> **Session 3 (local, 2026-10-21), in progress on branch `claude/m1-master-data`:** PR #1 merged into `main` (CI
> green, Vercel deployed `main` → migration 0001 is on Supabase). Local setup on the product owner's Windows PC:
> no Docker/WSL, so a portable PostgreSQL 17.11 runs from `%LOCALAPPDATA%marktwerk-pg` on **port 5433** (5432 is
> taken by another Postgres), see [setup.md](./development/setup.md) "Windows without Docker". `.gitattributes`
> forces LF (Biome failed on CRLF checkouts); `TEST_DATABASE_URL` is now read from `.env`. **Editable now:** event
> duties (Team tab, `server/services/event-duties.ts`), Eckdaten (times + prices), booking flags ("Buchung" menu) and
> **Verschieben** with preview (`server/services/event-details.ts`; decisions in open-questions). Playwright's
> Chromium isn't installed locally yet (`pnpm --filter @marktwerk/web exec playwright install chromium`); CI runs e2e. Supabase still has **no seeded logins**: waiting
> for the repo secrets `DATABASE_MIGRATION_URL` + `SEED_OWNER_PASSWORD` (§8), then run *Seed dev database*.

---

## 1. What marktwerk is (in 5 lines)
An internal operations platform for **one** German company (Cologne area) that runs mainly **flea markets and
antique markets**, plus a few **Stadtfeste** and **Food & Wine** markets (other formats much later). Phase 1
**digitises** their work: events generated from presets, timeline templates → tasks on a kanban board, a company-wide
permit logbook, staff hours with the Minijob limit, payables with instalments, a company-wide calendar and a start
screen "Übersicht" with what's due today. The UI uses **classic screens** (sidebar + pages + Vorschau + detail drawers)
with the research-based improvements (ADR 0019). German UI first, English second.

## 2. Read in this order
1. [`CLAUDE.md`](../CLAUDE.md): non-negotiable conventions (also loaded automatically).
2. [`docs/product/vision.md`](./product/vision.md): goals and **product principles** (digitise → optimise → automate;
   internal first; human touch; no AI in operations).
3. [`docs/research/05-client-meeting-2026-10.md`](./research/05-client-meeting-2026-10.md): what the users actually said.
   This outranks desk research.
4. [`docs/product/roadmap.md`](./product/roadmap.md): phases and milestones (rev. 3.1).
5. [`docs/product/ux-concept.md`](./product/ux-concept.md) (v2) + [`wireframes.md`](./product/wireframes.md) (v3) +
   [ADR 0019](./architecture/adr/0019-classic-screens.md): the UI (classic screens, direction A). High-fidelity
   reference: the prototype in [`docs/design/claude-design/a-classic/`](./design/claude-design/a-classic/INDEX.md).
6. [`docs/architecture/data-model.md`](./architecture/data-model.md) (v0.4) and
   [`overview.md`](./architecture/overview.md).
7. [`docs/open-questions.md`](./open-questions.md): **decisions log** and what's still open.
8. The Claude Design output in `docs/design/claude-design/a-classic/` and the
   [component inventory](./design/component-inventory.md) (see §6).

Research background (only when needed): `docs/research/01–09`.

## 3. State of the repository (end of session 2)
| Area | State |
|---|---|
| Monorepo | pnpm 10.34.7 + Turborepo; Node 24 (min 22.18); TypeScript 6.0.3; Biome 2.5 (only linter/formatter; `docs/design` is excluded) |
| `apps/web` | Next.js 16.4.2 (App Router, Turbopack, Cache Components **off**, `proxy.ts`, typed routes), React 19.3, Better Auth 1.7, next-intl 4 (DE/EN via cookie), Tailwind 4 with the design tokens, Base UI 1.9 (Dialog, Menu), Inter via `@fontsource-variable/inter` |
| Shell | `components/shell/*`: sidebar (Orte + Kontakte as own entries, SPÄTER group), top bar (breadcrumb, search field **Strg K** → command palette, "+ Neu", bell), profile menu (Design System/Hell/Dunkel, Dichte Standard/Kompakt, Sprache, Abmelden; stored in `user_preference`, mirrored to cookies, restored at login), undo toasts, not-found page |
| UI kit | `components/ui/*`: button, input, label, panel, table (+ group rows, row actions), status badge, rollover badge, health shapes (● ▲ ■ ○), event-type tag, filter chips, kbd, empty/skeleton states, avatar, Vorschau card + facts, keyboard rows (J/K/Space/Enter), auto-submit select, coming-soon. Mapping to the design: [`design/component-inventory.md`](./design/component-inventory.md) |
| Screens | `/` Übersicht · `/kalender` (layers saved per person) · `/veranstaltungen` (list + month calendar, KW, Vorschau `?vorschau=<id>`, generation sheet `?erzeugen=1[&vorlage=<id>]`) · `/veranstaltungen/[id]` with tabs (Überblick, Team, Notizen (editable), Verlauf (audit log); Board/Genehmigungen/Geld/Dokumente are milestone placeholders) + "Status ändern" with undo · `/orte`, `/orte/[id]` · `/kontakte` · `/vorlagen` (presets) · `/team` (`?person=<id>`) · `/haendler` (read-only, paginated). Placeholders: board, logbuch, finanzen, firma, wissen, benachrichtigungen, einstellungen |
| Services | `server/services/events.ts` (**the one path** that creates events: `createEventsFromPreset`, undo `archiveDraftEvents`), `event-lifecycle.ts` (status transitions + revert, notes), `audit.ts`. Field users are scoped by `visibleEvents(actor)` in `server/actor.ts` |
| `packages/core` | + calendar arithmetic & ISO weeks, NRW holidays (Easter-based), booking cut-off, `upcomingWeekend`, rrule expand/describe, default anchors, scheduling checks (weekend cap 4, venue conflicts, holidays), event health, lifecycle transitions, umlaut folding. **67 tests** |
| `packages/db` | Migration **`0001_m1_events`**: `legal_parameter`, `event_type`, `contact`, `venue`, `zone`, `row`, `location_agreement`, `staff_member`, `duty_role`, `event_preset`, `event`, `event_anchor`, `event_duty`, `vendor`, `user_preference`; `settings.bundesland` |
| Seed | `pnpm db:seed` loads the synthetic dataset (148 events 2026–2027, 12 venues, 43 zones, 162 rows, 30 contacts, 14 staff, 7 duty roles, 14 presets, 1,500 vendors) idempotently; logins for staff with a permission role. The public dev password is used **only for a local DB** (elsewhere: `SEED_OWNER_PASSWORD` / `SEED_STAFF_PASSWORD`) |
| i18n | `apps/web/messages/<locale>/<area>.json`, one namespace per area, loaded by `src/i18n/messages.ts`; `pnpm --filter @marktwerk/web test` fails if de/en keys differ |
| Tests | `pnpm check` (Biome + typecheck + core 100 + synthetic 46 + message check) · `pnpm test:integration` (38 service tests against `marktwerk_test`: events, event duties, event details) · `pnpm test:e2e` (Playwright smoke, 5 tests, needs a running seeded app). All green at handoff; `pnpm build` passes |
| CI | `ci.yml`: lint, typecheck, test, migrate, build, integration tests; new `e2e` job (build + `next start` + Playwright; **first run happens on the PR**). `seed-dev.yml`: manual seeding of the Supabase dev DB. `cron.yml` unchanged |

## 4. Infrastructure and local setup
| Piece | Details |
|---|---|
| GitHub | `coelln-konzept/marktwerk`. Session 2's work is on `claude/kind-ramanujan-80fns3` with an open PR to `main`; merge it (after CI is green and you've clicked through the Vercel preview), then work from `main` or a new branch |
| Vercel | Project in team "Arda's projects", root `apps/web`, region fra1; deploys `main` (and previews for branches). The build runs `drizzle-kit migrate`, so **migration 0001 reaches the Supabase dev DB with the first deploy that contains it** (previews too, if they share `DATABASE_MIGRATION_URL`). Still to record: the production URL in `README.md` + `docs/development/deployment.md` |
| Supabase | `marktwerk-dev` (ref `qtwwivadqeloszijsppa`, eu-central-1, Postgres 17); app role `marktwerk_app` via the pooler (6543 app / 5432 migrations); schema `app`. After 0001 is applied: run **Actions → Seed dev database** (`confirm: seed`) with secrets `DATABASE_MIGRATION_URL` (+ optional `SEED_OWNER_PASSWORD`, `SEED_STAFF_PASSWORD`), see [deployment.md](./development/deployment.md). From a local machine you can also run `pnpm db:seed` with `DATABASE_MIGRATION_URL` set |
| Env vars (Vercel) | `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET`, `APP_TIMEZONE`, (to confirm) `BETTER_AUTH_URL` + `APP_URL`. Secrets live only in Vercel/GitHub |
| Production hosting | Not decided (Scalingo candidate, ADR 0006); decide before the pilot with real data (ADR 0017) |

### Local setup (session 3)
Prerequisites: **Node 24** (`.nvmrc`; on Windows e.g. `fnm` or `nvm-windows`), **pnpm 10** (`corepack enable`),
**Docker Desktop** (Postgres 17 + Mailpit), Git, Claude Code. On Windows, PowerShell works; WSL 2 is also fine.
```bash
git clone https://github.com/coelln-konzept/marktwerk.git && cd marktwerk
git checkout claude/kind-ramanujan-80fns3      # or main once the PR is merged
pnpm install
cp .env.example .env                           # PowerShell: Copy-Item .env.example .env
# set BETTER_AUTH_SECRET in .env, e.g.: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev                                       # http://localhost:3000 · login owner@marktwerk.local / marktwerk-dev-123
```
Other seeded logins (same local password): `burak.lax@example.com` (manager), `natalia.schulze@example.com` and
`annabel.green@example.com` (staff). There is no field login in the seed yet. Integration tests need the DB running
(`pnpm test:integration` creates `marktwerk_test`); e2e needs `pnpm dev` running (`pnpm test:e2e`). Mailpit:
http://localhost:8025. Details: [development/setup.md](./development/setup.md), [testing.md](./development/testing.md).

### Notes from the cloud sessions (mostly irrelevant locally)
- The cloud sandbox blocked `*.vercel.app`, `ui.shadcn.com` and TCP to Supabase; locally these work. **Don't
  `shadcn add --overwrite`** the existing `components/ui/*`: they are hand-written to match the design now.
- **Never edit applied migrations** (`0000_foundation`, `0001_m1_events`); generate new ones.
- Installing packages while `pnpm dev` runs can break Turbopack's module graph: restart `pnpm dev` after installs.
- Next.js 16: read `apps/web/node_modules/next/dist/docs/` before writing Next code (`apps/web/AGENTS.md`).
- Supabase MCP `execute_sql` hangs on destructive statements; use `apply_migration` for DDL.

## 5. Decisions already made (don't re-ask)
Full log with dates: [`docs/open-questions.md`](./open-questions.md). Highlights:
- Single company; Germany; DE + EN UI; core record **`event` (Veranstaltung) with a type**; scope Flohmarkt,
  Antikmarkt, Stadtfest, Food & Wine; say vendor/visitor, never customer.
- Phase 1 = **digitise only**; order after the core: staff hours & Minijob, then payables & instalments. WhatsApp,
  staff magic links and shift suggestions → Phase 2 (M7). Old website stays; bookings processed internally in Phase 2.
- Template changes never propagate automatically (deliberate action, nothing pre-selected). Escalations go to the
  manager only. Field users see only their events. Vendor list imported read-only in Phase 1.
- No AI in operational flows (ADR 0014). Payment reminders are sent by people. Finance = operational layer; the tax
  advisor keeps the books (ADR 0015).
- **UI (ADR 0019, UX concept v2)**: classic screens; sidebar + top bar (search/Strg+K, "+ Neu", notifications); every
  view a page with its own URL; Vorschau and detail drawers (linkable via search params); event tabs with counts;
  start screen **"Übersicht"** for everyone (KPIs, season strip, Heute fällig, Nächstes Wochenende), no master-detail;
  company-wide **Kalender** module with layers; font **Inter** (self-hosted); neutral German wording with "du"; light
  default + dark/system; Standard density + "Kompakt". No workspace, docking or saved layouts (ADR 0018 superseded).
- Dev hosting Vercel + Supabase free tiers with synthetic data (ADR 0017); production host later.

## 6. Design (done in session 2)
- Prototype (direction A, 53 screens): [`docs/design/claude-design/a-classic/`](./design/claude-design/a-classic/INDEX.md);
  open `index.html#<ScreenId>` in a browser. Where prototype and docs differ, the prototype wins unless a decision
  says otherwise.
- Tokens in [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css) (`light-dark()` pairs, `html[data-theme]`,
  `html[data-density]`), summarised in [ux-concept §9](./product/ux-concept.md); component mapping and known gaps in
  [`design/component-inventory.md`](./design/component-inventory.md) (Kompakt label-beside-field, sidebar icon rail,
  focus return after Vorschau, a keyboard-accessible drag-and-drop library for the M2 board).

## 7. M1 status and what's next
**Done** (exit criterion met with synthetic data: a full season of events with dates, types and teams, browsable):
schema + seed, shell, Übersicht, Kalender, Veranstaltungen list/calendar, generation from presets (preview with
holiday/weekend-cap/venue warnings, one service path, audit, undo), event page (Überblick, Team, Notizen, Verlauf,
status changes with undo), Orte, Kontakte, Vorlagen, Team, Händler, core rules + tests, integration + e2e tests, CI,
seed workflow.

**Still open in M1** (suggested order):
1. ~~Merge the PR; let Vercel deploy (applies 0001)~~ (done in session 3). Still: seed Supabase via the workflow once
   the secrets exist (§8); product owner clicks through `marktwerk-ardas-s-projects.vercel.app` (Vercel login).
2. **Edit master data** (all via services: permission → transaction → audit): ~~event duties on the Team tab~~ (done:
   `setEventDuty`, row menu with preferred people first, same-day clash hint, undo, Verlauf; in M2 it should also
   reassign the open tasks of that role), ~~event dates/times/prices/booking flags~~ (done: Eckdaten modal, "Buchung"
   menu, "Verschieben" with preview; event *name*, duration and venue are not editable yet), presets (create/edit,
   default team, rrule), venues + zones/rows, contacts. Modals for ≤ 8 fields, pages for more (UX concept §4).
3. **Einzeltermin** (single event without preset) through the same `createEvents` service path, and **location
   agreements** (fixed dates → events; table exists, no UI).
4. **Einstellungen**: company settings, users & permission roles (Better Auth admin), legal parameters (read-only list).
5. Field-user check: add a seeded field login (staff member with duties) and verify scoping end-to-end.
6. Smaller gaps: "+ Neu" context-aware + `C` shortcut; Vorschau focus return; Kompakt label-beside-field;
   consolidate the two `phone.tsx` helpers (`components/catalogue`, `components/people`); the month grid on phones.
Then **M2: templates, tasks & kanban** (roadmap) — needs the timeline workshop input and a drag-and-drop decision.

## 8. Open items for the product owner
**Product questions raised while building M1** (answers → decisions log):
1. Verlauf (audit history) tab: only owner/manager (`audit:read`) for now. Should staff see it?
2. Past and cancelled events show Team health as "noch offen" (not tracked). OK, or show it anyway?
3. Übersicht shows the next season's count once ≤ 10 % of the current season is still ahead. Right trigger?
4. Kalender preset "Märkte + Genehmigungen" = Flohmärkte + Antikmärkte + holidays (permits join in M3). OK?
5. Kalender "Liste · 6 Wochen" starts today (like the prototype), not on Monday. OK?
6. Inactive presets: offer "reactivate" and generation from them?
7. Händler: newsletter consent label "Soft-Opt-in". Wording OK?
8. "Veranstaltungen kommend" counts events running today. OK?
9. Event duties can be changed on every non-archived event, also past, cancelled and closed ones. Lock them after
   "abgeschlossen"?
10. Someone who already has a duty at another event on the same days is only flagged ("am selben Tag bei …"), not
    blocked. OK?
11. Eckdaten and booking flags can be edited on every non-archived event, also closed/cancelled ones (like duties).
    Lock after "abgeschlossen"?
12. Should the event name, the duration (multi-day) or the venue be editable on an event, or only via the preset?

**Infrastructure:** production URL is `https://marktwerk-ardas-s-projects.vercel.app` (behind Vercel Authentication;
`marktwerk.vercel.app` is someone else's app) → record in README + deployment.md and set as `BETTER_AUTH_URL`/`APP_URL`; confirm `BETTER_AUTH_URL`/`APP_URL` in Vercel and
`APP_URL`/`CRON_SECRET` for `cron.yml`; add `DATABASE_MIGRATION_URL` (+ seed password secrets) for `seed-dev.yml`.

**Client discovery** (see open-questions): timeline workshop per event type with time estimates (feeds M2), permit
inventory per location, staff list & payroll format, payables list, vehicles; old-website DB access later. Before the
pilot: production hosting decision, tax-advisor questions.

## 9. First message for session 3 (local Claude Code)
> Read `docs/HANDOFF.md` and the files it lists (CLAUDE.md is loaded automatically). We're continuing locally now,
> not in the cloud environment: check my local setup first (Node 24, pnpm, Docker, `.env`), start the database, run
> `pnpm db:migrate && pnpm db:seed`, then `pnpm check` and `pnpm test:integration` to confirm everything is green.
> Then check the state of the session-2 pull request (`claude/kind-ramanujan-80fns3` → `main`) with `gh pr view` and
> its CI; fix anything red. After that, continue with the open M1 items in HANDOFF §7 (start with editing event duties
> and master data), asking me before product or architecture decisions that aren't settled in the docs. Use
> `gh` for GitHub. Commit in small steps with `pnpm check` green, and keep HANDOFF.md current at the end.
