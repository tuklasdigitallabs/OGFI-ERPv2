# DEC-0153 — Bounded approved-recommendation lookup for Purchase Order creation

Date: 2026-07-25  Status: Confirmed implementation decision

Purchase Order creation uses a server-authorized, paginated lookup for approved, unlinked quotation recommendations. Search covers PR reference, supplier, and quote reference. The selected recommendation is retained when it is outside the current page, while final creation revalidates approval, scope, and duplicate-PO rules.

Tenant, company, authorized-location, approved-PR, and no-existing-PO predicates are enforced in the lookup. Results are deterministic (`approvedAt DESC, id DESC`) with exact totals and a bounded page size. The lookup has no mutation authority; `createPurchaseOrderFromRecommendation` remains the lifecycle gate. Focused PO tests (36) and web typecheck passed; browser, database-plan, hosted, and UAT gates remain open.

Keeping the eager nested query or capping it to an arbitrary first page was rejected because it hides eligible recommendations and creates false selector authority.
