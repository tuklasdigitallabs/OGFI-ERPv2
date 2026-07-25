# DEC-0166 — Administration User Access scope-page read selection

Date: 2026-07-25  Status: Controlled implementation checkpoint

The User Access page now calls the bounded scope projection only for Overview, Scopes, and scope Requests. Roles, role Requests, and Audit receive an explicit empty projection and show an unavailable KPI marker rather than executing an irrelevant polymorphic scope read. Scope mutations and request selectors remain independently authorized and revalidated.

Evidence: Core Admin tests 34/34, web TypeScript, lint, production build, and diff checks pass. PostgreSQL query-count/isolation, responsive browser, hosted recovery, and UAT remain open; role-page and effective-permission read shaping remain separate follow-up work.
