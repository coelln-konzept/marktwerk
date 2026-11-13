# UX audit

Repeated rounds of research → evaluation frameworks → simulated flows → ranked fixes.

- [Frameworks](frameworks/): F1 heuristic scorecard, F2 task efficiency & cognitive walkthrough, F3 robustness, accessibility & edge cases. Built from 17 research digests (NN/g, Baymard, W3C/WAI, GOV.UK and others; sources in each framework).
- [Round 1 (2026-11-13)](round-1.md): 30 flows, 353 raw findings → 72 findings, 19 fix batches, product decisions (also in [open-questions.md](../open-questions.md)).

How a round runs: a seeded copy of the app (own database) is driven with Playwright by one evaluator per flow, each applying all three frameworks; a synthesis step deduplicates, checks claims against the code, scores areas and groups fixes into batches that touch disjoint files.
