# DEC-0030 — Project Record Links and Safe Summaries

## Status

Accepted for first implementation slice.

## Context

Phase 1.5 tasks may link to ERP records for coordination, but project tracker actions must not duplicate or mutate procurement, receiving, inventory, supplier, approval, finance, wastage, or adjustment records.

## Decision

Implement a central `ProjectRecordLink` table and `ProjectRecordLinkService`.

Initial source types:

- `PURCHASE_REQUEST`
- `PURCHASE_ORDER`
- `GOODS_RECEIPT`
- `INVENTORY_TRANSFER`
- `SUPPLIER`

The link row stores only tenant/company/project context, optional task/milestone context, source type, source ID, relation type, safe link label, and archive/audit fields. It stores no source payload snapshots.

Safe summaries are resolved at read time through source-specific adapters. If the project user cannot read the source record in the current source-module scope, the UI receives only `Restricted linked record`.

## Required Safeguards

- Link creation requires current project mutation access.
- Link creation also requires current source read access.
- Link reads re-check current project access and source access.
- Unauthorized source summaries do not expose source UUID, document number, supplier name, status, amount, quantity, location, attachments, approval remarks, or source href.
- Task completion/blocking/cancellation does not mutate linked source records.
- Link create/archive writes `ProjectActivityEvent` in the same transaction.
- Supplier summaries remain admin-only until a dedicated supplier view policy is approved.

## Migration Notes

Use additive migration `20260701043000_project_record_links_foundation`. It creates the link table, parent FKs, source-type check constraint, active-link partial uniqueness, and archive-field checks. No source module tables are modified.

## Follow-on Decision

`DEC-0031` expands the accepted source-link adapter set to inventory movements,
approval instances, wastage reports, and stock adjustments without changing the
link ownership model or allowing project actions to mutate those source records.

## Deferred

- Inventory balance adapters.
- Project-level and milestone-level UI surfaces.
- Source-link reports/exports.
- Attachment summaries or deep attachment access.
- Cross-location source-summary policy beyond the active ERP context.
