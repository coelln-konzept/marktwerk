# 0003: Better Auth with fixed permission roles + duty roles

**Status:** accepted

## Context
5–20 internal users, later vendors via magic links. Auth.js is in maintenance mode and points new
projects to Better Auth. Supabase Auth would tie us to Supabase.

## Decision
- **Better Auth 1.7** with the Drizzle adapter, email + password, **sign-up disabled**; the admin plugin
  lets the owner create users, set roles and deactivate (ban) them.
- **Permission roles** are fixed: `owner | manager | staff | field`. Domain permissions are checked with
  `can()` from `@marktwerk/core`. Better Auth's own access control only guards user-management endpoints.
- **Duty roles** (Marktleitung, Aufbau…) are data, mapped per event. They drive task assignment, not permissions.
- Assignable people are **staff members**, who may have no login (ADR 0012). Staff without login use signed magic links.
- Vendors (Phase 4 portal) authenticate with magic links. They're stored separately from staff users or with a
  `vendor` role excluded from the back office (decide in Phase 4).

## Consequences
- Permission checks are explicit and testable. New modules extend the matrix in one file.
- 2FA/passkeys for the owner can be added through Better Auth plugins.
