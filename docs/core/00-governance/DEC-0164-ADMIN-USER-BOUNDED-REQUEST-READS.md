# DEC-0164 — Administration User Access bounded request reads

Date: 2026-07-25  Status: Controlled implementation checkpoint

Non-Requests User Access sections now pass an internal `requestKind: "none"` to the detail service, so neither controlled-request table is counted or listed outside the Requests workspace. Requests scope and role views continue to load only their selected dataset. Existing default service callers retain the compatibility behavior of loading both datasets when no kind is supplied.

This checkpoint also closes an Audit isolation defect: exact actor scoping is now merged with free-text query predicates instead of being overwritten, so searching an actor-scoped Audit page cannot return another same-company actor’s event.

Evidence: Core Admin tests pass 34/34; web TypeScript, lint, production build, and diff checks pass. Database query-count/isolation, responsive browser, hosted recovery, and UAT remain open. Role/scope/catalog reads are intentionally a separate bounded follow-up.
