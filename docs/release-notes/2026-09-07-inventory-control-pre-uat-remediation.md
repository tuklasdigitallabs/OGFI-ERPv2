# Inventory controls strengthened before UAT

**Audience:** Branch and warehouse teams, inventory custodians, Purchasing, Operations, Finance/Accounting, reviewers, and administrators.  
**Status:** Current local-build changes under DEC-0282. This is not operational UAT admission or a deployment approval.

## What changed

- Blind-count protection now also restricts quantity inquiries, exports, count-derived adjustment details, audit information, and linked-record previews. An unavailable view does not mean zero stock. Continue assigned work in Stock Counts; independent reviewers remain subject to current eligibility checks.
- Supplier receipts require delivered quantity to equal accepted + rejected + damaged. Short quantity cannot account for delivered stock.
- Authorized receivers can cancel an incorrect unposted draft with a reason. The new cancellation permission has no automatic role grants. Cancellation preserves audit history and changes no inventory; posted corrections still require reversal.
- Wastage and adjustment creation, submission, and posting enforce configured reference coverage. A header reference can cover applicable lines; otherwise each applicable line needs one. Reference presence is not proof of a verified photo or reviewed artifact.
- Loss detail/export distinguish unknown values from unverified estimates. Wastage repeat history includes every distinct item, excludes the current report, and uses the original reporter. Its counts are prior lines, not proven theft incidents.
- Transfer drafts capture the exact source lot/expiry where required. Use separate lines for separate stock buckets and verify the same details at dispatch and receipt.
- Opening-stock calculation supports six-decimal inputs and rounded six-decimal products. Unsupported precision is rejected; existing immutable evidence is preserved.

## Required preparation

Administrators should review explicit receiving-cancellation assignments through the existing controlled role process. Supervisors should rehearse incorrect draft recovery, classified delivery outcomes, reference coverage, blind-count restrictions, and source/destination lot checks with the named users and approved test data.

The authoritative valuation policy remains open. Unknown or unverified estimates require independent review and do not change approval routing. Recount, count-variance correction, transfer settlement, pilot activation, and operational promotion retain their existing gates. This change does not authorize any of them.

## Validation and availability

Implementation and automated checks are recorded in the [internal audit and remediation record](../core/07-quality/INVENTORY_CONTROL_PRE_UAT_AUDIT_2026-09-07.md). Named-role browser UAT has not been completed for this remediation. Do not use this note as a release signoff, proof of physical inventory completeness, or proof that theft has been prevented.

## Updated help

- [Receiving and cancelling an incorrect draft](../knowledge-base/purchasing/receiving-issued-purchase-orders.md)
- [Receiving discrepancies](../knowledge-base/purchasing/receiving-partial-damaged-or-rejected-deliveries.md)
- [Creating Transfer Requests](../knowledge-base/warehouse-inventory/creating-transfer-requests.md)
- [Logging Wastage](../knowledge-base/warehouse-inventory/logging-wastage.md)
- [Understanding Stock Adjustments](../knowledge-base/warehouse-inventory/understanding-stock-adjustments.md)
- [Running Stock Counts](../knowledge-base/warehouse-inventory/running-stock-counts.md)
- [Viewing Stock Balances](../knowledge-base/warehouse-inventory/viewing-stock-balances.md)
- [Viewing Inventory Movement History](../knowledge-base/warehouse-inventory/viewing-inventory-ledger.md)
- [Opening Inventory Cutover pilot](../knowledge-base/warehouse-inventory/using-the-opening-inventory-cutover-pilot.md)
