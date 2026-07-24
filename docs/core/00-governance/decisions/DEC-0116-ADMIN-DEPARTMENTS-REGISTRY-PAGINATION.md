# DEC-0116 — Administration Departments Registry Pagination

**Status:** ACCEPTED — July 24, 2026  
**Decision Chair:** Parent implementation agent  
**Fallback model note:** GPT-5.6 subagents were used because the requested Code Spark/GPT-5.4 models were unavailable in the active toolset.

## Decision

Implement Departments as a selected-company, server-paginated Organization registry. The page accepts bounded name/code search and status filters, uses page 1–10,000 and page sizes 10–100 (default 25), returns exact total and active counts, and sorts deterministically by `name ASC, id ASC`.

The bounded row projection retains the three dependency counts already visible in the Organization UI: budgets, budget lines, and cost centers. These are selected-company-scoped related-record summaries, not financial totals or authorization signals. `employeeAssignmentCount` is deferred because no current visible consumer uses it and it would add unrelated workforce-volume disclosure.

Every query is guarded by `core.administer`, tenant-role administration, and selected-company `MANAGE` before database access, with tenant and company predicates on all Department and count relations. No Department option catalog is added until a concrete dependent form requires one.

## Alternatives considered

- Exclude all dependency counts for a least-data projection. Rejected for this visible slice because existing Department cards promise these counts; omission would make the surface incomplete or ambiguous.
- Retain all existing counts, including employee assignments. Rejected because employee assignment volume has no current visible use and increases incidental workforce disclosure.
- Defer Department pagination and leave the unbounded list. Rejected because it violates the operational-list pagination and visible-surface gates.

## Safeguards and tests

- No-query denial for missing permission, tenant-role authority, or selected-company `MANAGE`.
- Tenant/company isolation, bounded input validation, deterministic tie ordering, and count/page predicate parity.
- Explicit projection containing only Department identity/scope/status and the three approved summary counts; no nested financial, cost-center, or employee records.
- Empty, loading, error, denied, mobile, and paginated visible states remain truthful.

## Evidence and follow-up

The implementation checkpoint records focused/full tests, authorization-manifest, typecheck/lint, isolated build, and remaining external production gates. The source-of-truth UI and enablement documents must state that the counts are read-only related-record summaries and that employee-assignment impact remains deferred.
