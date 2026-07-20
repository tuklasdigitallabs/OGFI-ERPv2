# OGFI ERP — Phase II Workflow: Menu Costing

**Status:** Implemented for recipe/menu costing visibility and controlled menu-price decisions
**Purpose:** Calculate latest ingredient cost, plate cost, target food cost and margin impact.

## Business Outcome

Define a controlled, role-aware, auditable workflow that follows OGFI core scope, approvals, audit, notification, security and Modern SaaS design standards.

## Primary Roles

- Requester / operational user
- Responsible manager or department owner
- Required approver(s)
- Finance / compliance / quality reviewer where applicable
- Administrator or auditor with read-only oversight

## Current Implementation Boundary

Menu costing views may:

- calculate plate cost from selected recipe versions, ingredient lines, supplier price history, and UOM conversion evidence;
- show target food-cost percentage, estimated serving cost, estimated selling-price basis, and margin context;
- expose missing supplier price or UOM conversion evidence as pending cost instead of assuming equivalence;
- create and progress separate menu-price decision records;
- apply an approved menu-price decision by inserting a new effective-dated `MenuPrice` row.

Menu costing views must not:

- edit published recipe versions in place;
- automatically change menu prices when recipe cost changes;
- post inventory, finance, POS sales, wastage, or approval-source records;
- allocate actual inventory cost to menu items by assumption.

## Controlled Menu-Price Lifecycle

```text
Draft → Submitted → Under Review → Approved → Applied
                    ↘ Returned / Rejected / Cancelled
```

## Non-Negotiable Controls

- No user may act outside assigned scope.
- Important actions require a timestamped audit event.
- Approval, financial, compliance or inventory-impacting actions must not be silently overwritten.
- Free-text comments do not replace structured fields, reason codes or evidence where those are required.
- Core document and security rules override this framework if a conflict exists.

## Open Decisions

`II-008` is confirmed by `DEC-0035`. Future recursive sub-recipe cost flattening, POS integration, and bulk maintenance must be recorded as new approved decisions before implementation.
