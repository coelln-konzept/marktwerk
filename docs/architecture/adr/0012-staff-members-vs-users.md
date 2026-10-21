# 0012: Staff members are separate from login users

**Status:** accepted (2026-10-21)

## Context
Tasks, shifts and hours concern people who will never log in (WhatsApp-only Minijobbers). Better Auth's `user`
table should only hold accounts.

## Decision
`staff_member` is the assignable person (tasks, duty roles, shifts, contracts, notifications). A `user` (login
with permission role) optionally links 1:1 to a staff member. Assignees reference `staff_member`.
Field users (`role: field`) see only events where they have a shift or duty (decision 2026-10-21).

## Consequences
- Hours/Minijob logic works for everyone, logged in or not.
- Row-level scoping for `field` users is done in queries via shifts/duties.
