# DEC-0031 - Project Record Links Operational Adapters

## Status

Accepted for implementation.

## Context

`DEC-0030` introduced project record links for purchase requests, purchase
orders, goods receipts, inventory transfers, and suppliers. Phase 1.5 also needs
project tasks to coordinate follow-up against inventory ledger movements,
approval instances, wastage reports, and stock adjustments while preserving the
source-of-truth boundary.

## Decision

Extend `ProjectRecordLinkService` with read-only safe-summary adapters for:

- `INVENTORY_MOVEMENT`
- `APPROVAL_INSTANCE`
- `WASTAGE_REPORT`
- `STOCK_ADJUSTMENT`

The link table still stores only source type and source ID. It does not store
amounts, quantities, approval remarks, evidence references, line payloads, or
source status snapshots. Summaries are resolved at read time and are redacted
when the user lacks current permission or current location scope.

## Required Safeguards

- Link creation requires project mutation access and current source read access.
- Link reads re-check source permission and scope every time.
- Inventory movement links require ledger-view permission and active source
  location scope.
- Approval instance links require approval access and expose only document type,
  current status, and creation date.
- Wastage report links require wastage access and current inventory-location
  scope.
- Stock adjustment links require stock-adjustment access and current
  inventory-location scope.
- Project task status transitions, completion, blocking, cancellation, and link
  archival must never mutate linked operational records.

## Migration Notes

Use an additive migration that replaces the existing `ProjectRecordLink`
source-type check constraint with the expanded set. No source-module table is
modified and no historical project links are rewritten.

## Tests

- Redacted summaries must not include source IDs, status, scope labels, dates,
  hrefs, quantities, values, evidence, remarks, or attachments.
- Link service must not import operational mutation services.
- Migration check constraint must include the expanded accepted source types.

## Implementation Evidence

- `apps/web/src/server/services/projectRecordLinks.ts` resolves operational source summaries at read time and `assertSafeSourceSummary` blocks restricted summaries from exposing source IDs, status, scope labels, primary dates, or hrefs.
- `apps/web/src/server/services/projectRecordLinks.test.ts` verifies redaction guards, no operational mutation imports, approval visibility checks, denied-link audit events, payload-free link schema, and migration source-type constraints.
- `apps/web/src/server/services/reports.test.ts` verifies project exports remain scoped and do not export source payloads or sensitive task details.
