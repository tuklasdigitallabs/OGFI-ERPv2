# DEC-0154 — Purchase Order amendment workspace

Date: 2026-07-25  Status: Confirmed implementation decision

The multi-line Purchase Order amendment request is presented in the shared `TaskSheet` workspace rather than a centered modal. The sheet shows PO, company, location, supplier, and approval/audit context; preserves the existing server action and line payload; and uses contained horizontal scrolling for narrow screens. Existing eligibility and transactional revalidation remain authoritative.

Evidence: `apps/web/src/app/(app)/purchase-orders/[id]/page.tsx` uses `TaskSheet size="workspace"`; web typecheck passed. Responsive browser, database, hosted, and UAT gates remain open.
