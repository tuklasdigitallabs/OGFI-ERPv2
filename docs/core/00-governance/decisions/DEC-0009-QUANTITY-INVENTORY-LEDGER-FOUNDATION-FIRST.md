# Decision Record — Quantity Inventory Ledger Foundation First

## Metadata

- Decision ID: `DEC-0009`
- Title: Quantity Inventory Ledger Foundation First
- Status: `Confirmed`
- Date: 2026-06-29
- Decision owner: Operations + Warehouse + Purchasing + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Inventory Ledger, Receiving
- Related decision brief: Receiving foundation sequence after PO issue/send

## Decision

Implement the Phase I inventory foundation as a quantity-only immutable movement ledger and reconcilable balance cache before implementing Receiving Report posting. Receiving capture and posting must be driven by this ledger contract and must not update stock or PO received quantities without source-linked movement posting.

## Context

PO issue/send now creates the supplier-facing `ISSUED` state. Receiving is the next operational step, but the current schema has no receiving or inventory ledger tables. Source documents require accepted received quantities to stock in only through immutable inventory movements, with balances used as a cache that reconciles to posted movements.

Open valuation, cutover, landed-cost, and finance posting decisions remain unresolved. They do not block a quantity-only operational ledger, but they do block authoritative valuation or accounting behavior.

## Options considered

### Option A — rejected

- Summary: Implement full receiving, ledger, balance, posting, PO updates, and reversal in one slice.
- Benefits: Faster end-to-end workflow if perfectly implemented.
- Failure modes: Too much blast radius; weak reversal/idempotency risks could become production behavior.
- Why rejected: It combines multiple inventory-critical controls in one change.

### Option B — rejected

- Summary: Implement draft Receiving Report capture first and block posting.
- Benefits: Gives users a visible receiving surface quickly.
- Failure modes: Creates an operational dead end and risks designing receipt tables before ledger invariants are proven.
- Why rejected: It is acceptable only as a fallback; the ledger is the non-negotiable control for stock effects.

### Option C — selected

- Summary: Implement quantity-only `InventoryMovement`, `InventoryBalance`, and inventory location foundation first; implement receiving capture/posting next.
- Benefits: Establishes the source of truth, idempotency, balance reconciliation, and source-document contract before stock-affecting receiving.
- Failure modes: Could overbuild into valuation/accounting or become too generic if not receiving-driven.
- Why selected: It best preserves inventory integrity and still moves Phase I forward.

### Option D — rejected

- Summary: Defer receiving and inventory foundation pending human confirmation.
- Benefits: Avoids policy risk.
- Failure modes: Delays required Phase I controls.
- Why rejected: Quantity movements can proceed without deciding valuation, GL, or opening-balance policy.

## Hard-gate assessment

- No stock balance may change without an immutable movement.
- Balance cache updates must happen in the same transaction as movement insertion.
- Posted movements are append-only; reversal uses linked opposite movements.
- Ledger stores tenant, company, inventory location, item, UOM, source document, source line, and source event key.
- Idempotency/source-event uniqueness prevents duplicate movement posting.
- Cost/value fields are non-authoritative or nullable until valuation policy is confirmed.

## Required safeguards

- Keep this slice quantity-only.
- Do not implement financial valuation, GL posting, landed cost, or opening-balance cutover.
- Add reconciliation tests for movement totals versus balance cache.
- Receiving posting remains blocked until it can create movements, update balances, update PO quantities/status, and audit in one transaction.
- Receiving must start from `ISSUED` PO or later supplier-facing states, not `APPROVED`.

## Implementation and documentation impact

- Code / architecture: Add inventory ledger schema and service helpers.
- Data / schema: Add inventory locations, immutable movements, and balance cache.
- Workflow / permissions: No new stock-posting permission is granted by this decision.
- UI / mobile: No receiving posting UI until the posting service is complete.
- Reporting: Future reports reconcile balances to movement sums.
- Knowledge base / training: Receiving docs remain clear that stock-in is not available until ledger-backed posting is implemented.
- Tests / UAT: Validate idempotent movement posting and balance reconciliation.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement Receiving Report capture and posting from `ISSUED` POs using the ledger contract | Parent implementation | After ledger foundation validates | Complete |
| Confirm valuation/costing/opening-balance policy | Finance + Operations | Before production inventory valuation | Open |
| Implement reversal workflow for posted receipts and movements | Warehouse + IT | Before enabling correction UI | Partial - posted goods-receipt reversal is implemented by `DEC-0024`; broader movement reversal policy remains workflow-specific |

## Evidence

- `docs/phases/phase-01-procurement-inventory/workflows/inventory-workflow.md`
- `docs/phases/phase-01-procurement-inventory/workflows/receiving-transfer-workflow.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- DEC-0008 PO issue/send decision.
- DEC-0009 first-round and challenge deliberation by Dalisay, Hiraya, Ligaya, and Lualhati.
- `DEC-0024` goods-receipt reversal and `DEC-0025` transfer receipt-event reversal decisions.
