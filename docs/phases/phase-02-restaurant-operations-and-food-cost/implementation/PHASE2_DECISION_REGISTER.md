# Restaurant Operations — Decision Register

**Status:** Configurable baseline confirmed for pilot/UAT

Record only decisions required to make this module build-ready. Do not treat configurable defaults as hardcoded permanent policy.

| ID | Decision Needed | Default / Starting Assumption | Owner | Status | Decision Date |
|---|---|---|---|---|---|
| II-001 | Final scope and release boundary | Restaurant Operations current release includes controlled recipes/menu costing, branch operations, food safety, incidents, maintenance, reports, exports, and UAT documentation; broader integrations remain trust-gated | Product / Executive | Confirmed by `DEC-0036` | 2026-07-07 |
| II-002 | Detailed approval matrix additions | Reuse core configurable approval engine; approvals route by company, brand, location, department, transaction type, amount/risk, evidence, and role | Finance / Operations / HR / Projects as applicable | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| II-003 | Reporting and dashboard priorities | Use role-specific dashboards, source-record drilldowns, scoped CSV exports, and Restaurant Operations report families | Management | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| II-004 | Integration and migration needs | Integrate only where reliable source data exists; POS/imported sales data is trust-gated and warning-gated until validated | IT / Data Owner | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| II-005 | Go-live and UAT owners | Use Release Board signoff with QA, Product, Security/Controls, Operations, Warehouse/Inventory, Release, and Enablement owners | Executive / Project Lead | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| II-006 | Marketing Operations shared-engine dependency | Use shared Work Management Engine for tasks, assignments, comments, attachments, activity, notifications, calendars, and boards | Product / Marketing / IT | Confirmed by `DEC-0007` | |
| II-007 | Marketing campaign, promotion, and launch controls | Use shared Work Management Engine with configurable status templates, approval routes, branch/date scope, readiness evidence, calendar conflicts, asset access, and reporting sources | Marketing / Operations / Executive | Confirmed baseline by `DEC-0036` | 2026-07-07 |
| II-008 | Recipe management CRUD and menu-price propagation | `DEC-0035` confirms immutable recipe versions, protected publish/archive actions, separate menu-price decision records, no automatic price mutation, server-side authorization/SOD, audit, and effective-dated history | Operations / Finance / IT | Confirmed by `DEC-0035` | 2026-07-06 |
| II-009 | Phase II operational correction/edit lifecycle | `DEC-0035` confirms correction-only post-submit edits for branch checklists, food-safety logs, incidents, and maintenance tickets; no broad in-place mutation after submission | Operations / QA / IT | Confirmed by `DEC-0035` | 2026-07-06 |
| II-010 | Phase II intermediate status semantics | `DEC-0035` confirms explicit server-side transition policies only; intermediate statuses are shown or reachable only when backed by permissioned actions, reason/evidence rules, idempotency, and audit | Operations / QA / IT | Confirmed by `DEC-0035` | 2026-07-06 |
| II-011 | Incident and maintenance closure, void, and reopen review policy | `DEC-0037` confirms risk-tiered lifecycle control: routine closure may be direct with reason/evidence/audit; high-risk, regulatory, branch-blocking, food-safety-critical, void, and reopen actions require independent review. The version-controlled policy registry remains authoritative, reconciled to supported statuses, with no history rewrite | Operations / QA / IT | Confirmed by `DEC-0037` | 2026-07-11 |
