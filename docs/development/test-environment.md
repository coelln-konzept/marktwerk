# Test environment ("Probebetrieb"): design

Date: 2026-11-04 · Status: **draft, open decisions in §9** · Decision record: [ADR 0021](../architecture/adr/0021-test-environment.md)

Before the company uses marktwerk for real, and every time a big change lands afterwards, we want one place where
the whole product can be exercised end to end: email going out and coming in, booking requests, stall
allocation, permits, market planning and the market day itself, hours and money. This spec describes that place
and the tools around it.

## 1. Goals and non-goals

**Goals**
1. A **permanent staging environment** that behaves like production, holds only synthetic data and can be reset
   to a known state with one action, plus **one more environment per branch under test** (e.g. `main` and
   `exp/stand-allocation` side by side), each with its own data, clock and inbox.
2. **Email in both directions** that works for real but can **never reach a real vendor, authority or staff member**.
3. **Time control**: walk an event from T-180 to T+7 in minutes, with every scheduled job running as it would on
   each of those days.
4. **Simulated outside world**: vendors, authorities, staff and the bank act on the system the way real people do
   (mails, form submissions, payments, hours).
5. **Repeatable scenarios** that drive (2)–(4) and check the outcome, runnable locally, in CI and against staging.
6. A short, fixed **release routine** for big changes that uses all of the above.

**Non-goals**
- Load or performance testing (scale is medium: up to 4 events per weekend).
- Testing third-party systems themselves (M365, the old website, the bank). We test our side of each connection.
- AI-generated test content. Scenario mails are hand-written fixtures, so runs stay reproducible and ADR 0014
  stays untouched.

## 2. What exists today (2026-11-04)

| Piece | State | Gap for this spec |
|---|---|---|
| Synthetic data (`packages/synthetic`, ADR 0016) | Deterministic, generated as of a reference day (`SYNTHETIC_REFERENCE_DATE`) | Seed refuses a seeded DB; no reset; data drifts daily |
| Outbound mail (`packages/jobs/src/send-emails.ts`) | `outbound_message` queue, `MailTransport` interface, SMTP or log transport, master switch `settings.email_enabled` | No recipient guard; no hosted catch-all for a deployed environment |
| Inbound mail | Postfach prototype on `exp/stand-allocation` with demo conversations in a browser store | No inbound source behind an interface; Graph (ADR 0008) not built |
| Bookings | Two-step booking design (Reserviert → Fest, 4 working-day release) on `exp/stand-allocation` | Website form and bank feed not built; nothing simulates vendors or payments |
| Jobs (`packages/jobs`) | Most handlers already take `now` as a parameter; triggered by pg-boss locally and `/api/cron/<job>` + GitHub Actions on Vercel | No "run every job for day X" entry point |
| Clock in the web app | 63 direct `new Date()` calls in pages, queries and services; a few SQL `now()`/`current_date` | No single place to move "today" |
| Tests | Core unit, service integration (`marktwerk_test`), Playwright smoke + axe, CI | No multi-step, multi-day journeys |
| Hosting | Vercel + Supabase `marktwerk-dev` (ADR 0017), seeded 2026-10-26 | Only one deployed environment; Supabase free tier is full (2 of 2 projects) |

## 3. Environments

| Environment | Purpose | Data | Clock | Mail |
|---|---|---|---|---|
| **local** | Daily development | Docker Postgres, `pnpm db:seed` | Real, or simulated via `.env` | Mailpit (`:8025`) |
| **test** (CI and local throwaway DBs) | Integration tests and scenarios | Empty or scenario fixtures, `*_test` DBs only | Simulated, set per test | In-memory transport + simulated mailbox |
| **staging** (new, permanent, tracks `main`) | Rehearsals, release checks, user tests, training | Synthetic, reset on demand | Simulated, movable from the admin page | Catch-all inbox + allowlist; optional real M365 test mailbox |
| **branch environments** (new, on demand, one per branch, §4.1) | Testing a branch that is not merged yet (e.g. `exp/stand-allocation`) side by side with `main` | Synthetic, own database, reset on demand | Simulated, own clock | Same catch-all, own inbox per environment |
| **production** (later, ADR 0006) | Real work | Real | Real, override impossible | Real |

