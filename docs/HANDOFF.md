# Handoff: session 4 → session 5 (local Claude Code, macOS)

**Written 2026-10-22 at the end of session 4.** Session 4 ran locally on the product owner's Mac. Read this file
first. Repository: [`coelln-konzept/marktwerk`](https://github.com/coelln-konzept/marktwerk). The session-3
handoff is kept as history at the end (§12); its reading list and architecture notes still apply.

> **Where things stand:** the client feedback of 2026-10-22 is built and merged (PRs #3–#8). A **UX pass** (declutter,
> navigation, design critique with Impeccable) is on branch **`feat/ux-pass`** (pushed, **no PR yet**). Two parallel
> agents were paused mid-way when the session ended: **P** (fix false alarms: link permit tasks to permits) and **Q**
> (company-wide notification center). Their unfinished work is pushed as **`wip/ux-pass-p-false-alarms`** and
> **`wip/ux-pass-q-notification-center`** (§5). A cloud session may already have continued them — check §5 first.
> Next: finish P and Q, merge them into `feat/ux-pass`, verify, open the UX-pass PR, re-run the critique (§6).

---

## 1. First message for session 5 (paste this)

> Read `docs/HANDOFF.md` and continue exactly where session 4 stopped. Work in
> `~/Developer/CoellnKonzept/Marktwerk`. `git fetch`, then check §5: did the cloud session finish the paused
> agents P and Q (look for an open PR from `feat/ux-pass` or new commits on the `wip/ux-pass-*` branches)? Continue
> from whatever is there: finish P and Q from their `wip/` branches with the briefs in §11 (parallel Sonnet agents in
> worktrees, each starting from its wip branch), review them, merge them into `feat/ux-pass`, then follow §6 step by
> step (reseed + admin login, all tests, browser check, open and merge the UX-pass PR once CI is green, re-run the
> Impeccable critique). Ask me before product decisions that aren't settled in `docs/open-questions.md`.

## 2. Local environment (this Mac)

| What | Where / how |
|---|---|
| Repo | **`~/Developer/CoellnKonzept/Marktwerk`** (moved out of iCloud-synced `~/Documents` on 2026-10-22 — iCloud created `… 2.ts` duplicates). Note: `~/.claude/CLAUDE.md` still says tool repos live under `~/Documents/Personal/development/CoellnKonzept/` — update when convenient. |
| Node / pnpm | Node 22.22 (min 22.18 ok; `.nvmrc` says 24), pnpm 10.34.7 in `~/.local/bin` |
| Postgres + Mailpit | Docker (`pnpm db:up`). **Postgres on port 5433** (a system Postgres owns 5432) via the git-excluded `docker-compose.override.yml`; `.env` has `DATABASE_URL=…:5433/marktwerk` and `TEST_DATABASE_URL=…:5433/marktwerk_test` |
| Dev server | **http://localhost:3001** (port 3000 is taken by an `open-webui` container). The Claude Code session root is `~/Developer/CoellnKonzept`; its `.claude/launch.json` runs `pnpm --dir Marktwerk dev` on 3001 (`preview_start` name `marktwerk`). If a stale `next-server` blocks 3001 after a crash, check `ps`/`lsof` that it's this repo's, then stop it. |
| Auto-login (local only) | `.env` has `DEV_AUTO_LOGIN_EMAIL=admin@marktwerk.local` / `DEV_AUTO_LOGIN_PASSWORD=admin12345` → opening the app signs in (see `apps/web/src/server/dev-auto-login.ts`; off in production; sign-out pauses it). |
| Admin login | `admin@marktwerk.local` / `admin12345` (role owner). **Not part of the seed** — re-create it after every reseed with the snippet in §7. Seeded logins: `owner@marktwerk.local` etc. / `marktwerk-dev-123`. |
| E2E | Playwright's own browser isn't installed; use Chrome: `E2E_BASE_URL=http://localhost:3001 E2E_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm test:e2e` (e2e opts out of the auto-login via a cookie). |
| Impeccable | Design skill installed project-locally (`npx impeccable@4.7.0 install --providers=claude --scope=project`): `.claude/skills/impeccable`, `.claude/agents/impeccable-*`, hooks in `.claude/settings.local.json` — all git-excluded (`.git/info/exclude`). Critique snapshots: `apps/web/.impeccable/critique/` (excluded). Run its CLI from `apps/web`: `../../.claude/skills/impeccable/scripts/impeccable …`. `PRODUCT.md` (via `/impeccable init`) not created yet. |
| Agent worktrees | `.claude/worktrees/agent-*` (excluded). Old ones can be removed with `git worktree remove` once their branches are merged (all except P and Q are merged). |

## 3. What session 4 did (all merged unless noted)

| PR | Content |
|---|---|
| #2 | Phase 1 M1–M6 (session 3's PR, merged at the start of session 4) |
| #3 | Händler → **Aussteller** (`/aussteller`); **Team and Finanzen hidden** (`apps/web/src/lib/modules.ts`); event links; **email master switch, off** |
| #4 | No task comments (optional completion note); **snooze** (`task.snoozed_until`); grouped filter bars; local **dev auto-login** |
| #5 | "Dieses Wochenende"; **permit horizon** setting (default 30 days); due list grouped by market; contrast; **time estimates hidden** |
| #6 | New events start **geplant**, **auto-confirm** when all required permits are granted; "Ohne Genehmigung" |
| #7 | **Einstellungen → Bibliothek** with the **Grundvorlage** (master template); **"Markt planen"**; **Kernaufgaben** (`is_key`); **Marktfarben** (market colours) |
| #8 | **Event Überblick** redesign (status line, Was fehlt, Kernaufgaben, dates); board views **Bereitschaft** (default) and **Kernaufgaben-Matrix** |
| `feat/ux-pass` (no PR yet) | UX pass, see §4 |

## 4. The UX pass (`feat/ux-pass`, pushed, 16 commits on top of `main`)

Done and verified (720 integration, 28 e2e green at commit `5df27e4`; later commits ran `pnpm check` only):
- **Past markets**: open tasks of markets ended > 7 days ago drop out of all cross-market lists, KPIs, Kalender and
  reminders; "N offene Aufgaben aus vergangenen Märkten · Aufräumen" opens a cleanup drawer (`/?aufraeumen=1`).
- **Übersicht**: Dieses Wochenende first; KPIs reduced to Heute fällig / Überfällig; max 3 tasks per market, the rest
  expands in place; season strip and chips removed; clickable task icon marks done; urgency groups as coloured bands.
- **Navigation**: sidebar = Übersicht, Board, Veranstaltungen, Kalender, **Genehmigungen** (was Logbuch, `/logbuch`
  redirects) + collapsible **Stammdaten** (Orte, Kontakte, Aussteller, Wissen, **Pflichten**); Einstellungen in the
  profile menu; notifications + booking hidden (`modules.ts`); **every event link opens the event Überblick**.
- **Event page**: health once, one "…" menu, tabs Überblick · Board · Genehmigungen · Mehr; drawer status reduced to
  Erledigt / Wartet auf Amt + "…"; board columns most urgent first; Gruppiert view removed; Filter disclosure.
- **Kalender / Genehmigungen / Pflichten / Aussteller / Orte / Einstellungen** decluttered (details in commits).
- After **Markt planen** the first new date's Überblick opens; Veranstaltungen rows clickable, larger market bar;
  **market panel** on Bereitschaft rows (`/board?markt=<id>`).
- Commit `6f76be8`: **migration 0008** — `template_item.permit_type` (permit enums moved to
  `packages/db/src/schema/permit-type.ts`) and **company-wide notifications** (`notification.recipient_staff_member_id`
  nullable + partial unique index). Already applied to the local dev DB.

Design critique (Impeccable, dual-agent): **22/40 → 25/40**. Remaining findings, in order:
1. **P0 false alarms** (agent P): permit application tasks not linked to permits; "Läuft ab" for permits that cover
   the market; "Wartet" tasks shown red; "Achtung/Kritisch" without reasons; dates without year.
2. **P1** Übersicht still long; "Was das Wochenende aufhält" duplicates "Heute fällig"; collapse "Diese Woche".
3. **P2** no home for a market as a whole (consider "nach Markt" grouping in Veranstaltungen or a market page).
4. **P2** colour/health vocabulary (market bar vs type chip vs status); Kalender overflows at 390 px.
5. Minor: ISO date in the task drawer date field; outline star in Bereitschaft "Kernaufgaben offen" chips; "Nächste
   Frist" shows the oldest overdue; Strg+K placeholder mentions hidden modules.

## 5. In flight when session 4 ended (paused, pushed as WIP)

| Agent | Pushed WIP branch | Base | State when paused | Brief |
|---|---|---|---|---|
| **P** false alarms | `wip/ux-pass-p-false-alarms` (`ead2fe3`, 71 files) | `6f76be8` | Implementation done (linking, `permitStateForEvent`, waiting tasks, reasons, year format, editor select, seed mapping); was writing the last tests (Bereitschaft + event-health reasons). Not yet `pnpm check`-green. | §11.1 |
| **Q** notification center | `wip/ux-pass-q-notification-center` (`c4cb74c`, 36 files) | `6f76be8` | Core rules, sweep, queries/services, center page, bell popover, tests written; was updating the docs. Not yet `pnpm check`-green. | §11.2 |

At the end of session 4 a **cloud session** ("Continue UX pass: P and Q") was started to finish both from these
branches, merge them into `feat/ux-pass` and open the PR. Check its result first: `git fetch`, then
`gh pr list --repo coelln-konzept/marktwerk --state all`, `git log --oneline origin/feat/ux-pass -5`,
`git log --oneline origin/wip/ux-pass-p-false-alarms -3` (and the Q branch). Continue from the newest state.

To finish locally: for each agent, create a worktree from its wip branch, run `pnpm install`, copy `.env` with its own
throwaway DBs (§11), then `pnpm check` / `pnpm test:integration`, fix what fails, finish the remaining items of its
brief, and merge the branch into `feat/ux-pass`. **Known overlap**: both touch `docs/open-questions.md`,
`e2e/smoke.spec.ts`, `messages/*/shell.json`; P owns permits/tasks/format, Q owns notifications/jobs sweep/bell.
The local worktrees `.claude/worktrees/agent-a837d50a5bfeb4a17` (P) and `agent-a3febeb72e20752b6` (Q) hold the same
commits; their throwaway DBs `marktwerk_p_*`/`marktwerk_q_*` may still exist — drop them when done.

## 6. Next steps (in order)
1. Collect P and Q (§5); merge both into `feat/ux-pass` (`git merge --no-ff`), resolve conflicts, `pnpm db:migrate`.
2. Reseed the local DB if the seed changed (P changes templates): drop + create `marktwerk`, `pnpm db:migrate && pnpm
   db:seed`, then re-create the admin login (§7). Restart the dev server (Turbopack keeps stale modules after merges).
3. `pnpm check`, `pnpm test:integration`, e2e (§2). Browser check: Übersicht overdue count should drop a lot; event
   Genehmigungen tab without false "Läuft ab"; `/benachrichtigungen` + bell work for the admin login.
4. Open the PR `feat/ux-pass` → `main` (template `.github/pull_request_template.md`; summary from §4 + P/Q), watch CI,
   **merge when green** (the product owner allowed merging once CI passes).
5. Re-run the Impeccable critique (dual-agent, §4 method; snapshot via `impeccable critique-storage write`), compare
   with 25/40, then work through the remaining findings (§4 items 2–5) with the product owner.
6. Housekeeping: remove merged agent worktrees; consider `/impeccable init` (PRODUCT.md); the CoellnKonzept convention
   (`docs/<Tool>.md` synced to Obsidian via `scripts/sync-docs.sh` + `.githooks/post-commit`) is not set up for
   marktwerk yet — ask before adding.

## 7. Re-create the admin login after a reseed
```bash
cd ~/Developer/CoellnKonzept/Marktwerk/apps/web
HASH=$(pnpm exec tsx -e 'import { hashPassword } from "better-auth/crypto"; hashPassword("admin12345").then(h => console.log(h))')
UID_=$(uuidgen | tr A-Z a-z)
docker exec -i marktwerk-postgres-1 psql -U marktwerk -d marktwerk -v ON_ERROR_STOP=1 <<SQL
insert into app."user" (id, name, email, email_verified, role) values ('$UID_', 'Admin', 'admin@marktwerk.local', true, 'owner');
insert into app.account (id, account_id, provider_id, user_id, password) values (gen_random_uuid()::text, '$UID_', 'credential', '$UID_', '$HASH');
SQL
```
Reseed: `docker exec marktwerk-postgres-1 psql -U marktwerk -d postgres -c "drop database marktwerk with (force)" -c "create database marktwerk owner marktwerk"`, then `pnpm db:migrate && pnpm db:seed`.

## 8. How the product owner likes to work (session 4)
- Plans first, approval, then build; **ask before product/architecture decisions**, log answers in
  `docs/open-questions.md` (Decided table — all session-4 decisions are there, dated 2026-10-22).
- Build with **parallel Sonnet agents in worktrees**, each owning separate files; write shared schema/migrations
  first yourself so agents don't collide; **the UX refining and reviews are done by Claude (Opus)**, checked in the
  browser. Give agents a throwaway DB and tell them to verify `DATABASE_URL` before any db command (one agent once
  seeded the main dev DB by mistake — harmless, but avoid).
- One PR per batch; **merge when CI is green** without asking again.
- Less clutter, start minimal and reveal things step by step; German UI wording; market colours, Kernaufgaben.

## 9. Product decisions of 2026-10-22 (summary — details in `docs/open-questions.md`)
Single main user until Phase 4 (Team, Finanzen, estimates, booking hidden); Aussteller; email off; events start geplant
and auto-confirm with permits; presets = real markets with venue; one Grundvorlage; Kernaufgaben as a manual flag;
Marktfarbe per market; Bereitschaft default board view + Matrix; event Überblick layout; past-market tasks hidden
after 7 days with cleanup; every event link → Überblick; sidebar 5 + Stammdaten; **notification center:
company-wide for owner/manager, items = overdue/due-soon tasks + permit deadlines** (not market confirmations, not
Pflichten yet); fix the permit/task false alarms before the center ships. Postponed: Aussteller data companion,
weekly report email, finance, staff assignment, website publishing.

## 10. Open items for the product owner
- Session-3 questions in §12 (§8 there) are partly superseded by the 2026-10-22 decisions; re-check when relevant.
- Infrastructure (unchanged): production URL/env vars on Vercel, `CRON_SECRET`, seed secrets for `seed-dev.yml`.
- Client discovery: real task lists per market type (to fill the Grundvorlage), permit inventory per location.

## 11. Briefs of the in-flight agents (re-run these if §5 shows no result)

Continue each with the Agent tool (`model: sonnet`, `isolation: worktree`, background), starting from its WIP
branch (`git reset --hard origin/wip/ux-pass-p-false-alarms` resp. `…-q-notification-center`): finish the open
items, make `pnpm check` + `pnpm test:integration` + e2e green, commit. Then merge into `feat/ux-pass`.

### 11.1 Agent P — fix false alarms
Goal (critique P0, approved): template application tasks ("Marktgenehmigung bei der Stadt beantragen" →
`market_permit`, "Halteverbot beim Ordnungsamt beantragen" → `no_parking`, "Plakatierungsgenehmigung beantragen und
Aufkleber abholen" → `signage`, "Musik-Anmeldung bei der Verwertungsgesellschaft" → `gema`, "Sicherheitskonzept beim
Ordnungsamt einreichen" → `safety_concept`, "Gaststättenerlaubnis für den Getränkeausschank prüfen" → `catering`;
verify against the enum/seeded requirements) get `template_item.permit_type` (synthetic dictionaries, seed incl. the
Grundvorlage, template editor select "Gehört zur Genehmigung", propagation). One helper `linkPermitTasks(tx, eventIds)`
sets `task.permit_id` to the event's permit of that type after instantiation and after every permit-linking path;
`fillLogbookForEvents` must not create a duplicate `source = permit` task when a linked template task exists.
Pure rule in core: a linked application task is done once its permit is applied/granted/held → auto-complete via the
tasks service (audited) in `setPermitStatus`/`restorePermitStatus` and after linking. Pure `permitStateForEvent`: a
held permit valid through the event's last day is OK for that event (no "Läuft ab") — use it in the event
Genehmigungen tab + count, Überblick, event health (weekend table), Bereitschaft, Kalender permit chips; past one-day
permits of finished events are history, not "Abgelaufen" warnings, in `/genehmigungen`. Waiting tasks
(`waiting_external`) past due show neutral "wartet seit …", not red overdue, and don't count as overdue. Health words
→ reasons ("1 Genehmigung fehlt", "5 überfällig", "Im Plan"); event Board tab "■ 26" → "26 offen · N überfällig".
Format helper in `apps/web/src/lib/format.ts` that adds the year when not the current year; use it in mixed-year
lists. Tests (core + integration), e2e updated, screenshots, report. Don't touch the notification system.
Own throwaway DBs `marktwerk_p_dev`/`marktwerk_p_test`, port 3023.

### 11.2 Agent Q — notification center
Goal (approved): company-wide notification center for owner/manager. Un-hide `HIDDEN_MODULES.notifications`.
`packages/jobs/src/deadline-sweep.ts` creates company-wide notifications (recipient null, dedupe per subject +
reason + due date, no email) for overdue tasks of current markets (past-event rule, not snoozed), due-soon tasks,
permits with apply-by within the permit horizon or decision due, and permits expiring before a required market;
higher severity for Kernaufgaben/overdue. Auto-resolve when the subject is resolved (task done/skipped/cancelled/
snoozed; permit applied/granted/not required) in the sweep and at query time. Queries/services with filters
(Offen/Zurückgestellt/Erledigt, Art Aufgaben/Genehmigungen, Markt), sort (Dringlichkeit/Neueste), actions (Erledigt —
for a task completes it via the tasks service with undo; Zurückstellen; reopen; alle gelesen), permission
owner/manager (staff keep personal ones). Page `/benachrichtigungen` with the labelled filter bar, rows with kind icon,
title link, market colour marker, due info, actions; J/K/Enter. Bell in the top bar (count, latest 5, quick Erledigt,
"Alle anzeigen"); Strg+K entry; no sidebar entry. Tests (core, integration incl. permission, e2e), docs
(ux-concept, data-model, open-questions), screenshots, report. Don't touch permit services/state rules, task↔permit
linking, templates, `lib/format.ts`, Übersicht/event/board components. Own throwaway DBs
`marktwerk_q_dev`/`marktwerk_q_test`, port 3024.

---

## 12. History: session-3 handoff (as written 2026-10-21)

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
