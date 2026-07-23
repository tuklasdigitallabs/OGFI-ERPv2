# DEC-0092 — Goods Receipt Reference Allocation

Status: Confirmed  
Date: 2026-07-24

Goods Receipt public references use a company/document-type/year sequence row allocated inside the same transaction as receipt creation. The atomic allocation prevents concurrent receipts for different purchase orders from receiving the same `RR-YYYY-#####` reference, while the existing `(companyId, publicReference)` unique constraint remains the final defense.

The sequence increment rolls back with the receipt transaction, so failed creation or audit writes do not consume a reference. Allocation is scoped by tenant and company, uses UTC year formatting, does not mutate inventory, and remains separate from API idempotency and posting event keys.

Required production evidence remains: disposable-PostgreSQL concurrent different-PO creation, rollback, year-boundary, tenant/company isolation, and idempotent create-route tests.