Rules that hold everywhere:
- `APP_ENV` (`local` · `test` · `staging` · `production`) is a required variable. Every safety guard below keys
  off it, never off `NODE_ENV` or the URL.
- In `production` the clock override, the reset action, the simulation endpoints and the simulated mailbox **do
  not exist** (not built into the route table, not just hidden), and startup fails if any `SIM_*` variable is set.
- Staging shows a permanent, non-dismissable **"TESTUMGEBUNG · simulierter Tag: Mo, 03.03.2027"** band in the
  top bar, in a colour production never uses.

## 4. Staging environment

**Shape:** a second deployment of the same `main` build with its own database, its own `BETTER_AUTH_SECRET`, its
own `CRON_SECRET` and its own URL (e.g. `marktwerk-staging.vercel.app` now, `marktwerk-staging` on Scalingo later,
which `deployment.md` already plans). Hosting of the database is open (§9, D1).

**Reset ("Neu aufsetzen"):** one guarded action, both as an admin button (staging only) and as a GitHub Actions
workflow `reset-staging.yml` (`confirm=reset`):
1. Refuse unless `APP_ENV=staging` and the database name/host matches the configured staging target.
2. Drop and recreate schema `app`, run migrations.
3. Seed the synthetic dataset for a chosen **reference date** (default: today) and set the simulated clock to it.
4. Optionally apply a **starting scenario** (§7), e.g. "Saison läuft, 3 Märkte nächstes Wochenende, 12 offene
   Anfragen".
5. Recreate the test logins from secrets (owner, manager, office, field staff) so testers know who they are.
6. Write a reset record (who, when, reference date, scenario, git commit) that the admin page shows.

This also removes the drift problem the handoff describes (seed refuses a seeded DB, a few more overdue tasks
every day nobody works).

**Who uses it:** the product owner for release checks; Jerome's team for user tests and, if wanted, training
(§9, D3). Each tester has their own login so the audit log shows who did what.

### 4.1 Several versions side by side: branch environments

Staging is just the **environment named `main`**. Any other branch can get its own environment of the same
shape, so `main` and `exp/stand-allocation` (and more later) can be tested at the same time without touching each
other. Everything that holds state is per environment:

| Per environment | How |
|---|---|
| **Name** | Derived from the branch: `exp/stand-allocation` → `exp-stand-allocation`; staging is `main` |
| **App** | Vercel preview deployment of that branch (already built per push) at its stable branch URL `marktwerk-git-<branch>-….vercel.app`; on Scalingo later a review app per branch |
| **Database** | Its own Postgres database (§9, D1 decides the host). Migrations are the **branch's own**: an experimental schema never touches `main`'s data. When a branch's migrations diverge from what its DB has seen (rebase, edited branch migration), the environment is reset instead of migrated |
| **Secrets** | Own `BETTER_AUTH_SECRET` and `CRON_SECRET`; `DATABASE_URL` and `APP_ENV_NAME` set as branch-scoped Vercel preview variables |
| **Clock** | Own `sim.clock` row in its own DB, so one environment can sit in March 2027 while `main` is in November 2026 |
| **Mail** | Same fenced transport (§5.1); the catch-all files every mail under the environment's name (own Mailtrap inbox, or Mailpit tag `env:<name>`), and the subject prefix includes it: `[exp-stand-allocation · an: anna@…]` |
| **Simulated mailbox** | Schema `sim` in its own DB |
| **Band** | "TESTUMGEBUNG **exp-stand-allocation** · simulierter Tag: …", colour derived from the name so two tabs are told apart at a glance |

**Lifecycle**, all through one workflow `test-env.yml` (`action` = `up` · `reset` · `down`, `branch`, optional
`reference_date` and `scenario`) and a small CLI wrapper `pnpm env up exp/stand-allocation`:
1. **up**: create the database, set the branch-scoped variables, trigger a deployment of the branch, migrate,
   seed (as in §4 reset), print the URL and the test logins.
