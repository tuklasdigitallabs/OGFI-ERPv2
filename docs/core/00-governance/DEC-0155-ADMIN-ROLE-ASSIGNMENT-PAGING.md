# DEC-0155 — Bounded role assignment detail

Date: 2026-07-25  Status: Confirmed implementation decision

Role detail now reads active assignments through an exact-count, server-owned page with name/email search and deterministic ordering. Each returned user has at most eight active scope previews; role and permission mutation authority is unchanged and remains server-enforced. The detail page exposes truthful search, empty, and pagination states.

Evidence: `getCoreAdminRoleDetail` and `/admin/roles/[id]`; Core Admin tests 30/30 and web typecheck pass. PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and UAT gates remain open.
