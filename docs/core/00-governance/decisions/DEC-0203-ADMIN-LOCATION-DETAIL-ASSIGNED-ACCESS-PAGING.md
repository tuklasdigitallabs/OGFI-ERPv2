# DEC-0203 — Administration Location Detail assigned-access paging

Date: 2026-07-25  
Status: Accepted conditionally for implementation  
Decision chair: Parent agent  
Deliberators: Product analysis and architecture review (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 unavailable)

## Decision

Keep Location Context Assigned Access as a read-only, assignment-grain register. Use a shared Prisma predicate for exact count and bounded page reads: location scope, active assignment, currently effective start/end dates, and active user in the current tenant. Nested role labels are limited to active/effective assignments whose roles are active and tenant-local or global. Pages are URL-backed, clamped, finite, capped at 10–100 rows, and ordered by `userId ASC, assignmentId ASC`.

## Controls and trade-offs

The existing Core Administration, tenant-role administration, selected-company Manage, and tenant/company location checks remain server-enforced. Malformed location IDs safely return not-found. The register does not mutate access; duplicate assignment rows remain visible as separate assignment records. Count/page reads may drift under concurrent writes; a repeatable-read/CTE or a scope/status index requires query-plan evidence and is deferred.

## Evidence and open gates

Focused Core Admin contract tests, web typecheck, lint, production build, and diff checks are required for this slice. Disposable PostgreSQL tenant/foreign-user/effective-date/query-plan execution, responsive browser/mobile, hosted recovery/deployment, and UAT remain open. Administration and Phase I are not complete.
