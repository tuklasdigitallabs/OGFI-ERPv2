# DEC-0223 — Core Administration Audit export date-ready state

## Metadata

- Decision ID: `DEC-0223`
- Title: Core Administration Audit export date-ready state
- Status: Confirmed
- Date: 2026-07-25
- Decision owner: Core Administration
- Decision Chair: Parent agent
- Related phase/module: Phase I — Administration / Audit Trail
- Related decision brief: Parent-led bounded UI hardening brief, 2026-07-25

## Decision

The Audit Trail export control remains a link only when the current From and To
filters are valid `YYYY-MM-DD` dates in non-reversed order. Otherwise it renders a
truthful disabled explanation, while the export route remains the authoritative
validator for policy span and authorization.

## Context

The page already states that Audit CSV export requires From and To dates, but it
previously exposed the link whenever export permission and entity-ID syntax were
valid. That made a predictable server validation error look like an available
action.

## Options considered

### Option A — selected: disabled explanation until the range is valid

- Benefits: aligns the visible action with the documented requirement, preserves
  server authority, and gives a clear recovery path.
- Failure mode: the configured maximum span is still enforced only by the route;
  the page cannot know it without adding a policy read.

### Option B — rejected: keep the link and rely on route errors

- Failure mode: advertises an action that predictably fails for missing or invalid
  dates and increases avoidable user friction.

### Option C — rejected: load export policy into the page and disable oversized ranges

- Failure mode: adds a policy read and coupling to a read-only control for a
  server-authoritative constraint without a documented need; it can be revisited
  if UAT shows a material usability problem.

## Hard-gate assessment

- Tenant/company and selected-company authorization remain unchanged and are
  enforced by the existing page and export route guards.
- No approval, inventory, money, schema, or audit-record mutation semantics
  changed. Export-start/completion/failure audit behavior remains authoritative.
- The route still rejects missing, malformed, reversed, and oversized ranges.
- The change is reversible by restoring the prior conditional link.

## Required safeguards

- Use the shared strict date-only parser and reject reversed ranges before linking.
- Preserve invalid-entity and unauthorized states without exposing export data.
- Keep route-level date-span, row-cap, scope, and authorization validation.
- Cover disabled and valid visible states plus route fail-closed cases in tests.

## Implementation and documentation impact

- Code/UI: `apps/web/src/app/(app)/admin/page.tsx` gates the link and explains the
  missing/invalid date state.
- Data/schema/workflow/permissions: unchanged.
- Source-of-truth/UI and enablement: Audit Trail guidance now describes the
  date-ready control state.
- Tests: Core Administration static contract coverage verifies the date-ready
  condition and reason text; existing route tests remain authoritative.

## Evidence

- Architecture review recommended this bounded slice with High confidence; the
  closest permitted GPT-5.6 fallback was used because requested Code Spark and
  GPT-5.4 models were unavailable.
- Local Core Administration contract coverage passes 45/45 and export-authorization
  coverage passes 25/25 after the shared visibility contract was updated; the full
  non-database web suite passes 1,338 tests with 301 skipped and one todo. Broader
  PostgreSQL, browser, hosted, and UAT gates remain open.
