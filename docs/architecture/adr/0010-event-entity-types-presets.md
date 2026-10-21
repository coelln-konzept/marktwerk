# 0010: "Event" (Veranstaltung) is the core entity, with types and presets

**Status:** accepted (2026-10-21, product owner)

## Context
The client runs flea, antique/design, design, food & wine markets, city festivals and theme markets, and
wants to add workshops and tournaments (research 05). Their old website already models **presets** (headline,
text, price) and **dates** (Termine) assigned to presets.

## Decision
- One core record: `event` (DE **Veranstaltung**), with an `event_type` that carries rules (new-goods share,
  banned goods, online booking allowed, default price per metre, booking fee).
- `event_preset` (DE **Veranstaltungsvorlage**, the old website's "preset", extended) is the blueprint per
  recurring event at a location: texts, price, templates, permit needs, equipment needs, default team, optional
  recurrence. Events are generated from presets (or from multi-year location agreements).
- The UI may still say "Märkte" where natural; code and data say `event`.
- Replaces `market` / `market_series` from data model v0.2 (nothing was built yet).

## Consequences
- New formats need no new tables. Type-specific features (e.g. team registration for tournaments) hang off
  `event_type` later.
- Importing the old website's presets/dates maps 1:1.
