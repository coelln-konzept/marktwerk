# User flows

Mermaid diagrams (render on GitHub). Phase markers: **P1** MVP, **P2** bookings inside, **P3** market day,
maps, communication, **P4** open up. Revised 2026-10-21 after the client meeting.

## 1. Event lifecycle (P1)

```mermaid
stateDiagram-v2
    [*] --> draft: create / generate from preset or agreement
    draft --> planned: announced (website "geplant"), permit pending
    planned --> confirmed: market permit granted
    confirmed --> live: event day
    live --> completed: event over, post tasks running
    completed --> closed: close-out (money, rentals, receipts, lessons)
    draft --> cancelled
    planned --> cancelled: permit refused / given up
    confirmed --> cancelled
    closed --> [*]
    note right of confirmed
      Booking flags are separate:
      booking_open · fully_booked · car_spaces_full
    end note
```

## 2. Creating an event: the logbook fills itself (P1)

```mermaid
flowchart TD
    P[Event preset<br/>type · location · texts · price · templates · team] -->|pick dates → preview| E[Events]
    A[Multi-year agreement<br/>fixed dates] --> E
    E --> AN[Anchors<br/>event day · setup · booking cut-off = Monday before]
    E --> T[Timeline tasks<br/>with estimates, duty roles → people]
    E --> L{Logbook check per permit requirement}
    L -->|valid permit held| OK[✔ ticked, linked to document]
    L -->|missing| NP[New permit · apply-by from lead time / window<br/>+ prep tasks, sorted by urgency]
    NP --> PAY[Fee → payable with instalments]
    T & NP --> B[Event board]
```

## 3. Kanban: assign by drag (P1); WhatsApp notification (P2, M7)

In Phase 1 the drop assigns the task and notifies office users in-app/by email; field crew tasks are
tracked by the office. The WhatsApp part below starts in Phase 2.

```mermaid
sequenceDiagram
    actor M as Office manager
    participant B as Event board
    participant S as marktwerk
    participant P as Office phone (WhatsApp)
    actor D as Dieter (field crew)
    M->>B: drag "Standrohr abholen" onto Dieter
    B->>S: assign (undo toast 10 s)
    S->>S: queue message (debounce 3 min, quiet hours)
    S-->>M: "1 Nachricht bereit · Per WhatsApp senden"
    M->>P: click → wa.me opens with text + Dieter's magic link
    P->>D: WhatsApp message
    D->>S: opens magic link → "Zusagen" / "Erledigt"
    S-->>B: card shows ✓ / moves to Erledigt
    Note over S: Step 2 (Cloud API): sent automatically,<br/>quick-reply buttons "Erledigt" / "Übernehme ich"
```

## 4. Moving an event date (P1)

```mermaid
sequenceDiagram
    actor M as Manager
    participant App as marktwerk
    M->>App: change date 01.05 → 08.05
    App-->>M: preview "14 tasks +7 d · 2 overridden stay · booking cut-off → Mo 03.05 · 1 permit apply-by moves"
    M->>App: confirm
    App->>App: tx: anchors, due dates, apply-by, audit
    App->>App: one grouped "dates shifted" message per person (no push)
```

## 5. Template change (P1): always deliberate

```mermaid
flowchart LR
    E[Edit template] --> DR[Draft version n+1]
    DR --> PUB[Publish]
    PUB --> NEW[New events use n+1]
    PUB -.->|optional, separate action| AP["Apply to events…"<br/>nothing pre-selected]
    AP --> PV[Preview per event]
    PV --> GO[Apply: done tasks, comments, evidence untouched]
    EV[Event with learned extra tasks] -->|"update template from this event"| DR
```

## 6. Deadlines, carry-over, escalation (P1)

```mermaid
flowchart TD
    C[Worker every 15 min] --> Q[Open tasks · permits · instalments · rentals · obligations · missing time records]
    Q --> S{due state}
    S -->|due soon| R[Reminder → responsible person<br/>office: in-app/email · field: WhatsApp]
    S -->|overdue| O[Overdue → responsible person]
    O --> E1{"+1 day still open?"}
    E1 -->|yes| MG[Escalate → office manager]
    N[Nightly 00:05] --> RO[Overdue tasks roll into 'Heute' ↻n]
    RO -->|n ≥ 3| MG
    R & O & MG --> DG[07:00 digest · dashboard 'Heute fällig']
```

