# 0022: A market's times are a Zeitplan of windows, not four fixed fields

**Status:** accepted (2026-11-13, product owner, user test 2: [research 12](../../research/12-user-test-2026-11-13.md) UT2-09/10, D2-5).

## Context
A market and each event store one `times = { setup, open, close, teardown }` (HH:mm). Nothing says who a time is for.
In practice there are several audiences (our team arriving and building up, vendors setting up and tearing down,
visitors during opening hours), they differ per market, and there are edge cases: on multi-day markets vendors may
tear down early on the **last morning**, before visitors arrive, in addition to the normal tear-down in the evening.
Four fixed fields can't hold a second window or say which day a window belongs to.

## Decision
- A **Zeitplan** is a list of windows. Each row: `audience` (`team` | `vendors` | `visitors`), `kind`
  (`setup` | `open` | `teardown`), `day` (`before` = the day before the first day, `first`, `each`, `last`),
  `from`, `to` (HH:mm, Europe/Berlin).
- `event_preset.schedule` holds a market's default Zeitplan; `event.schedule` is copied at instantiation and can be
  changed per event (like the other market defaults).
- New markets start with three rows: vendors · setup · first · 06:00–08:00; visitors · open · each · 08:00–16:00;
  vendors · teardown · last · 16:00–18:00. Rows for the team are optional.
- Validation in `packages/core` (pure, tested): `from < to`; at least one visitors · open row; `day = each/last/before`
  only where it makes sense for the event length.
- Compact summary everywhere space is short: visitor hours + earliest vendor setup ("08–16 Uhr · Aufbau ab 06:00").
  The full Zeitplan shows on the event page and is edited in Markt planen and the event's Eckdaten.
- Migration: existing `times` become the three default rows (setup → vendors setup until open; open/close → visitors;
  close → vendors teardown until `teardown`). `times` is removed once nothing reads it.

## Consequences
- Every reader of `times` (summaries, Eckdaten, Markt planen, templates, Kalender, checks in `checkEventTimes`) moves
  to the Zeitplan.
- Later, the website and vendor information can pick rows by audience (ADR 0013) without another model change.
- The synthetic dataset produces `schedule` on markets and events (research 12 §5).
