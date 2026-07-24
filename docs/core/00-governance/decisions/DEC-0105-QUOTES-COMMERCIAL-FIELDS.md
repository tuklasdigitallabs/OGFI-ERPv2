# DEC-0105 — Supplier Quote Commercial Components

## Metadata

- Decision ID: `DEC-0105`
- Title: Additive Decimal quote commercial components and supplier snapshots
- Status: Confirmed for implementation; binary attachment activation remains separate
- Date: 2026-07-24
- Decision owner: Procurement / Quotations workstream
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Quotations

## Decision

Persist `subtotalAmount`, `taxAmount`, `discountAmount`, `freightAmount`, `otherChargesAmount`, and `supplierAccreditationSnapshot` on `SupplierQuotation`. The server calculates `totalAmount = subtotal + tax + freight + other charges - discount` to six decimal places in the company quote currency and rejects negative totals. Existing rows are backfilled losslessly with subtotal equal to the existing total and zero other components.

## Rationale and alternatives

- Selected: additive Decimal columns with a transaction-time server calculation. This satisfies the documented comparison fields without changing existing quote identity or line facts.
- Rejected: deriving charges from free-text terms because comparison, recommendation, export, and PO lineage would remain non-deterministic.
- Rejected: silently treating missing historical charges as unknown or zero without a documented backfill; the migration records the explicit legacy interpretation.
- Deferred: binary quote attachment upload/linking. The controlled-evidence policy and purchasing workflow currently disagree on whether quote evidence is mandatory, so no attachment authority is invented by this slice.

## Hard-gate assessment

- All commercial inputs are validated at the server boundary as finite, nonnegative six-decimal values; the computed total cannot be negative.
- Existing company currency remains the quote currency; no exchange-rate conversion is introduced.
- Quote create remains tenant/company/location and actor scoped, idempotent, audited, and non-PO/non-inventory-mutating.
- Recommendation evaluation continues to use the persisted computed total, and submission revalidates current quote policy before approval routing.
- The selected comparison surface displays the persisted components and clearly labels attachments as unavailable.

## Required safeguards and tests

- Execute disposable PostgreSQL migration/backfill and concurrent quote-create/recommendation cases.
- Verify Decimal arithmetic, rounding, zero-default legacy rows, negative-total rejection, export parity, and cross-company/location denial.
- Resolve the attachment requirement matrix before adding controlled evidence links or declaring Quotes production-ready.

## Evidence

Independent review identified the documented workflow requirement for tax/discount/freight/other charges and the attachment-policy conflict. Requested Code Spark/GPT-5.4 models were unavailable; the closest permitted fallback was used and hard gates were not waived.
