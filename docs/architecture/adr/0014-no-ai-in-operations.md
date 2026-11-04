# 0014: No AI in operational decisions; human-confirmed drafts only

**Status:** accepted (2026-10-21, client principle); amended 2026-11-04 (stall reservations, see below)

## Context
The client: AI is used to build the product, not to run it (*"no 'Jesus take the wheel'"*). They're open to an
agent that turns free-text booking emails into drafts, if a person confirms and the original stays visible.

## Decision
- Phases 1–3 contain **no AI features**. Parsers for system emails are deterministic.
- Phase 4 AI drafting (opt-in, EU-hosted, AVV): output is always a *draft* in a review queue, with the original
  side by side, field states found/guessed/missing, code validation (dates must be real event dates, metres in
  range), corrections logged. **Nothing is ever confirmed automatically.**
- Payment reminders and cancellations are sent by a person.
  **Amended 2026-11-04 (product owner):** the exception is the **stall reservation** in the two-step booking
  (Reserviert → Fest). Its payment reminder and its release with a cancellation mail run **automatically** by
  fixed rules (deadline and reminder timing from settings). This is a deterministic rule, not AI; marking a
  stall as paid (Fest) stays a person's action. Spec: `docs/superpowers/specs/2026-11-04-two-step-booking-design.md`.

## Consequences
The product is useful without AI; AI only removes typing.