2. **Every push** to the branch redeploys automatically (Vercel previews). Migrations run in the build as today
   (`vercel.json`) against that environment's DB only.
3. **reset**: as §4, for that environment only.
4. **down**: drop the database, remove the variables and the catch-all inbox. Runs automatically when the branch is
   deleted or its PR is merged, and for any environment untouched for 30 days (with a notice first).

**Registry and overview:** the environments live in a small registry (a JSON file in a private gist or a
`sim.environment` table on the `main` DB; decided in the plan): name, branch, URL, DB, created, last reset,
reference date, scenario, simulated day. `pnpm env list` and a page on staging (`/system/umgebungen`) show them
all with links. A soft limit (default 4 at once besides `main`) keeps cost and the free-tier limits in check.

**Scheduled jobs:** only `main` gets the GitHub Actions cron (as today). Branch environments run jobs when you
**advance the clock** (§6) or press "Jobs jetzt ausführen"; that is what testing needs anyway, and it avoids a
cron per branch.

**Scenarios across versions:** `pnpm sim run <name> --target <env>` works for any environment, and
`pnpm sim compare <name> main exp-stand-allocation` runs the same scenario on both (same seed, same reference date)
and diffs the outcomes (bookings, tasks, sent mails). A scenario that uses a feature only one branch has is marked
with `requires: ["bookings.two-step"]` and is skipped elsewhere.

**Locally**, each git worktree already is a separate checkout; `pnpm db:up` gives each one its own database
`marktwerk_<worktree>` on the shared Docker Postgres and its own dev port, so the same "several versions at once"
works on one machine.

## 5. Mail

### 5.1 Outbound: real sending, fenced in

A new `GuardedTransport` wraps whichever `MailTransport` is configured:
- `production`: passes through.
- every other `APP_ENV`: **every recipient is checked against an allowlist** (`MAIL_ALLOWED_DOMAINS`, e.g.
  `marktwerk.test`, plus explicitly listed test addresses). Anything else is **rewritten** to the catch-all
  address with the original recipient kept in a header and in the subject prefix `[an: anna@example.org]`,
  and the rewrite is logged on the `outbound_message`. It never throws away a mail silently and never sends to an
  address outside the allowlist.

The synthetic generator already invents vendor addresses; they move to the reserved `.test` TLD
(`vorname.nachname@vendors.marktwerk.test`) so even a guard bug cannot hit a real mailbox.

Where staging mail lands (§9, D2): a hosted catch-all with an API, so scenarios can assert on delivered mail.
Candidates: Mailpit on a small always-on host, Mailtrap Email Sandbox, Mailosaur. Locally Mailpit stays.

### 5.2 Inbound: one interface, two sources

The Postfach and later the Graph integration (ADR 0008) read and send through one interface:

```ts
interface MailboxSource {
  listChanges(mailbox: MailboxId, since: Cursor | null): Promise<{ messages: InboundMail[]; cursor: Cursor }>;
  fetch(mailbox: MailboxId, externalId: string): Promise<InboundMail>;
  sendAs(mailbox: MailboxId, mail: OutgoingMail): Promise<{ externalId: string }>;
  move(mailbox: MailboxId, externalId: string, folder: FolderRef): Promise<void>;
}
```

| Implementation | Used in | What it is |
|---|---|---|
| `SimulatedMailbox` | local, test, staging | Tables in schema `sim` (never `app`); personas and scenarios write mails into it, replies we send land back in it and in the catch-all; threading headers (`Message-ID`, `In-Reply-To`, `References`) are real so `core/mail/thread.ts` is exercised for real |
| `GraphMailbox` | staging (opt-in), production | Graph application permissions with Exchange RBAC scope; delta sync + webhooks (ADR 0008) |

Staging can additionally point `GraphMailbox` at a **real test shared mailbox** in the company's M365 tenant
(e.g. `test-buchungen@…`), scoped by the same RBAC rule as the real booking mailboxes. That is the only way to test
webhooks, subscription renewal, delta sync and "send as shared mailbox" for real. It needs the client's M365
admin once (§9, D4). It is used before go-live and after any change to the Graph integration, not by scenarios.

