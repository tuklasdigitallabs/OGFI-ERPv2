# DEC-0176 — Administration Readiness Evidence Capture Parity

**Status:** Accepted  
**Date:** 2026-07-25  
**Decision Chair:** Parent implementation agent

## Decision

Deployment and Enablement Record Evidence workflows use the shared workspace
TaskSheet, matching UAT capture. All existing fields and server actions remain
unchanged. Hidden context fields preserve the active search, filters, page, and
page size through successful saves and validation errors; context is navigation
state only and is not trusted as authorization.

## Controls and validation

- Core Administration selected-company Manage authorization, UTC/value and
  required-field validation, reason/audit behavior, and no-direct-gate mutation
  remain in the create services.
- The sheets expose 44px controls and contained scrolling for mobile completion.
- Focused readiness tests, TypeScript, lint, production build, and diff checks
  are required. PostgreSQL authorization/query-plan, responsive browser,
  hosted recovery, and UAT execution remain external gates.
