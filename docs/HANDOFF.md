# Handoff

The session-start doc: how the product owner works, local setup, the deployed version and gotchas. Earlier session
handoffs are in git history. Repository: [`coelln-konzept/marktwerk`](https://github.com/coelln-konzept/marktwerk).

## Status and next steps
Not kept here, so it can't go stale:
- **Steps, progress, the next step:** the **[Marktwerk Fahrplan](https://claude.ai/artifact/Ei3Xy9VGSDWr5WsEujn639)**
  (source of truth; how to use it at the start of a session: `CLAUDE.md`).
- **Milestones, scope and the hidden modules** (`HIDDEN_MODULES` in `apps/web/src/lib/modules.ts`; flip a flag to
  bring a module back): [roadmap](./product/roadmap.md#status).
- **Decisions:** [open-questions.md](./open-questions.md) (Decided table; superseded rows are marked).

## Local setup
Follow [development/setup.md](./development/setup.md). Notes for the macOS machine:
- Postgres + Mailpit via Docker: `pnpm db:up`. Postgres is mapped to **port 5433** by a local, git-excluded
  `docker-compose.override.yml` (a system Postgres owns 5432); `.env` points `DATABASE_URL` / `TEST_DATABASE_URL` there.
- Dev server: `preview_start` name **`marktwerk`** (a local `.claude/launch.json`, not in the repo; `pnpm dev`, port
  **3001**; 3000 is taken by another container). Restart it after branch jumps or merges (Turbopack keeps stale modules).
- `DEV_AUTO_LOGIN_EMAIL` / `DEV_AUTO_LOGIN_PASSWORD` in `.env` sign a fresh localhost browser in (setup.md).
- Reseed: drop + create the database, then `pnpm db:migrate && pnpm db:seed` (setup.md, "Reset the data"), or empty
  the app data with `pnpm db:wipe -- --yes` (logins kept) and seed again. The seed refuses an already seeded database.
- E2E: `E2E_BASE_URL=http://localhost:3001 E2E_CHROMIUM_PATH=<path to Chrome> pnpm test:e2e`
  ([testing.md](./development/testing.md)). Earlier runs can leave saved views in `app.user_preference.saved_views`
  that break the next run; reset them for the e2e owner.
- Merging: the repo does not allow auto-merge; `gh pr merge <n> --merge` once `gh pr checks` is green.

## Deployed version
- **https://marktwerk-three.vercel.app** (Vercel + Supabase `marktwerk-dev`, ADR 0017). Production host is not decided
  (Scalingo candidate, ADR 0006). Details: [deployment.md](./development/deployment.md).
- Seeding: Actions → **Seed dev database** (`gh workflow run seed-dev.yml --ref main -f confirm=seed`), using the repo
  secrets `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `DATABASE_MIGRATION_URL` (values only in GitHub/Vercel, never in
  chat). The seed refuses a seeded database. To replace the data, the same workflow takes `-f wipe=wipe`: it empties
  every app table except the sign-in tables first (destructive: ask the product owner before running it; details in
  [deployment.md](./development/deployment.md#seeding-the-dev-database-github-actions)).
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

## Outside the Fahrplan
`exp/stand-allocation` (Postfach + Standplan prototype) has its own plan and runs in a Neon
branch environment ([deployment.md](./development/deployment.md#branch-environments-on-neon-manual-for-now), ADR 0023).

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
- **Prototype vs. docs:** the Claude Design prototype ([archive](./archive/claude-design/a-classic/INDEX.md)) is historical. [ux-concept.md](./product/ux-concept.md) and the
  code win.