## 6. Simulated clock

**One clock for business time.** `packages/core` gets `clock.ts`:
- `now(): Date` and `today(): BerlinDate` (Europe/Berlin calendar day, as the rest of the domain uses).
- Production: the real time, nothing else possible.
- local/test/staging: real time **plus an offset** stored in a one-row `sim.clock` table (or a fixed instant in
  tests). The offset keeps the clock ticking within a day, so "in 2 hours" still means something.

**What moves with it:** everything that decides *what is due*: Übersicht, Heute fällig, Kalender "today", due
badges, health, reminders, rollover, the deadline sweep, Minijob month status, reservation release, payroll
deadlines.
**What stays real:** auth sessions and token expiry (Better Auth), `created_at`/`updated_at` defaults, audit
timestamps (the audit row additionally records the simulated instant, so a rehearsal can be read back in its own
timeline), HTTP caching, rate limits.

**Refactor needed:** the 63 `new Date()` calls in `apps/web/src` and `packages/jobs` and the SQL
`now()`/`current_date` uses in queries (`search-core.ts`, `queries/finance.ts`, `services/payables.ts`) move to
`clock.now()`/`clock.today()` or take the instant as a parameter. A Biome rule (`noRestrictedGlobals`-style
pattern or a grep check in `pnpm lint`) forbids new direct `new Date()` without an argument in app code;
column defaults in the schema stay as they are.

**Advancing a day ("Tag vorspulen"):** a service `advanceTo(target: BerlinDate)` (staging admin page + scenario
API) that, for every day from the current simulated day to the target:
1. sets the clock to that day's job times (e.g. 06:00 digest, every 15 minutes of the sweep collapsed to a few
   representative instants),
2. runs **every** scheduled job for that instant, in the same order as production (rollover → deadline sweep →
   reminders → reservation release → digests → send queued emails),
3. lets personas react (§7) before moving on.

It refuses to go backwards (data created "in the future" would be inconsistent); going back = reset.

## 7. Personas and scenarios

### 7.1 Package `packages/simulation`

| Part | What it does |
|---|---|
| **Personas** | Deterministic actors with a seed: `Vendor` (books by mail or form, asks questions, changes length, cancels, pays on time / late / never / the wrong amount), `Authority` (grants, grants with Auflagen, rejects, answers late), `Landowner`, `Supplier`, `StaffMember` (hours that hit the Minijob limit, missing breaks), `Bank` (incoming transfers with good and bad payment references) |
| **Mail fixtures** | Hand-written German mail texts per situation, with variables (name, market, date, length); includes the messy cases: wrong market named, reply-all chains, attachments, forwarded mails, typo'd references, an English mail |
| **Driver** | Acts as a persona against the system: writes inbound mail into `SimulatedMailbox`, posts the booking form, records a bank transfer, and as an office user calls the same **services** the UI calls (never raw SQL, so permission checks and audit run) |
| **Checks** | Assertions on the DB (via queries), on delivered mail (catch-all API or in-memory transport), on notifications, and optionally on pages (Playwright) |

### 7.2 Scenario format

A scenario is a TypeScript file with steps that interleave clock moves, persona actions, office actions and checks:

```ts
export default scenario("flohmarkt-full-cycle", { referenceDate: "2027-01-10", seed: 7 }, async (s) => {
  const event = await s.office.createEventFromPreset("Flohmarkt Bilk", "2027-05-01");
  await s.advanceTo(event.day.minus({ days: 120 }));
  s.expect.tasksDue(event, { overdue: 0 });

  await s.authority("Stadt Düsseldorf").grants(event.permit("Marktgenehmigung"), { auflagen: 2 });
  s.expect.event(event).status("bestätigt");
  s.expect.tasks(event).include("Auflage umsetzen", 2);

  const vendors = s.vendors(40);
  await vendors.slice(0, 35).each((v) => v.requestsByMail(event, { metres: v.pick(2, 3, 4, 6) }));
  await vendors.slice(35).each((v) => v.requestsByForm(event));
  await s.office.allocateAll(event);
  s.expect.mail.sent({ template: "Platzkarte", count: 40 });

  await s.advanceBy({ workingDays: 4 });
  await s.bank.pays(vendors.slice(0, 30));
  await s.bank.pays(vendors.slice(30, 33), { reference: "typo" });
  await s.advanceBy({ workingDays: 1 });
  s.expect.bookings(event).fixed(30).reserved(3).released(7);
  s.expect.mail.sent({ template: "Reservierung aufgehoben", count: 7 });
  // … market day, hours, month close, CSV export
});
```

