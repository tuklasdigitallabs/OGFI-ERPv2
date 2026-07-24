# DEC-0156 — Bounded assigned roles on User Access detail

Date: 2026-07-25  Status: Confirmed implementation decision

User Access detail now presents active role assignments through a server-owned search and page contract. Results are scoped to the target user, tenant/system roles, and active assignments, ordered by `startsAt ASC, id ASC`, with exact totals. Effective permissions are calculated separately from the complete active role graph so paging never changes authority. Role mutation guards and audit/CAS behavior are unchanged.

Evidence: `getCoreAdminUserDetail`, `/admin/users/[id]`, and Core Admin test coverage 31/31. Web typecheck passed. PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and UAT gates remain open.
