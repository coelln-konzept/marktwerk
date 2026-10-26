# Handoff: session 5 → session 6 (local Claude Code, macOS)

**Written 2026-10-26 at the end of session 5.** Session 5 ran locally on the product owner's Mac. Read this file
first. Repository: [`coelln-konzept/marktwerk`](https://github.com/coelln-konzept/marktwerk). Older handoffs are kept
as history at the end (§10 session 4, §11 session 3); the session-3 reading list and architecture notes still apply.

> **Where things stand:** everything is merged to `main` (PRs #9–#11), nothing in flight, no open branches besides
> the two obsolete `wip/ux-pass-*` ones. Session 5 shipped navigation polish (#10) and the event-board **Ablauf**
> view (#11), re-ran the design critique (**29/40**, was 25/40) and prepared the deployed login (waiting on GitHub
> secrets from the product owner). Next: seed the deployed DB once the secrets exist, then pick critique findings
> with the product owner (§5).

---

## 1. First message for session 6 (paste this)

> Read `docs/HANDOFF.md` and continue where session 5 stopped. Work in `~/Developer/CoellnKonzept/Marktwerk`.
> `git fetch && git pull` on `main`, start the dev server (`preview_start` name `marktwerk`), then follow §5 step by
> step: check whether the seed secrets exist and run "Seed dev database"; then go through the critique findings and
> the open questions in §4 with me before building. Ask me before product decisions that aren't settled in
> `docs/open-questions.md`.

## 2. Local environment (this Mac)

| What | Where / how |
|---|---|
| Repo | **`~/Developer/CoellnKonzept/Marktwerk`** (moved out of iCloud-synced `~/Documents` on 2026-10-22). `~/.claude/CLAUDE.md` still says tool repos live under `~/Documents/Personal/development/CoellnKonzept/` — update when convenient. |
| Node / pnpm | Node 22.22 (min 22.18 ok; `.nvmrc` says 24), pnpm 10.34.7 in `~/.local/bin` (add it to `PATH` in Bash calls) |
| Postgres + Mailpit | Docker (`pnpm db:up`). **Postgres on port 5433** (a system Postgres owns 5432) via the git-excluded `docker-compose.override.yml`; `.env` has `DATABASE_URL=…:5433/marktwerk` and `TEST_DATABASE_URL=…:5433/marktwerk_test`. Only `marktwerk` and `marktwerk_test` exist now (agent DBs dropped). |
| Dev server | **http://localhost:3001** (3000 is an `open-webui` container). `preview_start` name `marktwerk` (launch config in `~/Developer/CoellnKonzept/.claude/launch.json`). After branch jumps or merges, restart it (Turbopack keeps stale modules). |
| Auto-login (local only) | `.env` has `DEV_AUTO_LOGIN_EMAIL=admin@marktwerk.local` / `DEV_AUTO_LOGIN_PASSWORD=admin12345` → a fresh browser on localhost is signed in (`apps/web/src/server/dev-auto-login.ts`). |
| Admin login | `admin@marktwerk.local` / `admin12345` (owner). **Not part of the seed** — re-create it after every reseed (§6). Seeded logins: `owner@marktwerk.local` etc. / `marktwerk-dev-123`. Local DB was reseeded on 2026-10-24. |
| Browser checks | The in-app browser pane works, but scripted checks are more reliable with Playwright + Chrome: a script in `apps/web` (`.tmp-*.mjs`, delete afterwards) using `chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" })`. |
| E2E | `E2E_BASE_URL=http://localhost:3001 E2E_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm test:e2e` (32 tests). E2E runs as `owner@marktwerk.local`; earlier runs can leave saved views behind in `app.user_preference.saved_views` (e.g. Kalender layers) that break the next run — reset with `update app.user_preference set saved_views = saved_views - 'kalender' where user_id = …`. CI starts fresh. |
| Impeccable | Installed project-locally (`.claude/skills/impeccable`, git-excluded). Critique snapshots in `apps/web/.impeccable/critique/` (excluded); CLI from `apps/web`: `../../.claude/skills/impeccable/scripts/impeccable …`. No `PRODUCT.md` yet. |
| Agent worktrees | None left (all 16 removed in session 5). |
| Merging | The repo does **not allow auto-merge**; merge with `gh pr merge <n> --merge` once `gh pr checks` is green. |

## 3. What session 5 did (all merged)

| PR | Content |
|---|---|
| #9 | (opened by the cloud session at the end of session 4, merged) UX pass + P false alarms + Q notification center |
| #10 | **Whole rows/boxes clickable** (`KeyboardRows` opens `data-href` on a click anywhere; Übersicht, Board Bereitschaft + Matrix, Benachrichtigungen, event Überblick lists); **"←" back arrow** in the top bar (`components/shell/back-button.tsx`, path-based stack in `sessionStorage`, parent-crumb fallback); **Kernaufgaben circles** tick off (✓ reopens) with undo |
| #11 | Event board **Ablauf** view (`?ansicht=ablauf`, `components/board/ablauf-list.tsx`, `groupAblauf` in `packages/core/src/tasks/ablauf.ts`): all tasks in one list, one line each, grouped by phase relative to the market day, sticky headers. **Spalten stays the default until the user tests are back** (product owner, 2026-10-26) |

Also in session 5:
- **Refresh loop** reported by the product owner: dev-only. An injected script (browser tooling/extension) threw
  on every load, and Next's HMR client reloads after any runtime error → endless reload, navigation lost. Not app
  code; a clean Chrome loads once. If it returns: open the console and look at the first red error.
- **Design critique** re-run (dual-agent): **29/40** (22 → 25 → 29). Snapshot
  `apps/web/.impeccable/critique/2026-10-24T13-54-38Z__src-app-app.md`. Detector: only false positives + the
  intentional warm `--background`. Findings in §4.
- **Board research** (event board crowded): grouped single-line lists (Linear/Things), Carbon row density, NN/g on
  data tables, event/wedding T-minus checklists → Ablauf chosen over compact kanban, category × phase matrix and
  timeline (decisions log 2026-10-26).
- Housekeeping: agent worktrees, merged local branches and throwaway DBs removed.

## 4. Open items for the product owner

**Deployed login (blocked on the product owner):** the deployed app `https://marktwerk-three.vercel.app` is up
(`/api/health` ok, publicly reachable, no Vercel Authentication), all migrations are applied on Supabase
`marktwerk-dev`, but the DB is **empty** and has only the login `owner@marktwerk.local` (keep it, product owner's
choice). Decided 2026-10-24: email + password via the seed for now; magic link later together with user
invitations once an email provider is chosen. The product owner sets three repo secrets (values never in chat):
`SEED_OWNER_EMAIL=arda.kertmen@gmail.com`, `SEED_OWNER_PASSWORD` (≥ 10 chars), `DATABASE_MIGRATION_URL` (Supabase →
Connect → Session pooler, port 5432). Then run Actions → **Seed dev database** (`gh workflow run seed-dev.yml -f
confirm=seed`), check the run, and confirm the login exists (`select email, role from app."user"` via the Supabase
MCP, project ref `qtwwivadqeloszijsppa`). The seed finds users by email, so the new owner login sits next to
`owner@marktwerk.local`.

**Critique findings to choose from (none started):**
1. **P1** The same task stream on Übersicht ("Heute fällig"), `/benachrichtigungen` and the bell; Übersicht is
   ~4,500 px. Make Übersicht a briefing (weekend + top items), the center the one triage list, the bell a peek.
2. **P1** Genehmigungen badge (49) counts permits for 2027 that can't be applied for yet; the page looks green; the
   "Fehlt" chip sets `saison=alle` while the dropdown still shows 2026. Count only within the permit horizon, say why
   a cell is "Fehlt".
3. **P1** Kalender at 390 px hides Sa/So (where every market is): default to Liste on phones.
4. **P2** Status vocabulary: overdue as triangle / circle-! / red square; "in 1 T" vs "morgen". One `DueBadge`.
5. **P2** Order inside "Überfällig" reads random (Kernaufgaben first, a 128-day item of a past market on top).
Minor: "Hallo, Admin" H1, palette results without year, fuzzy search noise ("bonn" → "Abonnenten"), no skip link,
duplicated tab label text for screen readers, event-board footer band, Veranstaltungen without year headers,
"Aufräumen" straggler at 390 px, roadmap copy on `/benachrichtigungen`.

**Open questions from the notification center (still unanswered):**
1. A permit-linked application task can appear twice in the center (as a task and as the permit's apply-by item).
   Show only the permit item?
2. Confirm Q's rules in `open-questions.md` ("Notification center rules"): due soon = today/tomorrow (Kernaufgaben 3
   days); no backlog cutoff; owner/manager don't see personal notifications in the center; Zurückstellen snoozes
   only the notification; bell counts unread open items.
3. A "Wartet" task due soon still shows as "bald fällig" in the center. OK?
Related: the center is filled by the sweep, the Übersicht counts live → 21 vs 22 overdue after a day passes.

**Pending decision:** Ablauf as the default event-board view, after the user tests.

## 5. Next steps (in order)
1. `git pull`; start the dev server. Check `gh secret list --repo coelln-konzept/marktwerk`; if the three seed
   secrets exist, run the seed workflow and verify the login (§4). Otherwise remind the product owner.
2. Go through the critique findings and the notification questions (§4) with the product owner; log answers in
   `docs/open-questions.md`; build in one PR per batch, browser-checked, then re-run the critique.
3. After the user tests: decide the Ablauf default.
4. Housekeeping: delete the obsolete remote branches `wip/ux-pass-p-false-alarms` and `wip/ux-pass-q-notification-center`
   (merged long ago; ask before deleting); consider `/impeccable init` (PRODUCT.md); the CoellnKonzept convention
   (`docs/<Tool>.md` synced to Obsidian via `scripts/sync-docs.sh` + `.githooks/post-commit`) is not set up for
   marktwerk yet — ask before adding.

## 6. Re-create the admin login after a reseed
```bash
cd ~/Developer/CoellnKonzept/Marktwerk/apps/web
HASH=$(pnpm exec tsx -e 'import { hashPassword } from "better-auth/crypto"; hashPassword("admin12345").then(h => console.log(h))')
UID_=$(uuidgen | tr A-Z a-z)
docker exec -i marktwerk-postgres-1 psql -U marktwerk -d marktwerk -v ON_ERROR_STOP=1 <<SQL
insert into app."user" (id, name, email, email_verified, role) values ('$UID_', 'Admin', 'admin@marktwerk.local', true, 'owner');
insert into app.account (id, account_id, provider_id, user_id, password) values (gen_random_uuid()::text, '$UID_', 'credential', '$UID_', '$HASH');
SQL
```
Reseed: `docker exec marktwerk-postgres-1 psql -U marktwerk -d postgres -c "drop database marktwerk with (force)" -c "create database marktwerk owner marktwerk"`, then `pnpm db:migrate && pnpm db:seed` (the seed also runs one deadline sweep).

## 7. How the product owner likes to work
- Plans first, approval, then build; **ask before product/architecture decisions**, log answers in
  `docs/open-questions.md` (Decided table).
- Show options with pros/cons (mock-ups help) and let them pick; they decide quickly.
- Parallel Sonnet agents in worktrees for independent work, each owning separate files and a throwaway DB; UX
  refinement, reviews and the browser checks by Claude (Opus).
- One PR per batch; merge when CI is green (they confirm per PR in session 5).
- Less clutter, but **all tasks of a market visible together** — the problem is the display, not the amount.
  German UI wording; market colours, Kernaufgaben.

## 8. Product decisions (summary — details in `docs/open-questions.md`)
2026-10-22: single main user until Phase 4 (Team, Finanzen, estimates, booking hidden); Aussteller; email off; events
start geplant and auto-confirm with permits; presets = real markets with venue; one Grundvorlage; Kernaufgaben as a
manual flag; Marktfarbe per market; Bereitschaft default board view + Matrix; event Überblick layout; past-market
tasks hidden after 7 days with cleanup; every event link → Überblick; sidebar 5 + Stammdaten; company-wide
notification center for owner/manager. Postponed: Aussteller data companion, weekly report email, finance, staff
assignment, website publishing.
2026-10-24: whole rows clickable; "←" back arrow; Kernaufgaben circles tick off; deployed login = password via the
seed (magic link later).
2026-10-26: event board Ablauf view (switchable, Spalten default until user tests).

## 9. Infrastructure and client discovery (unchanged)
Production hosting not decided (Scalingo candidate, ADR 0006/0017); `CRON_SECRET` exists, `APP_URL` repo variable =
`https://marktwerk-three.vercel.app`. Client discovery: real task lists per market type (Grundvorlage), permit
inventory per location.

---

## 10. History: session-4 handoff (condensed)
Session 4 (2026-10-22, local) built the client feedback of 2026-10-22 (PRs #3–#8: Aussteller, hidden modules,
snooze, permit horizon, geplant/auto-confirm, Bibliothek + Grundvorlage, Markt planen, Kernaufgaben, Marktfarben,
event Überblick redesign, Bereitschaft + Matrix) and a UX pass on `feat/ux-pass` (past-market cleanup, Übersicht
declutter, sidebar 5 + Stammdaten, event tabs Überblick · Board · Genehmigungen · Mehr, migration 0008). Two agents
were paused at the end — **P** (false alarms: permit tasks linked to permits, `permitStateForEvent`, Wartet,
reasons, year in dates) and **Q** (company-wide notification center) — and a cloud session finished both and opened
PR #9 (merged at the start of session 5). Their briefs are in the git history of this file (commit `52b5b59`).

## 11. History: session-3 handoff (as written 2026-10-21)

**Written 2026-10-21 at the end of session 3.** Session 3 ran locally on the product owner's Windows PC. All work is
on branch `claude/m1-master-data` with open **PR #2** against `main` (CI + Auto-fix). Read this file first, then the
documents it points to. Repository: [`coelln-konzept/marktwerk`](https://github.com/coelln-konzept/marktwerk).

> **Where things stand: Phase 1 (M1–M6) is built** with synthetic data, except what needs the product owner (§7):
> drag and drop on the board, production hosting + pilot, user invitations. Session 3 merged PR #1, finished the M1
> editing screens, then built M2–M6 with parallel Sonnet agents in git worktrees, orchestrated and merged here:
> one schema migration `0002_phase1_modules` (32 tables) + seed for all modules first, then six module agents
> (M2a templates/instantiation, M2b board/tasks, M3 permits/notifications, M4 hours, M5 finance, M6 company), then
> one integration agent (Übersicht, Kalender layers, cross-module links, search). `pnpm check` + **640 integration
> tests** green locally; every new screen opened in the browser at least once (not every interaction clicked).

> **Local setup (this PC):** no Docker/WSL, so a portable PostgreSQL 17.11 runs from `%LOCALAPPDATA%\marktwerk-pg` on
> **port 5433** (5432 is taken by another Postgres; start it after a reboot: setup.md "Windows without Docker").
> `.gitattributes` forces LF. `TEST_DATABASE_URL` is read from `.env`. pnpm lives in `%APPDATA%\npm` (use it from
> PowerShell; the Git-Bash shim fails). Playwright's Chromium isn't installed locally (CI runs e2e). After merging
> branches, **restart `pnpm dev`** (Turbopack keeps stale modules). Agent worktrees live in `.claude/worktrees/`
> (git-excluded); remove them once PR #2 is merged.

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

## 3. State of the repository (end of session 3)
| Area | State |
|---|---|
| Monorepo | pnpm 10.34.7 + Turborepo; Node 24 (min 22.18); TypeScript 6.0.3; Biome 2.5 (only linter/formatter; `docs/design` is excluded) |
| `apps/web` | Next.js 16.4.2 (App Router, Turbopack, Cache Components **off**, `proxy.ts`, typed routes), React 19.3, Better Auth 1.7, next-intl 4 (DE/EN via cookie), Tailwind 4 with the design tokens, Base UI 1.9 (Dialog, Menu), Inter via `@fontsource-variable/inter` |
| Shell | `components/shell/*`: sidebar (Orte + Kontakte as own entries, SPÄTER group), top bar (breadcrumb, search field **Strg K** → command palette, "+ Neu", bell), profile menu (Design System/Hell/Dunkel, Dichte Standard/Kompakt, Sprache, Abmelden; stored in `user_preference`, mirrored to cookies, restored at login), undo toasts, not-found page |
| UI kit | `components/ui/*`: button, input, label, panel, table (+ group rows, row actions), status badge, rollover badge, health shapes (● ▲ ■ ○), event-type tag, filter chips, kbd, empty/skeleton states, avatar, Vorschau card + facts, keyboard rows (J/K/Space/Enter), auto-submit select, coming-soon. Mapping to the design: [`design/component-inventory.md`](./design/component-inventory.md) |
| Screens | `/` **Übersicht** (KPIs incl. Geld überfällig, season strip with hiring signal, **Heute fällig** from all modules with chips, Dieses Wochenende with 4 health columns) · `/kalender` (layers: events, holidays, Aufgaben, Genehmigungen, Raten, Pflichten, Schichten) · `/veranstaltungen` (+ `/neu` Einzeltermin) · `/veranstaltungen/[id]` tabs Überblick (edit Eckdaten, Verschieben, Name/Dauer/Ort, Buchung), **Board**, **Genehmigungen**, Team (duties + **Schichten**), **Geld**, **Dokumente**, Notizen, Verlauf · `/board` (Meine/Alle/Nicht zugewiesen, Arbeitslast) · `/logbuch` (matrix + list, drawer `?genehmigung=`) · `/team` (Personen · Stunden · Schichten, `/team/stunden/abschluss` month close) · `/finanzen` (Zahlungen · Ausgaben · Belege fehlen, `/finanzen/posten/[id]`, monthly receipt bundle) · `/firma` (Pflichten · Fahrzeuge · Mängel) · `/benachrichtigungen` + bell · `/orte` (+ edit, zones/rows, agreements, permit requirements) · `/kontakte` (+ edit) · `/vorlagen` (presets edit, **Ablaufvorlagen** editor `/vorlagen/ablauf/[id]`, "Auf Veranstaltungen anwenden…") · `/einstellungen` (Firma, Benutzer & Rollen, Rechtliche Werte) · `/aussteller` (read-only). Placeholder: `/wissen` |
| Services | All mutations in `apps/web/src/server/services/*.ts` (permission → transaction → audit). One-path rules: event creation `instantiateEvents` (events.ts) → task instantiation (task-instantiation.ts) + logbook fill (permits.ts); anchor shifts `applySchedule` (event-details.ts) → tasks follow; duty changes (event-duties.ts) → tasks follow. Notifications only via `insertNotifications` (`packages/db/src/notify.ts`). Files via `server/storage.ts` (local driver; S3 stub) + `/api/documents` |
| Jobs | `packages/jobs`: deadline-sweep (15 min), task-rollover (00:05), daily-digest (07:00), send-emails (5 min, own SMTP client, log transport without `SMTP_HOST`), installment-, obligation-, payroll-reminders. Worker (pg-boss) and `/api/cron/<job>` both iterate `JOBS`; the external scheduler (`cron.yml`) needs the new job names |
| `packages/core` | Domain rules with Vitest: dates/holidays/rrule (+ form parts), event details (times, euro parsing, move rules), presets, tasks (business-day due dates, board columns, carry-over, evidence, workload), permits (coverage, apply-by), staff (worktime incl. DST, ArbZG, MiLoG, Minijob, payroll CSV), finance (instalments, budget, CSV), company (obligation roll-forward), due ranking |
| `packages/db` | Migrations **0000, 0001, `0002_phase1_modules`** (templates, tasks, permits, notifications, staff hours, money, documents, company). `data-model.md` v0.5 marks the deviations |
| Seed | `pnpm db:seed` (idempotent): M1 data + 4 templates/157 items, 5,774 tasks, 234 permits, 287 shifts, 14 contracts, 90 payables/120 rates, 3 vehicles/11 obligations. Logins (local password `marktwerk-dev-123`): owner, manager, 2 staff, **field `logistik@marktwerk.local`** |
| Tests | `pnpm check` (Biome + typecheck + unit tests + message parity, 21 message areas) · `pnpm test:integration` (**640 tests, ~5 min**, DB `marktwerk_test`) · `pnpm test:e2e` (smoke incl. the new pages; selectors not run locally yet) |
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
  start screen **"Übersicht"** for everyone (KPIs, season strip, Heute fällig, Dieses Wochenende), no master-detail;
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

## 7. Phase 1 status and what's next
**Built in session 3** (all on PR #2): M1 complete (see §3), **M2** templates + instantiation + board + task drawer +
carry-over + workload, **M3** logbook + requirements + event permits tab + deadline sweep + notification center +
email/digest, **M4** contracts + shifts (versioned) + month grid + Minijob/ArbZG/MiLoG warnings + month close + CSV,
**M5** payables + instalments + expenses + receipts (upload, missing counter, monthly bundle) + event money tab +
reminders, **M6** company tab (vehicles, obligations with roll-forward → payable, issues with photos), **integration**
(Übersicht complete, Kalender layers, four health dimensions, search, "+ Neu" for every module).

**Not done, needs the product owner:**
1. **Merge PR #2** after a click-through (Vercel preview; Supabase gets migration 0002 with the deploy), then seed
   Supabase via *Seed dev database* once the secrets `DATABASE_MIGRATION_URL` + `SEED_OWNER_PASSWORD` exist.
2. ~~Drag and drop on the board~~ **built** (dnd-kit, ADR 0020; mouse drag between columns, drop on a person and undo checked in the browser): every move also works via menu + keyboard; all moves go
   through `moveCard` → `moveTask`, so a library only has to call that path.
3. **M6 production hosting + pilot** (Scalingo candidate, ADR 0006/0017), backups, S3 bucket (the S3 storage driver is
   a stub; Vercel's 4.5 MB body limit blocks phone photos → presigned uploads once hosting is decided).
4. **User invitations** (§8 13), DATEV export format (CSV now), real data from the client (timeline workshop first).

**Smaller gaps:** Kalender layer "Arbeitszeiten & Abschluss"; "Nur meine Zuständigkeit" only narrows events/tasks;
Heute fällig rows open the drawer/page (no inline "Bezahlt/Erledigt"); no J/K card navigation; comment edit/delete;
expense edit UI; notification titles stored German-only; Vorschau focus return; Kompakt label-beside-field; month grid
on phones; Vorschau/peek on Firma lists; `/wissen`. Then **Phase 2** (M7 staff WhatsApp, magic links, shift planning).

## 8. Open items for the product owner
**Product questions raised while building M1** (answers → decisions log):
1. Verlauf (audit history) tab: only owner/manager (`audit:read`) for now. Should staff see it?
2. Past and cancelled events show Team health as "noch offen" (not tracked). OK, or show it anyway?
3. Übersicht shows the next season's count once ≤ 10 % of the current season is still ahead. Right trigger?
4. Kalender preset "Märkte + Genehmigungen" = Flohmärkte + Antikmärkte + holidays (permits join in M3). OK?
5. Kalender "Liste · 6 Wochen" starts today (like the prototype), not on Monday. OK?
6. Inactive presets: offer "reactivate" and generation from them?
7. Aussteller: newsletter consent label "Soft-Opt-in". Wording OK?
8. "Veranstaltungen kommend" counts events running today. OK?
9. ~~Lock duties after "abgeschlossen"?~~ Decided: editable, confirmation while the event is happening.
10. ~~Same-day clashes~~ Decided: hint only.
11. ~~Lock Eckdaten/booking after "abgeschlossen"?~~ Decided like 9.
12. ~~Name/length/venue editable on the event?~~ Decided: yes, with confirmation (open-questions).
13. **Inviting users** (Einstellungen → Benutzer): invitation email or initial password? Button is disabled for now.
14. Defaults the agents guessed: new presets and Einzeltermine start with 06:00 / 08:00 / 16:00 / 18:00; text limits
    200 (fields) / 4,000–5,000 (notes, public text). OK?
15. Presets at an archived venue still show in Vorlagen (and can generate). Hide, warn, or keep?
16. `audit_log.entity_id` is a uuid, but Better Auth user ids and the settings row aren't: user/settings audit entries
    keep the id in the diff only. Change the column to text in a later migration?
17. ~~M2 drag and drop for the board~~ decided 2026-10-21: dnd-kit (ADR 0020).
18. **Heute fällig order:** overdue items rank oldest first, so tasks overdue for 300 days (synthetic past events) sit
    on top. Newest-overdue first, or hide items overdue > 30 days (like the sweep's backlog guard)?
19. Escalation: if no staff member has the manager login, the owner gets escalations. OK? Escalate 1 day after the
    deadline (permits, obligations, critical instalments)?
20. Payment reminders go to everyone with `finance:read` (owner, manager). Should staff get them (permission change)?
21. Hours: planned shifts count toward the Minijob allowance; lock/approve/export all by `team:manage` (no four-eyes);
    fixed monthly pay is not prorated. OK?
22. Company: only owner/manager can report vehicle defects. Should drivers (staff/field) report themselves?
23. Obligation → payable only when a cost is entered; the rate is due on the completion date. OK?
24. Permit tasks: the logbook creates "beantragen" tasks, and the Ablaufvorlagen may contain the same task → possible
    duplicates. Remove those items from the templates, or skip permit items in instantiation?
25. Moving an event does not recompute its permits' apply-by dates. Should it?
More agent assumptions (ranking, defaults, thresholds) are logged in [`open-questions.md`](./open-questions.md).

**Infrastructure:** production URL is `https://marktwerk-ardas-s-projects.vercel.app` (behind Vercel Authentication;
`marktwerk.vercel.app` is someone else's app) → record in README + deployment.md and set as `BETTER_AUTH_URL`/`APP_URL`; confirm `BETTER_AUTH_URL`/`APP_URL` in Vercel and
`APP_URL`/`CRON_SECRET` for `cron.yml`; add `DATABASE_MIGRATION_URL` (+ seed password secrets) for `seed-dev.yml`.

**Client discovery** (see open-questions): timeline workshop per event type with time estimates (feeds M2), permit
inventory per location, staff list & payroll format, payables list, vehicles; old-website DB access later. Before the
pilot: production hosting decision, tax-advisor questions.

## 9. First message for session 4 (local Claude Code)
> Read `docs/HANDOFF.md` and the files it lists (CLAUDE.md is loaded automatically). Start the local Postgres
> (setup.md "Windows without Docker"), run `pnpm install && pnpm db:migrate && pnpm db:seed`, then `pnpm check` and
> `pnpm test:integration`. Check PR #2 (`gh pr view 2`) and its CI; fix anything red. Then go through HANDOFF §8 with
> me, apply my answers, and continue with §7 (drag and drop once decided, the smaller gaps), asking before product or
> architecture decisions that aren't settled in the docs. Commit in small steps with `pnpm check` green, and keep
> HANDOFF.md current at the end.
