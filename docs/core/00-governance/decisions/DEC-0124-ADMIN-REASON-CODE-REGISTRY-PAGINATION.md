# DEC-0124 — Administration Reason-Code Registry Pagination

## Metadata

- Decision ID: `DEC-0124`
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Core Administration / Master Data
- Decision Chair: Parent agent
- Related phase/module: Phase I — Master Data and Administration

## Decision

Reason Codes use a server-owned selected-company page contract with bounded query, workflow/status filters, exact counts, deterministic ordering, and a scoped selected-record read-only detail surface. Existing create and active-to-inactive deactivation remain the only lifecycle mutations; edit, reactivation, deletion, import, and bulk actions remain deferred.

## Context and safeguards

The prior route loaded every company code and filtered in the browser, leaking extra scoped records into the client and failing the operational pagination rule. The new service requires Core Administration plus selected-company `MANAGE` before any reason-code count or row query, and every query carries signed tenant/company context. Inactive codes remain available for historical references but are excluded by active operational dropdown lookups.

The page preserves URL filters and page bounds, reports filter-scoped KPIs, provides exact workflow counts and pagination, and offers a selected-record detail surface with the existing reason-required deactivation action. No new lifecycle policy is invented.

## Evidence

- `apps/web/src/server/services/operationalReasonCodes.ts`
- `apps/web/src/app/(app)/admin/reason-codes/page.tsx`
- `apps/web/src/server/services/operationalReasonCodes.test.ts`
- `docs/phases/phase-01-procurement-inventory/specs/master-data-ui-spec.md`
- Independent product and architecture reviews; GPT-5.6 fallback subagents used because Code Spark and GPT-5.4 were unavailable.
