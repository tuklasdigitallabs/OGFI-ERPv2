# DEC-0191 — Role Permission Matrix Server Paging

**Status:** ACCEPTED — reversible service/UI contract

## Decision

Role Detail permission review uses a tenant/global-scoped, deterministically
ordered server page with bounded search and allowlisted Sensitive, Overrides,
and Recommended Drift filters. `Overrides` means enabled codes added outside
the recommended set; `Recommended Drift` is the full symmetric difference,
including recommended codes that are disabled. The service returns the complete currently
enabled permission-code set separately; the UI submits enabled codes outside
the visible page as hidden inputs so a filtered save preserves the complete
role state.

## Alternatives and safeguards

Leaving the matrix unbounded or capping it at 100 keeps permissions
undiscoverable and fails the Administration list gate. Incremental per-row
mutation was rejected as a larger authority redesign. The existing role
authorization, tenant/global permission predicate, MFA, CAS, audit, sensitive
role approval, and server-side unknown-code validation remain authoritative.
No schema or public API migration is required; PostgreSQL query-plan,
responsive browser, hosted, and UAT evidence remain external gates.
