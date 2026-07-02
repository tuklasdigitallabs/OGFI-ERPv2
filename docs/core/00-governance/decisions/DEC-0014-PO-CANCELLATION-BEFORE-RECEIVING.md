# Decision Record — PO Cancellation Before Receiving

## Metadata

- Decision ID: `DEC-0014`
- Title: PO Cancellation Before Receiving
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Purchasing + Operations + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Purchase Orders

## Decision

Implement Purchase Order cancellation only before receiving has started.

Scoped `DRAFT`, `APPROVED`, and `ISSUED` POs may move to `CANCELLED` when no Receiving Report exists and every PO line has zero received quantity. Cancellation requires a reason. An issued PO also requires supplier cancellation notice evidence or an explanation that the notice is unavailable.

Cancellation sets each PO line's cancelled quantity to the remaining ordered quantity, writes an audit event, removes the PO from receiving eligibility through status, and creates no inventory movement or balance update.

## Context

Phase I needs a controlled way to stop an unneeded PO without deleting supplier commitment history. Full amendment, balance closure after partial receipt, and approval-driven cancellation policies remain broader workflow decisions because they affect supplier commitments, receiving math, approval snapshots, reporting, and inventory controls.

## Options considered

### Option A — selected

- Summary: Add pre-receiving PO cancellation only.
- Benefits: Closes the open-commitment gap while preserving inventory-ledger integrity and avoiding amendment/versioning complexity.
- Failure modes: Draft receipts could exist if not blocked; reports could treat operational cancellation and approval rejection identically if they ignore audit metadata.
- Why selected: It is the smallest safe PO control that does not mutate inventory or controlled receiving records.

### Option B — rejected for this slice

- Summary: Add amendment request records only.
- Why rejected: Creates new records without correcting PO commitments or preventing open receiving exposure.

### Option C — rejected for this slice

- Summary: Full amendment and re-issue workflow.
- Why rejected: Requires PO versioning, approval restart policy, supplier re-issue evidence, receiving interaction rules, and reporting changes.

### Option D — deferred

- Summary: Defer PO controls and continue visibility work.
- Why deferred: Leaves unreceived issued POs open in receiving and delivery-exposure views.

## Hard-gate assessment

- Cancellation is server-authorized by tenant, company, and current delivery location.
- Cancellation requires `purchasing.purchase_order.cancel`.
- Cancellation is blocked after any received quantity or any Receiving Report record exists.
- Receiving posting re-checks PO receivability inside its transaction.
- No inventory movement or balance row is created or changed by cancellation.
- Approval rejection and operational cancellation share PO status but remain distinguishable through audit event type and metadata.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Decide full PO amendment/versioning policy | Purchasing + Finance + IT | Before PO amendment workflow | Partial - bounded pre-receiving amendment is implemented by `DEC-0034`; full amendment/versioning remains deferred |
| Decide partial remaining-balance cancellation / close policy after receiving | Purchasing + Warehouse + Finance + IT | Before partial PO closure | Complete - see `DEC-0020` |
| Decide first-class cancellation subtype reporting field | Finance + Operations + IT | Before advanced PO cancellation reporting | Open |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/purchasing-workflow.md`
- `docs/phases/phase-01-procurement-inventory/workflows/receiving-transfer-workflow.md`
- `docs/core/02-controls/ERP_APPROVAL_MATRIX.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- Round 1 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- `DEC-0020` remaining-balance closure and `DEC-0034` bounded pre-receiving amendment decisions.
