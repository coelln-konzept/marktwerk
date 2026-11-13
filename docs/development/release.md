# Release routine

How a change reaches the people who use marktwerk ([ADR 0023](../architecture/adr/0023-test-environments.md)).
Small changes go straight through a PR into `main`; the deployed dev app follows `main` and migrates in the Vercel
build. A **big change** (new schema, a migration that drops or converts data, a new module, anything Jerome tests
before it is used) takes the long way below.

## Checklist for a big change
1. **Branch and PR.** One branch per block of work; `pnpm check` and the web integration suite green locally.
2. **Migrations on a copy first.** Apply the new migrations to a copy of real-shaped data (a clone of the local dev
   database or a Neon child branch) and look at the result; destructive steps (drops) in their own migration.
3. **Branch environment.** For schema changes or anything Jerome should click through: bring up a Neon branch
   environment for the branch ([deployment.md](deployment.md#branch-environments-on-neon-manual-for-now)), seed it
   as of the test day, run the jobs by hand that the change touches.
4. **e2e against it.** `E2E_BASE_URL=<preview URL> pnpm --filter @marktwerk/web test:e2e`; fix before merging.
5. **Walk-through.** The changed screens at desktop and 390 px, keyboard only once; note what was checked in the PR.
6. **Merge when CI is green** (check + e2e). Never merge over a red check, not even a "known flaky" one.
7. **Shared databases.** A migration that drops columns or tables breaks every checkout that still reads them: tell
   the other sessions / people before migrating a shared database, and migrate it only after they have pulled `main`.
8. **Deployed dev app.** Watch the Vercel build (it migrates), open `/api/health`, click the changed screens once.
9. **Production (once it exists, phase "Production hosting").** Same commit as the checked dev deploy; backup taken
   before the migration; migrate, deploy, health check, then the three most used screens.
10. **Tell and tidy.** Note the release in the Fahrplan (`meta/plan.lastSession`), remove the branch environment
    (`down <env>`), delete merged branches.
