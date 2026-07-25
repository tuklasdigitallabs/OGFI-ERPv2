# DEC-0162 — Administration User Access Audit subworkspace

Date: 2026-07-25  Status: Controlled implementation checkpoint

User Access now has a real URL-backed `Audit` section. It uses an internal actor-scoped wrapper around the existing Core Admin Audit service: target-user membership is checked before the read, the existing Core Administration, tenant-role, and selected-company Manage gates apply, and the query uses an exact actor ID predicate rather than ambiguous display-name search. Existing keyset cursor binding, deterministic `occurredAt DESC, id DESC` ordering, exact totals, and recursive sensitive-field redaction remain authoritative.

The legacy ten-row `user.auditEvents` hydration was removed. Audit is read-only, exposes only safe list projections, preserves search/cursor return context, and links selected events to the separately authorized Audit detail route. No browser-supplied actor ID grants authority and no audit JSON is duplicated in the User Access page.

Evidence: Core Admin focused tests pass 33/33; web TypeScript, lint, and diff checks pass. PostgreSQL no-query authorization/isolation/query-plan, responsive browser, hosted recovery, and UAT remain open. Remaining Overview/Roles/Scopes/Requests section isolation is a follow-up; Administration and Phase I are not complete.
