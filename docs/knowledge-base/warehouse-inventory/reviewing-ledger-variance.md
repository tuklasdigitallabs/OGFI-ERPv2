# Reviewing Ledger Variance

**Audience / required role:** Inventory control, warehouse management, auditors, or authorized support users with both stock-balance view and inventory-ledger view access  
**Applies to:** Current selected company and location  
**Related phase/module:** Phase I / Inventory  
**Last verified against:** `DEC-0070` and the implemented `ledger-variance-v1` diagnostic profile

## Purpose

Use Ledger Variance to investigate a difference between the cached on-hand balance and the total of immutable inventory movements for the same storage location, item, lot, and expiry key. This is a read-only diagnostic; it does not correct stock.

## Before you begin

- Your role must include both `inventory.balance.view` and `inventory.ledger.view`.
- Select the company and location you intend to investigate in the ERP header.
- Treat a red `UNTRUSTED / NOT FOR OPERATIONAL DECISION` notice as a data-quality warning. The diagnostic evidence remains visible for investigation, but the dashboard value is not decision-ready.

## Steps

1. Open `Overview` and select `Ledger Variance`, or open its current source-health warning when the trust gate blocks the numeric card.
2. Confirm the company, location, generated time, and trust notice.
3. Search by item code, item name, storage location, or lot when needed. Search only narrows the fixed variance population.
4. Compare `Cached`, `Ledger`, and the signed `Variance`. The formula is cached balance minus ledger total, rounded to six decimals.
5. Select `View ledger trace` to inspect the exact immutable movements for that item, storage location, lot, and expiry key. The trace shows 50 movements per page and states the displayed range and total.
6. Return to reconciliation and continue the investigation or export the scoped diagnostic CSV when evidence is required.

## Important controls

- Do not edit a database balance or create a Stock Adjustment merely to make the diagnostic difference disappear.
- First verify source documents, reversals, lot/expiry identity, and movement history.
- If the ledger is correct but the cache differs, escalate it as a system or data-integrity incident through the approved support route.
- If a source transaction is genuinely wrong, use its separately authorized receiving, transfer, wastage, count, adjustment, or reversal workflow with the required reason, evidence, approval, segregation, and audit history.
- The dashboard link, diagnostic page, export, and ledger trace recheck current permission and selected scope. A copied URL does not grant access.

## Expected and exception states

- `No ledger variances` means no non-zero cache-to-ledger differences were found in the current selected location at the generated time.
- `No matching variance rows` means the search did not match the current variance population.
- A `Resolved / stale trace` warning means the exact key is no longer a current non-zero variance. Historical movements remain available for context; return to reconciliation for the current population.
- An invalid or retired profile never falls back to the ordinary Stock Balances register.

## Related articles

- Viewing Stock Balances
- Viewing Inventory Ledger
- Understanding Stock Adjustments
- Running Stock Counts
