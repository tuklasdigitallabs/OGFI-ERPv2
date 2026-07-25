# DEC-0205 — Administration Approval Rule detail bounded registers

Date: 2026-07-25  
Status: Accepted conditionally for implementation  
Decision chair: Parent agent  
Deliberators: Product analysis and architecture review (closest permitted GPT-5.6 fallback; requested Code Spark/GPT-5.4 unavailable)

## Decision

Approval Rule detail remains read-only. Approval Steps are an exact-count, assignment-chain register with URL-backed 10–100 pages and `stepOrder ASC, id ASC` ordering. Related Audit Activity is an exact-count, selected-company register with URL-backed 10–100 pages and `occurredAt DESC, id DESC` ordering. Role and user labels are projected only for the current step page and are tenant-scoped; unresolved or inactive references remain visible as status rather than being silently removed.

## Controls and open gates

Core Administration and selected-company Manage remain required. Tenant-wide rules remain visible only with tenant-role authority. Malformed IDs return not-found. Audit remains selected-company scoped and uses allowlisted actor/entity fields. PostgreSQL isolation/query-plan, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain open.
