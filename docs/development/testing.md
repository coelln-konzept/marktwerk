# Testing

| Layer | Where | Command | Needs |
|---|---|---|---|
| Domain rules (pure) | `packages/core/src/**/*.test.ts` | `pnpm --filter @marktwerk/core test` | nothing |
| Message parity (de/en) | `apps/web/scripts/check-messages.ts` | part of `pnpm test` | nothing |
| Service integration | `apps/web/test/integration/*.test.ts` | `pnpm test:integration` | Postgres |
| Browser smoke | `apps/web/e2e/*.spec.ts` | `pnpm test:e2e` | running, seeded app |

`pnpm test` (and `pnpm check`) never touch a database. Integration and e2e tests are separate commands.

## Service integration tests
Vitest, node environment, config in `apps/web/vitest.config.ts`.

- Runs against its **own database `marktwerk_test`** on the local Postgres
  (`postgres://marktwerk:marktwerk@localhost:5432/marktwerk_test`; override with `TEST_DATABASE_URL`).
  The name must end in `_test`: the helpers refuse to truncate anything else.
- `test/global-setup.ts` creates the database if it is missing and applies `packages/db/drizzle` (same journal as
  `drizzle-kit migrate`). So the first run is just `pnpm db:up && pnpm test:integration`. To migrate by hand:
  `DATABASE_MIGRATION_URL=postgres://marktwerk:marktwerk@localhost:5432/marktwerk_test pnpm db:migrate`.
- Every test starts from an empty `app` schema (`resetDatabase()`) and seeds the minimum it needs with
  `test/helpers/fixtures.ts` (`seedCatalogue()`, `createActor(role)`). Files run one after another because they share
  the database.
- Services are imported as in the app (`@/server/...`). `server-only` is aliased to an empty module, and
  `__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS` is set so that `forbidden()` throws its 403 error (as with
  `experimental.authInterrupts` in `next.config.ts`). Only import modules that do not call `next/headers`
  (services take an `Actor`; build one by hand, never via `getActor()`).
- Currently covered: `createEventsFromPreset` and `archiveDraftEvents` (`events.test.ts`).
- Test files and `vitest.config.ts` are type-checked by `pnpm typecheck` via `apps/web/test/tsconfig.json`.

## Browser smoke test (Playwright)
`@playwright/test` is pinned to the same version as the Chromium in the sandbox image. Tests log in as the seeded
owner, then check: Übersicht heading, Veranstaltungen list → Space opens the Vorschau → Öffnen / Enter opens the event
page → back, and the command palette (`Ctrl+K`, “koln” finds Köln). The app is **not** started by Playwright.

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed   # once
pnpm dev                                        # or: pnpm build && pnpm --filter @marktwerk/web start
pnpm test:e2e                                   # other terminal
pnpm --filter @marktwerk/web exec playwright install chromium   # first time on a new machine
```

| Variable | Default | |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | app under test (can be a deployed dev instance) |
| `E2E_EMAIL` / `E2E_PASSWORD` | seeded owner | login |
| `E2E_CHROMIUM_PATH` | unset | use an installed Chromium instead of Playwright's own |

Reports and traces go to `apps/web/playwright-report/` and `apps/web/test-results/` (gitignored).

## CI (`.github/workflows/ci.yml`)
- Job `check`: lint, typecheck, `pnpm test`, migrate, build, then creates `marktwerk_test`, migrates it and runs
  `pnpm test:integration` against the Postgres service container.
- Job `e2e`: migrate, seed, `pnpm build`, install Chromium, `next start`, wait for `/api/health`, `pnpm test:e2e`.
  On failure the Playwright report and the server log are uploaded as the artifact `playwright-report`.
