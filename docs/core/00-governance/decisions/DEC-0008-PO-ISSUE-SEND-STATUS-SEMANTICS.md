# Decision Record — PO Issue/Send Status Semantics

## Metadata

- Decision ID: `DEC-0008`
- Title: PO Issue/Send Status Semantics
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Purchasing + Finance + Operations
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Purchase Orders
- Related decision brief: OD-17 Purchase Order rejection status semantics

## Decision

Approval rejection remains PO document status `CANCELLED` for Phase I. Supplier issue/send uses the controlled transition `APPROVED -> ISSUED`; `SENT` is not a separate durable PO status in this slice.

## Context

PO issue/send creates the supplier-facing commitment boundary for receiving visibility, but it must not create inventory movements or receiving records. The current PO status list includes `cancelled` and `issued`, but not a PO-level `rejected` status. Existing approval records and audit events preserve the distinction between approval rejection and other cancellation reasons.

## Options considered

### Option A — selected

- Summary: Keep approval rejection as `CANCELLED`; proceed with `APPROVED -> ISSUED`.
- Benefits: Matches current source documents and schema, avoids unconfirmed status churn, and keeps rejection evidence available through approval/audit records.
- Failure modes: Reports may group approval rejection with operational cancellation unless they inspect approval/audit metadata.
- Why selected: It passes hard gates and unblocks the documented Phase I issue/send workflow.

### Option B — rejected

- Summary: Add a PO-level `REJECTED` status before issue/send.
- Benefits: Clearer status filtering.
- Failure modes: Schema, workflow, UI, export, report, and migration changes without confirmed business policy.
- Why rejected: The current PO source documents do not define `REJECTED` as a PO status.

### Option C — rejected

- Summary: Keep OD-17 open and defer issue/send.
- Benefits: Avoids policy risk.
- Failure modes: Blocks Phase I PO progress despite documented support for issued POs.
- Why rejected: The ambiguity is manageable with explicit reporting/audit safeguards.

## Hard-gate assessment

- Tenant/company/location scope must be enforced on issue/send.
- Issue/send requires explicit `purchasing.purchase_order.issue` permission.
- Only `APPROVED` POs can transition to `ISSUED`.
- Re-send keeps status `ISSUED` and records a new audit event.
- Issue/send creates no receiving record and no inventory ledger movement.
- Approval rejection remains auditable through approval instance, step, and `purchase_order.rejected` audit events.

## Required safeguards

- Block issue/send from `DRAFT`, `PENDING_APPROVAL`, and `CANCELLED`.
- Require communication method for issue/send audit evidence.
- Record issuer, timestamp, method, recipient/reference, remarks, and before/after status in audit metadata.
- Reports and exports that need rejection/cancellation distinction must derive subtype from approval/audit metadata, not PO status alone.
- Receiving must be based on `ISSUED` or later supplier-facing states, not `APPROVED`.

## Implementation and documentation impact

- Code / architecture: Add explicit issue/send service action and server-side authorization.
- Data / schema: Add `ISSUED` to the current PO status check constraint.
- Workflow / permissions: Add `purchasing.purchase_order.issue`.
- UI / mobile: Show issue/send action only for approved POs and re-send action only for issued POs.
- Reporting: PO exports include issued status; cancellation subtype remains audit-derived.
- Knowledge base / training: Update PO status article and release note.
- Tests / UAT: Cover allowed and blocked transitions plus CSV/status filter behavior.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Add richer communication/attachment log for supplier copies | Purchasing + IT | Before automated email/supplier portal | Open |
| Confirm whether reports need a first-class cancellation subtype field | Finance + Operations | Before PO cancellation reporting | Open |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/purchasing-workflow.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- OD-17 deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
