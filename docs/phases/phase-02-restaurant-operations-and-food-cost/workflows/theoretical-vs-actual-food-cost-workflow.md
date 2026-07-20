# OGFI ERP — Phase II Workflow: Theoretical vs Actual Food Cost

**Status:** Implemented for read/report/export analysis from posted sales import and inventory-ledger evidence
**Purpose:** Compare sales-driven theoretical ingredient usage to actual inventory consumption.

## Business Outcome

Define a controlled, role-aware, auditable workflow that follows OGFI core scope, approvals, audit, notification, security and Modern SaaS design standards.

## Primary Roles

- Requester / operational user
- Responsible manager or department owner
- Required approver(s)
- Finance / compliance / quality reviewer where applicable
- Administrator or auditor with read-only oversight

## Current Implementation Boundary

Theoretical-vs-actual food-cost views may:

- read posted restaurant sales import batches and lines for the selected company, brand, location, and business date;
- derive theoretical cost from linked menu items and published recipe/menu-cost basis;
- summarize actual cost from posted outbound inventory-ledger evidence only;
- show row health counts for within-target, above-target, missing-cost, and awaiting-actuals rows;
- preserve selected filters in drilldowns and CSV exports.

Theoretical-vs-actual views must not:

- import or mutate POS/sales records in the current slice;
- post or reverse inventory movements;
- allocate branch-level actual cost to menu items without a controlled production or consumption source;
- approve, close, or mutate recipe, menu-price, finance, purchasing, or inventory source records.

## Non-Negotiable Controls

- No user may act outside assigned scope.
- Important actions require a timestamped audit event.
- Approval, financial, compliance or inventory-impacting actions must not be silently overwritten.
- Free-text comments do not replace structured fields, reason codes or evidence where those are required.
- Core document and security rules override this framework if a conflict exists.

## Open Decisions

POS import write workflow, production/consumption source records, and menu-level actual allocation remain governed by `II-004` and any future approved decision records.