### 7.3 Where scenarios run

| Mode | Command | Database | Mail | Use |
|---|---|---|---|---|
| Throwaway | `pnpm sim run <name>` | fresh `marktwerk_sim_<random>_test`, dropped afterwards | in-memory + `SimulatedMailbox` | development, CI |
| All, in CI | `pnpm sim run --all` (nightly + on PRs labelled `big-change`) | as above | as above | regression net |
| Staging | `pnpm sim run <name> --target staging` (via the guarded simulation API) | staging | catch-all | prepare a state for manual testing, release check |
| Starting state | reset with `scenario=<name>` (§4) | staging | catch-all | "show me a market 5 days out with 3 problems" |

### 7.4 First scenario set

1. **flohmarkt-full-cycle**: preset → permits → 40 bookings → Platzkarte → payments / release → market day →
   hours → month close.
2. **permit-trouble**: rejected permit, late decision, Auflagen, escalation to the manager.
3. **booking-inbox-mess**: wrong market named, duplicate request, length change after Platzkarte, cancellation
   after payment, reply in an old thread, spam.
4. **busy-weekend**: four events on one weekend, staff clash hints, overdue rollover, Übersicht ranking.
5. **minijob-month**: hours that cross the monthly limit, §17 MiLoG day-5/day-7, payroll by the 15th.
6. **template-change**: new template version applied deliberately to some events, others untouched.
7. **dst-and-holidays**: event on the DST switch weekend, deadlines across NRW holidays and year end.

Each new module (M7 WhatsApp, M8 legacy bridge, M9–M10 bookings, M11 inbox, M13 field mode, M14 stall maps) adds
at least one scenario as part of its definition of done.

## 8. Release routine for big changes

"Big change" = a schema migration on populated tables, anything touching jobs, mail, bookings, money or the
clock, or a new module. For those:

1. `pnpm check`, `pnpm test:integration`, `pnpm test:e2e` (as today).
2. `pnpm sim run --all` green (CI does this when the PR has the `big-change` label).
3. Merge to `main` → staging deploys → **reset staging** with the default starting scenario.
4. Run the scenarios against staging (`--target staging`); look through the catch-all inbox.
5. Manual session on staging along a short checklist per affected area (kept in `docs/development/release-checklist.md`);
   with the office team when they will feel the change.
6. Promote to production; after migrations on production data, re-run the read-only smoke checks.

Small changes (copy, layout, isolated bug fixes) keep the current flow.

## 9. Open decisions (product owner)

