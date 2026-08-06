# Bounded inventory exports (local implementation)

## What changed

Inventory reconciliation, ordinary Stock Balances, Inventory Ledger, Receiving, Transfers, Stock Counts, Wastage, and Stock Adjustments CSV exports now honor the configured synchronous export row ceiling. If the selected scope exceeds that ceiling, the export fails with a clear “export too large” response and produces no partial file. Ledger exports use immutable movement-row grain rather than the UI list’s display bound; Wastage and Stock Adjustments use document-summary grain, while Receiving, Transfers, and Stock Counts preserve their emitted row grains.

Purchase Request, Purchase Order, and Supplier Quote exports now use the same configured cap and safe overflow behavior. Purchase Request/Order export audits retain only aggregate filter-presence metadata and safe error codes.

Export audit metadata records the report cap and whether a search filter was applied; raw search text is not persisted in the audit event.

## Operational note

Narrow the selected location, search, status, or date filters and retry. The pilot and Phase I remain **NO-GO** until the remaining operational export families, disposable PostgreSQL evidence, production-authenticated browser checks, recovery controls, and UAT are complete.

## Local verification

On August 2, 2026, an authenticated Chromium check returned successful bounded CSV responses for Stock Balances, Inventory Ledger, Reconciliation, Receiving, Transfers, Stock Counts, Wastage, Stock Adjustments, Purchase Requests, Purchase Orders, and Supplier Quotes (**1/1 browser test, 5.2s**). This is local evidence only and does not replace production-authenticated or human-UAT validation.

The same local run verified the mobile procurement workspace surfaces (**1/1 visible-surface test, 7.6s**): Purchase Requests, Purchase Orders, and Supplier Quotes expose their scoped actions, export controls, and approved-sourcing/read-only guidance without horizontal overflow.

On August 2, 2026, the local Chromium and Pixel 7 browser gate was rerun against the isolated PostgreSQL 17 stack. Inventory Control (wastage, Stock Adjustments, Stock Counts, and ledger-variance reconciliation), Receiving (register and draft/no-posting state), and Transfer receive/reversal checks passed **14/14** in 3.7 minutes. This confirms the visible and transfer custody surfaces on the local candidate only; it is not production-authenticated or human-UAT evidence.

The paired procurement/export browser gate was also rerun locally across Chromium and Pixel 7: **4/4 passed in 2.3 minutes**. It exercised all eleven bounded CSV routes and the Purchase Request, Purchase Order, and Supplier Quote workspace surfaces on desktop and mobile. This remains local candidate evidence only.
