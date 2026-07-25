# DEC-0190 — Supplier Catalog Option Contract Gate

**Status:** ACCEPTED — regression gate

The supplier service and Catalog surface now have executable source-contract
coverage for bounded category option paging, 120-character refinement input,
deterministic ordering, selected-category retention, and URL/action context.
The test also prevents reintroduction of the prior unbounded linked-row
materialization used for category counts.

This is a reversible test/documentation control with no schema or public API
change. A disposable PostgreSQL fixture would provide stronger query-plan and
cross-scope evidence, but requires the unavailable database sentinel and stays
in the shared external gate; relying only on the broad web suite was rejected
because it would not protect this new contract.
