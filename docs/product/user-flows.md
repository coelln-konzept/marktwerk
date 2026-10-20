# User flows

Mermaid diagrams render on GitHub and in most Markdown viewers. Phase markers: **P1** MVP,
**P2** bookings & inbox, **P3** market day & map.

## 1. Market lifecycle (P1)

```mermaid
stateDiagram-v2
    [*] --> draft: create / generate from series
    draft --> planned: dates, team & templates confirmed
    planned --> confirmed: required permits granted
    confirmed --> live: market day starts (field mode)
    live --> completed: day close-out done + post tasks finished
    planned --> cancelled
    confirmed --> cancelled
    completed --> [*]
    cancelled --> [*]
```

## 2. From blueprint to tasks (P1)

```mermaid
flowchart TD
    V[Venue<br/>zones, access, permit requirements] --> S[Market series<br/>RRULE, default team, templates]
    T[Checklist template<br/>published version n] --> S
    S -->|"pick dates → preview → generate"| M[Market instances]
    M --> A[Anchors<br/>market day, setup day, booking close…]
    M --> D[Duty assignment<br/>Marktleitung → Jonas, Aufbau → Dieter]
    A & D & T --> I{{instantiateMarket<br/>single service path}}
    I --> K[Checklists + tasks<br/>due dates resolved, assignees set]
    I --> P[Per-market permits<br/>apply-by date + prep tasks]
    K --> N[Grouped 'assigned' notification<br/>per person]
```

## 3. Moving a market date (P1)

```mermaid
sequenceDiagram
    actor M as Manager
    participant App as marktwerk
    participant DB as Database
    participant W as Worker
    M->>App: change market date 08.11 → 15.11
    App->>DB: find open, non-overridden tasks on this anchor
    App-->>M: preview "14 tasks +7 days · 2 overridden stay · 1 permit apply-by moves"
    M->>App: confirm
    App->>DB: tx: update anchor, recompute due_at/apply_by, audit
    App->>DB: one grouped 'dates_shifted' notification per assignee (no push)
    W->>DB: next sweep: old reminders don't fire (dedupe key contains due_at), new ones arm
```

## 4. Template change propagation (P1)

```mermaid
flowchart LR
    E[Edit template] --> DR[Draft version n+1]
    DR --> PUB[Publish]
    PUB --> Q{Apply to markets?}
    Q -->|none| END[Only new markets use n+1]
    Q -->|all future / selected| PV[Preview per market<br/>+3 added · 2 changed · 1 removed]
    PV --> AP[Apply with merge rules<br/>done tasks, comments, evidence untouched]
    AP --> LOG[Migration log on each market]
    MK[Market with custom tasks] -->|"update template from this market"| DR
```

## 5. Task lifecycle (P1)

```mermaid
stateDiagram-v2
    [*] --> todo
    todo --> in_progress
    todo --> blocked: dependency open
    blocked --> todo: blocker done (notify assignee)
    in_progress --> waiting_external: waiting for authority/supplier
    waiting_external --> in_progress
    in_progress --> done: evidence complete
    in_progress --> pending_approval: needs approval
    pending_approval --> done: approved
    pending_approval --> in_progress: rejected (with reason)
    todo --> skipped: not applicable (reason)
    todo --> cancelled: removed from template / market cancelled
    done --> [*]
```
(`pending_approval` is stored as `status = done` + `approval_status = pending`.)

## 6. Deadline sweep & escalation (P1)

```mermaid
flowchart TD
    C[Worker every 15 min] --> Q[Open tasks & permits with deadlines]
    Q --> S{dueState}
    S -->|none| X[skip]
    S -->|due soon 7/3/1 d| R[Reminder → assignee<br/>or all holders of duty role]
    S -->|overdue| O[Overdue → assignee]
    O --> E1{"+1 day still open?"}
    E1 -->|yes| E2[Escalate → managers]
    E2 --> E3{"+3 days?"}
    E3 -->|yes| B[Shown red on boss view]
    R & O & E2 --> DK[(notification<br/>unique dedupe_key)]
    DK --> DG[07:00 daily digest email]
```

## 7. Permit lifecycle (P1)

```mermaid
stateDiagram-v2
    [*] --> not_started: generated from venue requirement
    not_started --> preparing: prep tasks started
    preparing --> applied: submitted to authority
    applied --> granted
    applied --> rejected
    rejected --> preparing: resubmit
    granted --> superseded: renewed (new version links to old)
    not_started --> not_required
    granted --> [*]
    note right of granted
      expiring / expired are derived from valid_until
      conditions (Auflagen) → tasks
    end note
```

## 8. Booking pipeline (P2)

```mermaid
flowchart TD
    F[Public booking form] --> IN[booking: submitted]
    EM[Email in shared inbox] -->|convert to booking| INQ[booking: inquiry]
    PH[Phone / walk-in] --> INQ
    INQ --> IN
    IN --> RV{Review<br/>caps · documents · history}
    RV -->|missing info| NI[needs_info → vendor fixes]
    NI --> RV
    RV -->|over cap / full| WL[waitlisted]
    RV -->|no| DC[declined + reason]
    RV -->|yes| AP[approved]
    AP --> PL[Placement: proposed → held → assigned<br/>row + metre interval]
    PL --> INV[Invoice draft → released<br/>GiroCode + reference]
    INV -->|payment matched (CAMT)| PD[paid]
    INV -->|overdue| DUN[reminder → release hold]
    PD --> AR[Arrival info mail T-3]
    AR --> DAY[Market day: checked_in / no_show]
```

## 9. Email triage (P2)

```mermaid
sequenceDiagram
    participant EX as Exchange Online<br/>(shared mailbox)
    participant API as marktwerk webhook
    participant W as Worker
    participant UI as Triage view
    EX->>API: change notification (new message)
    API->>W: enqueue mailbox-sync
    W->>EX: delta query → fetch message
    W->>W: thread by conversationId, match sender → vendor
    W->>UI: new open thread (assigned by rule / inbox duty)
    UI->>UI: staff reads, writes internal note @Anna
    UI->>W: "convert to booking draft" (prefilled) or "create task"
    UI->>EX: reply via Graph sendMail (as shared mailbox)
    EX->>API: vendor replies → thread reopens
```

## 10. Market day in the field (P3)

```mermaid
flowchart TD
    O[Open field app the evening before] --> C[Day sheet + stall list + checklist cached offline]
    C --> A[05:30 set-up checklist<br/>photo: fire lane clear]
    A --> G[06:00 vendor arrival: search / QR → check in]
    G --> NS{07:30 no-show?}
    NS -->|yes| RL[Release stall → walk-up]
    RL --> WU[Walk-up registration + payment<br/>method depends on M10 decision]
    G --> L[Live: incidents log, Ordnungsamt visit]
    L --> T[Teardown checklist + cleaning photos]
    T --> CL[Day close-out: attendance explicit, cash/card totals]
    CL --> SY[Sync when online → post-event tasks start]
```
