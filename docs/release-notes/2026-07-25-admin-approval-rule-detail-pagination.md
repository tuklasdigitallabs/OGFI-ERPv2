# Approval Rule detail pagination

Approval Rule detail now uses separate bounded registers for Approval Steps and Related Audit Activity. Both report exact totals, support URL-backed pagination from 10 to 100 rows, and preserve deterministic ordering and explicit empty states.

Assignee references are projected only for the current step page and show inactive or unavailable status when applicable. Audit activity remains selected-company scoped and timestamps use the rule company timezone. The page is read-only.

Disposable PostgreSQL isolation/query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain required for production readiness.