## 7. Staff hours & Minijob month (P1)

```mermaid
flowchart TD
    SH[Shift planned per event<br/>suggested by role + remaining allowance] --> W[Event day]
    W --> T[Actual times entered<br/>by lead or via magic link]
    T -->|missing on day 5| AL[Reminder staff + manager<br/>legal deadline day 7 §17 MiLoG]
    T --> TP[Team page: hours, pay, remaining allowance,<br/>YTD, overrun months]
    note1[P1: office enters times · P2: staff via magic link]:::n
    classDef n fill:none,stroke-dasharray: 3 3
    TP -->|> €603 planned| AM[Amber: only if unforeseeable / annual avg OK]
    TP -->|> €1,206 or 3rd overrun| RD[Red: needs documented reason]
    TP --> MC[Month close ~10th: lock → approve]
    MC --> EX[CSV / DATEV LODAS export → payroll office by 15th]
```

## 8. Payables with instalments (P1)

```mermaid
flowchart LR
    S[Location fee €15,000] --> G[Instalment plan<br/>e.g. 6,000 + 6,000 + 3,000]
    G --> R1[Reminders 14 d · 3 d · due day → finance role]
    R1 --> PD{Paid?}
    PD -->|mark paid + receipt photo| AC[Actual cost on event P&L]
    PD -->|overdue| ES[Escalate → manager · top of 'Heute fällig']
    AC --> EXP[Monthly bundle → tax advisor]
```

## 9. Booking intake while the old website stays (P2)

```mermaid
flowchart TD
    W[Old website booking form] -->|system email / DB sync| IN[Intake]
    EM[Free-text email] --> TRI[Inbox triage]
    PH[Phone after Monday cut-off] --> QE[Phone entry screen]
    IN --> SPLIT[Split multi-date request<br/>→ one request per event]
    TRI -->|human converts · P4: AI draft, human confirms| SPLIT
    QE --> SPLIT
    SPLIT --> Q1[Event A queue] & Q2[Event B queue]
    Q1 --> AL[Drag onto slot · Autoplatz yes/no per date]
    AL --> CF[Confirmation email + Platzkarte<br/>states car space per date · invoice if requested]
    CF --> PC[Payment check session Mon/Wed/Fri]
    PC -->|matched| PAID[paid · optional 'Zahlung erhalten']
    PC -->|after deadline| RM[Reminder draft → a person sends]
    RM -->|still unpaid| CX[Cancel with notice]
```

## 10. Payment check session (P2)

```mermaid
sequenceDiagram
    actor O as Office
    participant App as marktwerk
    O->>App: upload bank export (CSV / CAMT.053)
    App->>App: match by reference → amount + name
    App-->>O: 23 suggested matches · 4 unclear · 2 partial
    O->>App: confirm batch, resolve unclear by search
    App-->>O: unpaid after deadline: 6 → reminder drafts
    O->>App: review & send (logged who/when)
```

## 11. Rentals & shortages (P2)

```mermaid
flowchart LR
    R[Event requirements<br/>from preset: 3 standpipes, 12 cables…] --> AV{Availability over<br/>setup→teardown, all events that weekend}
    AV -->|ok| PK[Packing list]
    AV -->|shortage| SO["Solve shortage → rent"]
    SO --> RT[Rental: supplier · return by · deposit · meter readings]
    RT --> RR[Return reminders → responsible + manager]
    RR --> RET[Returned · deposit back · cost on event P&L]
```

## 12. Market day in the field (P3)

```mermaid
flowchart TD
    O[Evening before: day sheet cached offline] --> A[Set-up checklist with photos]
    A --> G[Vendor arrival: check-in, Autoplatz as confirmed]
    G --> NS{No-show?} -->|yes| RL[Release stall → walk-up]
    G --> VT[Vendor talks → quick notes to CRM]
    G --> L[Incidents, authority visits]
    L --> T[Tear-down, returns, cleaning photos]
    T --> CL[Day close-out → shifts actual times]
```
