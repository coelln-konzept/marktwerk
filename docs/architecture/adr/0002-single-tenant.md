# 0002: Single company, no multi-tenancy

**Status:** accepted (2026-10-20, product owner decision)

## Context
marktwerk is built for one flea-market company. Turning it into a SaaS was considered and rejected for now.

## Decision
No `organization_id` columns, no tenant isolation, one `settings` row for company data.

## Consequences
- Simpler schema, queries and permissions.
- Becoming a SaaS later would mean adding a tenant column to every business table plus
  row-level isolation. That's a significant but mechanical refactor. Keep data access in services
  (never ad-hoc queries in components) so the change has few touch points.
