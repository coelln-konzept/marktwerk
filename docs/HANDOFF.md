# Handoff

**Updated 2026-11-10.** One current handoff; earlier session handoffs are in git history. Repository:
[`coelln-konzept/marktwerk`](https://github.com/coelln-konzept/marktwerk).

## Where things stand
- **Phase 1 (M1–M6) is built in code.** Since then:
  - UX review (PR #20, 2026-10-29): [research 10](./research/10-ux-review-2026-10.md).
  - User test + handwritten notes (PR #21, 2026-11-03): event **Checkliste** tab (done items stay in place),
    **Zusammenfassung** (was Überblick), **Archiv** under Stammdaten; global Board, Kernaufgaben, the bell and the
    Kalender's Aufgaben layer hidden. [Research 11](./research/11-user-test-2026-11.md).
  - Client feedback 9 (PR #22, 2026-11-04): **Besprechungen**, Übersicht layout, task notification setting (nothing
    sent yet), market colours, A–Z on Aussteller/Kontakte.
  - PR #23: cancelling an event cancels its open tasks; **Veranstaltung löschen**.
- **Hidden modules** (UI only, data stays): `HIDDEN_MODULES` in `apps/web/src/lib/modules.ts`: `team`, `finance`,
  `estimates`, `notificationBell`, `calendarTasks`, `keyTasks`, `globalBoard`, `booking`. Flip a flag to bring a
  module back. Why each is hidden: [roadmap, Status](./product/roadmap.md#status-2026-11-10).
- **Decisions:** [open-questions.md](./open-questions.md) (Decided table; superseded rows are marked).
- **This branch (`work/2026-11-10`, cleanup PR):** docs tidy-up (this file, archive, roadmap status) plus code
  cleanup: the unused task-comment service goes (`task_comment` table kept for old data), `task_watcher` and
  `user_preference.sidebar_collapsed` are dropped, the `/wissen` sidebar entry is hidden (route stays, placeholder),
  and `/api/finanzen/belege` follows the Finance hide.

## Local setup
Follow [development/setup.md](./development/setup.md). Notes for the macOS machine:
- Postgres + Mailpit via Docker: `pnpm db:up`. Postgres is mapped to **port 5433** by a local, git-excluded
  `docker-compose.override.yml` (a system Postgres owns 5432); `.env` points `DATABASE_URL` / `TEST_DATABASE_URL` there.
- Dev server: `preview_start` name **`marktwerk`** (`.claude/launch.json`, `pnpm dev`, port **3001**; 3000 is taken by
  another container). Restart it after branch jumps or merges (Turbopack keeps stale modules).
- `DEV_AUTO_LOGIN_EMAIL` / `DEV_AUTO_LOGIN_PASSWORD` in `.env` sign a fresh localhost browser in (setup.md).
- Reseed: drop + create the database, then `pnpm db:migrate && pnpm db:seed` (setup.md, "Reset the data"). The seed
  refuses an already seeded database.
- E2E: `E2E_BASE_URL=http://localhost:3001 E2E_CHROMIUM_PATH=<path to Chrome> pnpm test:e2e`
  ([testing.md](./development/testing.md)). Earlier runs can leave saved views in `app.user_preference.saved_views`
  that break the next run; reset them for the e2e owner.
- Merging: the repo does not allow auto-merge; `gh pr merge <n> --merge` once `gh pr checks` is green.

## Deployed version
- **https://marktwerk-three.vercel.app** (Vercel + Supabase `marktwerk-dev`, ADR 0017). Production host is not decided
  (Scalingo candidate, ADR 0006). Details: [deployment.md](./development/deployment.md).
- Seeding: Actions → **Seed dev database** (`gh workflow run seed-dev.yml --ref main -f confirm=seed`), using the repo
  secrets `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `DATABASE_MIGRATION_URL` (values only in GitHub/Vercel, never in
  chat). The seed refuses a seeded database, and there is no wipe workflow yet: ask before building one (destructive).
- Auth is email + password. Magic link and invitations come once an email provider exists.

## How the product owner likes to work
- Plans first, approval, then build; **ask before product/architecture decisions**, log answers in
  `docs/open-questions.md` (Decided table).
- Show options with pros/cons (mock-ups help) and let them pick; they decide quickly.
- Parallel Sonnet agents in worktrees for independent work, each owning separate files and a throwaway DB; UX
  refinement, reviews and the browser checks by Claude (Opus).
- One PR per batch; merge when CI is green (they confirm per PR).
- Less clutter, but **all tasks of a market visible together**: the problem is the display, not the amount.
  German UI wording; market colours.

## Next steps
1. **Finish this cleanup PR** (code + docs above), `pnpm check` green, browser-check the hidden entries.
2. **Phase 1 exit (M6)**, see [roadmap, Status](./product/roadmap.md#status-2026-11-10):
   - production hosting (Scalingo candidate) + backups (backup target: open question 1);
   - S3 file storage (open question 2) and photo uploads from phones;
   - user invitations / magic link; "Passwort vergessen" (needs SMTP; open question 4);
   - DATEV export format (with the tax advisor);
   - real client data instead of synthetic;
   - pilot with the office, then go/no-go for Phase 2.
3. **Test environment spec:** PR #24 (`docs/test-environment`: staging, branch environments, simulated clock,
   scenarios), open for review.
4. **Experimental:** `exp/stand-allocation` (Postfach + Standplan prototype) gets its own plan and roadmap; PR #25
   documents its Neon branch environment.
5. Open user-test items (UT-10 "Bezahlt", UT-11 Kalender polish, UT-12 data cleanup, UT-18/19 master data):
   [research 11 §5](./research/11-user-test-2026-11.md).

## Gotchas worth keeping
- **Dev server reloads in a loop** ("Compiled in 1ms" after every request, `[Fast Refresh] rebuilding` on every load):
  stop it, delete `apps/web/.next/dev` and `apps/web/.next/cache`, start again. Also the cure when `touch:` rules seem
  missing from the served CSS. If it persists, check that the Docker DB is up, and look at the first red console error
  (a browser extension throwing on load also makes Next's HMR client reload forever).
- **Tailwind 4:** `cn()` knows `text-body/small/tiny` (otherwise tailwind-merge drops colours or sizes); never pair
  `outline-none`/`outline-hidden` with `focus-visible:outline-*` (it zeroes `--tw-outline-style`); `Table` scrollers are
  `relative` (sr-only cells widened pages); use the `touch:` variant for keyboard hints; `--on-critical`/`--on-ok` for
  text on solid status dots.
- **`notFound()` answers HTTP 200:** the app-wide `app/(app)/loading.tsx` makes routes stream, so not-found pages
  return 200 with the German not-found page. Accepted for an internal tool; e2e asserts the page, not the status.
- **Prototype vs. docs:** the Claude Design prototype is historical. [ux-concept.md](./product/ux-concept.md) and the
  code win.
