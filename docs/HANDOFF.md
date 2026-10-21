# Handoff: session 1 → session 2

**Written 2026-10-21 at the end of session 1; being updated in session 2** (2026-10-21, branch
`claude/kind-ramanujan-80fns3`). Sections 3-5 still describe the state at the end of session 1; §6 is current for the
design work; the M1 section (§7) is updated at the end of session 2. The Claude Design output is in
[`docs/design/claude-design/`](./design/claude-design/).

> ✅ **Design direction decided (session 2, 2026-10-21):** **A, classic screens** (sidebar, pages, Vorschau, detail
> drawers), no customisable workspace ([ADR 0019](./architecture/adr/0019-classic-screens.md), superseding ADR 0018).
> The docs are updated (§6, step 0).

Read this file first, then the documents it points to. The repository is
[`coelln-konzept/marktwerk`](https://github.com/coelln-konzept/marktwerk): `main` holds the state at the end of session 1
(§3 describes it); session 2 works on branch `claude/kind-ramanujan-80fns3` (M1 build and design integration).

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

## 3. State of the repository
| Area | State |
|---|---|
| Monorepo | pnpm 10.34.7 + Turborepo; Node 24 (min 22.18); TypeScript 6.0.3; Biome 2.5 (only linter/formatter) |
| `apps/web` | Next.js 16.4.2 (App Router, Turbopack, **Cache Components off**, `proxy.ts`), React 19.3, Better Auth 1.7 (email+password, no signup, roles owner/manager/staff/field), next-intl 4 (DE/EN via cookie), Tailwind 4 + hand-written shadcn-style `button/input/label/card` (Base UI), placeholder shell (sidebar + overview page), login, `/api/health`, `/api/cron/[job]` |
| `apps/worker` | pg-boss 12 worker for local/always-on hosting; jobs come from `@marktwerk/jobs` |
| `packages/core` | Pure domain logic + tests: permission matrix (`can()`), `resolveRelativeDue` (DST-safe), reminder rules/dedupe keys, **Minijob allowance** (`minijobMonthStatus`) |
| `packages/db` | Drizzle 0.45.4, **all tables in Postgres schema `app`** (`pgSchema("app")`, `schemaFilter: ["app"]`); only foundation tables so far: Better Auth (`user`, `session`, `account`, `verification`), `settings`, `audit_log`; one migration `0000_foundation` |
| `packages/jobs` | Job registry (`deadline-sweep` every 15 min, `daily-digest` 07:00); handlers are **stubs** until M3 |
| `packages/synthetic` | Deterministic synthetic dataset (seed 20261021, reference date 2026-10-21): 148 events, 5,774 tasks, 234 permits, 90 payables, 1,500 vendors, 5,817 bookings…; `pnpm synth` → `packages/synthetic/out/*.json` (gitignored). **Not yet loaded into the DB** (that's M1). |
| Tests | `pnpm check` = Biome + typecheck (6 packages) + tests (core 21, synthetic 46). All green at handoff. |
| CI | `.github/workflows/ci.yml` (lint, typecheck, test, migrate, build on Postgres 17); `cron.yml` (calls `/api/cron/<job>`) |

Commit history: `e36c6ce` setup → `fd3444b` meeting revision → `a241381` scope/hosting → `4465f5f` synthetic data →
`a1c3966` serverless → `ca94604` app schema + dev hosting → `1ca328e` UX concept → `71882a3` handoff →
`116708d` Claude Design follow-up prompt for the v1 design.

## 4. Infrastructure (development)
| Piece | Details |
|---|---|
| GitHub | `coelln-konzept/marktwerk`, branch `main`; Vercel auto-deploys on push |
| Vercel | Project imported by the product owner in team "Arda's projects", root `apps/web`, region fra1. **Verified working** (login on the deployed app created a session in the DB). The product owner has the production URL; ask for it and add it to `README.md` + `docs/development/deployment.md`. |
| Supabase | Project **`marktwerk-dev`** (ref `qtwwivadqeloszijsppa`, eu-central-1, Postgres 17), free org "Arda's. Org" (the project *sidebet* was paused to stay within the free limit; restorable). App connects as role **`marktwerk_app`** via the Supavisor pooler (6543 app / 5432 migrations). Schema `app` owned by `marktwerk_app`; `anon`/`authenticated` have no access. One owner user `owner@marktwerk.local` (password known to the product owner). |
| Env vars (Vercel) | `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET`, `APP_TIMEZONE`, and (to confirm) `BETTER_AUTH_URL` + `APP_URL`. **Secrets are only in Vercel**; the session-1 scratchpad with the values is gone. If a value is needed, ask the product owner or rotate it. |
| Scheduled jobs | GitHub repo variable `APP_URL` + secret `CRON_SECRET` needed for `cron.yml` (product owner to confirm they're set). |
| Local dev | `pnpm db:up` (Docker Postgres 17 + Mailpit) → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`. Login `owner@marktwerk.local` / `marktwerk-dev-123`. |
| Production hosting | **Not decided.** Scalingo (EU-owned) is the documented candidate (ADR 0006, deferred); decide before the pilot with real data (ADR 0017). |

### Environment gotchas observed in session 1 (cloud sandbox)
- The sandbox's egress proxy **blocks `*.vercel.app`**, `ui.shadcn.com` (so `shadcn add` fails: components were
  hand-written; run `shadcn add` from a local machine, or keep hand-writing) and direct Postgres TCP to Supabase.
  WebFetch to most sites failed; WebSearch worked.
- **Vercel MCP connector** can list teams but **cannot create or see projects** (403/empty). Treat Vercel as manual.
- **Supabase MCP `execute_sql` times out on destructive statements** (`DROP …`); it seems to wait for a confirmation
  that never arrives. Use non-destructive SQL; use `apply_migration` for DDL. Don't use `SET ROLE` there either.
- **Migrations on Supabase:** the Vercel build runs `drizzle-kit migrate` with `DATABASE_MIGRATION_URL`. The
  foundation migration was applied manually and recorded in `drizzle.__drizzle_migrations`, so future migrations
  (0001+) apply normally at build time. **Never edit `0000_foundation` again**; add new migrations.
- **Seeding Supabase:** the sandbox can't reach Supabase over TCP. Options: a manual GitHub Actions workflow
  (`workflow_dispatch`) that runs the seed with a `DATABASE_MIGRATION_URL` secret (recommended), or the product owner
  runs `pnpm db:seed` locally against Supabase.
- Docker isn't running at container start: `dockerd &` then `docker compose up -d`.
- Next.js 16: read `apps/web/node_modules/next/dist/docs/` before writing Next code (`apps/web/AGENTS.md`).

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
- **UI (ADR 0019, UX concept v2)**: classic screens; sidebar + top bar (search/⌘K, "+ Neu", notifications); every
  view a page with its own URL; Vorschau and detail drawers (linkable via search params); event tabs with counts;
  start screen **"Übersicht"** for everyone (KPIs, season strip, Heute fällig, Nächstes Wochenende), no master-detail;
  company-wide **Kalender** module with layers; font **Inter** (self-hosted); neutral German wording with "du"; light
  default + dark/system; Standard density + "Kompakt". No workspace, docking or saved layouts (ADR 0018 superseded).
- Dev hosting Vercel + Supabase free tiers with synthetic data (ADR 0017); production host later.

## 6. Integrating the Claude Design output (first job of session 2)

**Two design directions were produced in Claude Design** (both prompts are in the repo):
| Direction | Prompts | What it is |
|---|---|---|
| **A: classic screens** | `git show a241381:docs/product/claude-design-prompt.md` (v1), then the follow-up [`claude-design-prompt-v1-update.md`](./product/claude-design-prompt-v1-update.md) | Sidebar + pages + detail drawers, upgraded with all research-based improvements (status colour+icon+text, density modes, dark theme, German formats/KW, undo toasts, drag alternatives, preview sheet, Heute-fällig grouping, 3-step preset generation, Logbuch matrix, grid template editor, hours month grid, inline instalments, workload view, ⌘K). Optional: one fixed list+detail screen (Fiori master-detail) for comparison. |
| **B: customisable workspace** (not chosen) | [`claude-design-prompt.md`](./product/claude-design-prompt.md) (v2) | Same improvements **plus** docking panes (max 3), workspace tabs, saved/named workspaces, team templates, "folgt" linking, page = pane. |

The product owner chose **direction A** in session 2 (2026-10-21). The prototype is in
[`docs/design/claude-design/a-classic/`](./design/claude-design/a-classic/INDEX.md).

0. ✅ **Done (2026-10-21): direction A.** What was done:
   - [ADR 0018](./architecture/adr/0018-workspace-architecture.md) *superseded* by
     [ADR 0019](./architecture/adr/0019-classic-screens.md) (classic screens + Vorschau + drawers; no fixed
     master-detail; no dockview, no `workspace` table; `user_preference` stays);
   - updated `ux-concept.md` (v2), `wireframes.md` (v3), `data-model.md` (v0.4, no `workspace`), roadmap (rev. 3.1),
     `CLAUDE.md` (UI line), `glossary.md` (Interface section) and the decisions log; added the Kalender module,
     the start screen "Übersicht" and the font Inter;
   - restored the **task detail drawer** and the owner's **season strip / hiring signal** on Übersicht.
Steps 1-5 (session 2, 2026-10-21):

1. ✅ **Done.** Design placed in [`docs/design/claude-design/a-classic/`](./design/claude-design/a-classic/)
   (`index.html`, 53 screens) with [`INDEX.md`](./design/claude-design/a-classic/INDEX.md) (screens → anchors).
2. ✅ **Done.** Compared with `ux-concept.md` and `wireframes.md`. Outcomes in the decisions log
   ([open-questions.md](./open-questions.md)): Kalender is its own module; Inter replaces Geist; start screen
   "Übersicht" without master-detail; **Orte and Kontakte get their own sidebar entries** (not in the prototype). Where the
   prototype and the docs differ, the prototype wins unless a decision says otherwise.
3. ✅ **Done.** Tokens extracted into [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css): `light-dark()`
   colour pairs switched by `html[data-theme]`, density by `html[data-density]`, status fg/bg/dot, event-type colours,
   radii 4/6/8/12/14, Inter + tabular figures (no `.dark` class; token names `status-*`, `type-*`, `sidebar*`).
4. ✅ **Done.** [`design/component-inventory.md`](./design/component-inventory.md): every prototype component with its
   anchor, implementation file, backing Base UI primitive, milestone and a11y notes, plus a token summary and the gaps
   (label-beside-field in Kompakt, sidebar icon rail, focus return after Vorschau, drag-and-drop library for M2).
5. ✅ **Done.** [`ux-concept.md`](./product/ux-concept.md) §9 matches `globals.css` and links the inventory; §2/§3 list Orte
   and Kontakte; §5 lists the routes as implemented (`?vorschau=<id>`, Team `?person=<id>`,
   `/veranstaltungen?erzeugen=1[&vorlage=<presetId>]`, event tabs as sub-paths). `wireframes.md` W0 shows the new
   sidebar entries.

## 7. Next milestone: M1 "Events, presets, locations, vendors" (+ app shell)
Detailed scope in the roadmap; suggested build order:

1. **Design tokens + base components** from the Claude Design output (§6).
2. **Schema (migration 0001)** per data model v0.4: `legal_parameter`, `event_type`, `venue`, `zone`, `row`,
   `contact`, `duty_role`, `staff_member` (+ optional `user_id`), `event_preset`, `location_agreement`, `event`,
   `event_anchor`, `event_duty`, `vendor` (read-only import fields), `user_preference`, `file`/`file_link`
   if documents are in scope. All in schema `app`.
3. **Seed from `packages/synthetic`**: extend `apps/web/scripts/seed.ts` to load the M1 entities in dependency order
   (manifest lists the order), create Better Auth users for staff members with a `permissionRole`, idempotent. Add the
   GitHub Actions `seed-dev` workflow for Supabase (see §4).
4. **App shell (ADR 0019, UX concept v2 §3–4):** sidebar (232 px, badges, SPÄTER group, profile menu with Sprache /
   Design / Dichte / Abmelden), top bar (breadcrumb, search field → ⌘K command palette via `cmdk`/shadcn Command,
   "+ Neu" with `C`, notification bell), route-level pages, Vorschau card and detail drawers addressed by search params
   (e.g. `?vorschau=event:<id>`, `?detail=task:<id>`), event page tabs with counts, theme + density switch stored in
   `user_preference` (server action with `requireUser()`), Inter via `@fontsource-variable/inter`. Sidebar collapses
   below 1024 px. **No parallel routes, no docking library.**
5. **Views:** Übersicht (KPI strip + Nächstes Wochenende from events; Heute fällig and season strip placeholders until
   M2–M5 data exists), Kalender (events + NRW holidays layers),
   Veranstaltungen (list + calendar, KW column), Veranstaltung (Überblick tab + tab skeleton), **Aus Vorlage erzeugen**
   (calendar multi-select + preview with weekend-cap/venue/holiday warnings, one service path `createEvents`),
   Orte (venues + zones), Kontakte, Team (staff list; hours come in M4), Händler (read-only list), Vorlagen (presets).
   Each view is a page with its own URL; records open in Vorschau or a drawer where the UX concept says so.
6. **Domain rules in core** (with tests): weekend cap (≤ 4 events), venue double-booking, NRW holidays,
   booking cut-off anchor (Monday before), rrule expansion for presets.
7. **Permissions** for new resources in `packages/core/src/auth/permissions.ts`; field users scoped to their events.
8. **i18n:** every new string in `messages/de.json` + `en.json`; German formats via `Intl` (`de-DE`), KW.
9. **Quality:** service integration tests against Postgres; a Playwright smoke test (login → Übersicht → open an
   event → Vorschau → event tabs); `pnpm check` green; push → Vercel deploy → product owner clicks through.

Exit criterion (roadmap): a full season of (synthetic) events exists with correct dates, types and teams, browsable
in the UI.

## 8. Open items for the product owner
- Production URL of the Vercel deployment; confirm `BETTER_AUTH_URL`/`APP_URL` are set; confirm GitHub
  `APP_URL`/`CRON_SECRET` for scheduled jobs.
- Client discovery (see open-questions): **timeline workshop** per event type (with time estimates), permit inventory
  per location, staff list & payroll format, payables list, vehicles; old-website DB access later.
- Before the pilot: production hosting decision (Scalingo candidate), tax-advisor questions (cash/KassenSichV, VAT on
  stall fees, receipts procedure).

## 9. Suggested first message for session 2
> Read `docs/HANDOFF.md` and the files it lists. The Claude Design output (direction A) is in
> `docs/design/claude-design/a-classic/`. The design direction is settled (A, ADR 0019). Integrate the design, flag any
> conflicts with recorded decisions, then plan and start M1 (§7).
