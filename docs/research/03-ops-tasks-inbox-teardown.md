# Research 03 — How task, checklist, compliance and shared-inbox tools work

*Teardown from help-centre content (search snippets; some points from background knowledge are
marked [K]). This feeds directly into Phase 1 (tasks, checklists, deadlines, permits) and the
Phase 2 inbox.*

## A. Relative-date templates

| Tool | How it works | Lesson |
|---|---|---|
| **Asana** templates | Dates relative to **one** anchor (project start *or* due). Placeholder **roles** mapped to people at creation. **No propagation**: edits only affect new projects; moving the start date does **not** shift tasks. Add-ons exist just to fix this. | Need several anchors, before *and* after; need recalculation on anchor change |
| **ClickUp** "remap dates" | Changing the parent date shifts subtasks; **closed subtasks not moved**; doesn't work when an automation applies the template | Never move done items; one code path for every way of instantiating |
| **monday.com** dependencies | Strict/Flexible cascades; users complain dates **move silently**, completed items shift | Preview + grouped notification, never silent |
| **Linear** recurring issues | Next instance created after due date passes; template edits don't touch existing ones. **Triage** queue with rotating responsibility | Triage pattern for our inbox |
| **Process Street** | Due dates relative to run start / form field / other task; conditional logic; **stop tasks**; approvals. **Only tool that propagates template changes to live runs**: draft → publish → "update runs to latest" with per-run choice + migration report | Our template versioning + "apply to markets" with preview |
| **Manifestly** | Step due relative to run start / previous step / run due / a date field (negative offsets OK); roles mapped **per run**; separate "step late" and "checklist late" alerts | Role mapping per market |
| **Paperless Pipeline** (real estate) | Tasks relative to **named trigger dates** on the record. **Changing a trigger date moves all dependent tasks**; unset trigger → task has no due date until set; business/calendar days; no holidays | Closest analogue to "market date": named anchors on a market |
| Event tools (Aisle Planner, Ungerboeck, Vantage) | Tasks due N days before/after event date | Standard in the event world; nobody does propagation well |

## B. Compliance, permits and field checklists

- **SafetyCulture:**
  - Templates: sections, repeat sections, response sets, flagged responses.
  - **Logic per answer:** require note / photo / action, notify, skip.
  - Published template changes **only apply to new inspections**.
  - Actions from flagged items get assignee, priority and due date (default from priority).
  - Schedules: Overdue / Late submit / Missed.
  - **Offline:** only inspections already on the device are editable; actions can be created
    offline; photo sync after offline use is a known weak spot.
  - Credentials: holder emailed at 90/30/0 days, and for a long time **managers got no alerts**
    (users complained).
- **Connecteam:** document expiry reminders at 30/7/1/0 days to the user; managers only see an
  indicator. Forms with mandatory photos and approve/reject.
- **Odoo documents_reminder:** multiple intervals; **overdue repeats and escalates to department head**;
  every reminder logged.
- **Status vocabularies:** Pending approval / Approved / Denied / Expiring / Expired; "Expiring" and
  "Expired" are *derived* flags.

## C. Shared inbox (Microsoft 365)

- **Front:**
  - M365 shared mailbox sync. Only inbound, sent and spam sync. **Assignment, status, tags and
    snooze live in Front, not Outlook.**
  - Collision detection + live shared drafts; internal comments.
  - **Links:** a conversation links to an external record, both ways. With Jira, the conversation
    reopens when the issue closes.
  - **Snooze:** an inbound reply cancels the snooze; shared vs personal snooze; "send & snooze".
  - **SLA:** time without outbound reply → tag / notify / reassign.
  - Round-robin and load-balanced assignment; templates with `{{variables}}`.
- **Missive:** full two-way O365 sync; Outlook folders ↔ labels; org-only labels drive rules.
- **Help Scout:** forwarding-based. M365 blocks external auto-forward by default, and mail then no
  longer lives in Outlook.
- **Hiver:** Outlook add-in. New Outlook's add-in support for shared mailboxes is incomplete → fragile.
- **Zammad:** Graph channel, but **delegated permissions only** → wrong-mailbox / 403 issues, and it
  breaks when the authorising employee leaves.
- **Platform facts:**
  - **EWS is being blocked in Exchange Online since 1 Oct 2026 and removed 1 Apr 2027** → Graph only.
  - Change notifications on shared mailboxes need **application permissions**.
  - **Exchange RBAC for Applications** limits an app to named mailboxes.
  - Subscriptions expire and must be renewed [K]; combine webhooks with periodic **delta** sync.

## D. Owner dashboards
- Health per item: On track / At risk / Off track / On hold + mandatory short text (Asana, Linear).
- Counts by health at top; distribution bars (monday Battery).
- **Staleness** signal (Linear grey icon when no update).
- Hand-set health drifts from reality (Asana complaints) → **compute health from data, allow an
  override with a reason.**

## Decisions this research drives (folded into data-model.md)

1. **Named anchor dates per market** (market day, setup day, booking close, custom) + signed offsets;
   unset anchor → no due date yet.
2. **Recalculate on anchor change** for open, non-overridden tasks only; preview + one grouped notification.
3. **Business days + German public holidays per Bundesland** optional per template item; "before"
   tasks roll earlier, "after" tasks roll later.
4. **Duty roles** (Marktleitung, Aufbau, Büro, Genehmigungen…) as template placeholders, mapped per
   market (defaults per series); unmapped role → visible "unassigned" queue, never dropped.
5. **Template versioning** draft → publish; **explicit "apply version N to markets"** with preview and
   merge rules; never touch done tasks, comments or evidence.
6. **Dependencies don't move dates**, only block status + notify next assignee.
7. **Evidence rules** per task (photo / note / attachment / checklist items) and **approval tasks**.
8. Task status includes **"waiting on external"** (e.g. authority), so the delay isn't blamed on staff.
9. Notifications: **one row per (user, subject)**, bumped on new activity; Done / Save / Snooze (wakes
   on activity) / Unfollow; daily 07:00 digest; owner weekly digest; **escalation ladder** (assignee
   → +1 d team lead → +3 d boss view), every step logged; no push for automated date shifts.
10. Permits: two clocks (**expiry** for standing permits, **lead time** for per-market permits);
    reminders go to the responsible person **and escalate**; renewal = new version linked to old
    (superseded); a market can't be green if a required permit isn't granted by T-X;
    **permit conditions (Auflagen) become tasks**.
11. Inbox (Phase 2): Graph app permissions scoped by RBAC for Applications; webhooks + delta;
    mail stays in Exchange; workflow state stays in marktwerk; triage queue with "inbox duty";
    Open / Waiting / Closed, reply reopens; links to vendor/market/booking/task; templates with
    variables (formal "Sie" by default); simple SLA.
