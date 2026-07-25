# DEC-0161 — Administration User Access Requests subworkspace

Date: 2026-07-25  Status: Controlled implementation checkpoint

User Access now has a URL-backed `Requests` section with separate `scope` and `role` request kinds. The active kind is the only request dataset loaded by the detail service; each request list keeps its tenant, company, target-user, status, deterministic ordering, exact-count, and bounded-page predicates. Existing request mutation services remain the source of truth for authorization, MFA, segregation of duties, pending-state CAS, and audit behavior.

Pending rows expose a compact `Open review controls` link. Approve/reject forms are rendered once in a selected-request composer with a validated return path, target/request IDs, requester and selected-company context, and pending-only narrative/evidence detail. Historical rows remain summary-only and the selected ID never grants authority. Missing, stale, foreign, or terminal selections show a safe unavailable/read-only state.

Evidence: Core Admin focused tests and web TypeScript/lint pass for this checkpoint. PostgreSQL authorization/isolation/query-plan execution, responsive browser, hosted recovery, and UAT remain open. The broader User Access Overview/Roles/Scopes/Audit information architecture is not complete.
