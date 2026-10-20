# 0009: Cash handling on market day (KassenSichV)

**Status:** open. **Decide with the client's Steuerberater before M10.**

## Context
The client collects cash from walk-up vendors on market day. Research 01: an *open cash box*
(offene Ladenkasse) with a daily count report needs no TSE. But **as soon as an app records individual
cash sales, it counts as an electronic record-keeping system** (§146a AO): TSE signing, a receipt
obligation (e-receipt allowed), and ELSTER registration of the system.

## Options
- **A. Cloud TSE** (e.g. fiskaly SIGN DE): the app records each cash sale, signs it, issues an e-receipt;
  register via ELSTER. Most complete; per-device costs; more build effort.
- **B. Card on site via SumUp** (Cloud API push to the reader; SumUp handles its own fiscal duties) +
  cash stays in an open cash box: the app records only *totals* in a guided daily Kassenbericht, not
  individual sales.
- **C. Hybrid**: B now, A later if volume justifies it.

## Questions for the tax advisor
1. Does collecting stall fees (VAT-exempt rental, §4 Nr. 12 UStG) in cash fall under §146a at all when recorded in an app?
2. Is a daily Kassenbericht in the app (totals only) acceptable as an open cash box?
3. Receipt requirements for walk-up vendors?
