# 0014: No AI in operational decisions; human-confirmed drafts only

**Status:** accepted (2026-10-21, client principle)

## Context
The client: AI is used to build the product, not to run it (*"no 'Jesus take the wheel'"*). They're open to an
agent that turns free-text booking emails into drafts, if a person confirms and the original stays visible.

## Decision
- Phases 1–3 contain **no AI features**. Parsers for system emails are deterministic.
- Phase 4 AI drafting (opt-in, EU-hosted, AVV): output is always a *draft* in a review queue, with the original
  side by side, field states found/guessed/missing, code validation (dates must be real event dates, metres in
  range), corrections logged. **Nothing is ever confirmed automatically.**
- Payment reminders and cancellations are sent by a person.

## Consequences
The product is useful without AI; AI only removes typing.