| # | Question | Options | Notes |
|---|---|---|---|
| D1 | Where do the **databases** for `main` and the branch environments live? | (a) Supabase paid plan with **branching** (a database per Git branch is its built-in model; compute billed per branch-hour) · (b) **Neon** (copy-on-write branches, free tier has several; cheap to create and drop per branch) · (c) one Postgres server with a **database per environment** (`marktwerk_main`, `marktwerk_exp_stand_allocation`; any host, cheapest, needs `CREATE DATABASE` rights) · (d) Scalingo review apps with an addon per branch (later, production host) | Product owner is checking Supabase pricing (2026-11-04). Must support **several databases at once**, created and dropped by a workflow. Supabase-specific features are not used (ADR 0017), so any plain Postgres 17 works |
| D2 | Where does staging **outbound mail** land? | Hosted Mailpit · Mailtrap Email Sandbox · Mailosaur | Needs an API for scenario checks |
| D3 | Does Jerome's team **use staging for training** as well as user tests? | Yes: reset only on request, announced · No: reset freely | Changes how often staging may be wiped |
| D4 | **Real M365 test mailbox**: now or before Phase 2 (M11)? | Now (needs the client's admin) · Later | Only needed once Graph code exists |
| D5 | Scenarios on every PR or only `big-change` + nightly? | | Depends on runtime once the first set exists |
| D6 | Branch environments: **automatic for every pushed branch**, or **only on request** (`pnpm env up`)? | Automatic · On request | On request keeps cost and DB count down; automatic means every PR is testable without a step |

### 9.1 Cost estimate for D1/D2 (list prices checked 2026-11-04, USD; € rough)

Prices: Vercel Hobby $0 (personal, non-commercial use only), Pro $20/month per developer seat incl. $20 usage,
viewer seats free; office users log into marktwerk, not Vercel, so they need no seats. Supabase Free: 2 projects,
pause after 1 week idle, 500 MB, no branching; Pro $25/month incl. $10 compute (= one Micro); compute Micro $10 /
Small $15 / Medium $60 per month; branching $0.01344 per branch-hour (≈ $10 for a branch running a full month);
PITR $100/month per 7 days (daily backups included in Pro). Neon Free: 10 branches and 100 CU-hours per project,
scale to zero after 5 min; Launch $0.106/CU-hour + $0.35/GB-month, no minimum. Mailtrap sandbox Free 50 mails/month,
paid $17–42; self-hosted Mailpit on a small VM ≈ €5.

| | Development, free tiers | Development, once the team tests (recommended) | Operation on Vercel + Supabase |
|---|---|---|---|
| Vercel | Hobby $0 | Pro $20 | Pro $20 |
| `main` / staging DB | existing `marktwerk-dev` $0 | Supabase Pro, Micro: $25 (credit) | $10 (Micro, second project) |
| Production DB | n/a | n/a | Supabase Pro $25 + Small $5 after credit |
| Branch environments | Neon free $0 | Supabase branching ≈ $5–15 or Neon ≈ $0–5 | ≈ $5–15 |
| Mail sink | Mailpit ≈ €5 | Mailpit ≈ €5 | Mailpit ≈ €5 |
| Real outbound mail | n/a | n/a | €0 via the M365 shared mailbox; else an EU provider ≈ €0–15 |
| **Per month** | **≈ €5** | **≈ $50–65 (≈ €45–60)** | **≈ $70–85 (≈ €60–75)**, + $100 if PITR is wanted |

Notes:
- **Cron:** the 15-minute GitHub Actions schedule is ≈ 2,900 runs/month, each billed as at least one minute, more
  than a private repo's 2,000 free minutes. On Vercel Pro, Vercel Cron replaces it at no extra cost.
- **Supabase branching** expects its own migration workflow; creating branches through the CLI/API with Drizzle
  migrations needs a short spike first. Neon branches have no such dependency.
- **Production host** stays a data-protection decision for the client (ADR 0006, Scalingo as EU-owned candidate);
  the numbers above only compare prices.
- **Suggested path:** free tiers now; Vercel Pro + Supabase Pro (Micro) when the office team starts testing;
  Neon free for branch environments until the Supabase branching spike passes.

## 10. Build order

1. **Clock** (`core/clock.ts`, refactor of direct `new Date()`, lint check) and **`APP_ENV`** with the production
   guards. Unblocks everything else.
2. **Environments**: `test-env.yml` (`up` · `reset` · `down`) with the registry, built for many from the start;
   `main` is the first environment (staging), `exp/stand-allocation` the second. Test logins from secrets, the
   TESTUMGEBUNG band with the environment name. Needs D1 (and D6 for automatic creation).
3. **Guarded outbound mail** and the `.test` addresses in the synthetic data. Needs D2 for staging.
4. **`advanceTo`** with the ordered job runner.
5. **`packages/simulation`**: driver, personas, `SimulatedMailbox`; scenarios 1, 4 and 7 on what exists today.
6. Scenarios for bookings and the Postfach once `exp/stand-allocation` lands (2, 3, 5, 6 follow their modules).
7. **`GraphMailbox` against the real test mailbox** with M11. Needs D4.

Each step is a separate PR with its own plan.
