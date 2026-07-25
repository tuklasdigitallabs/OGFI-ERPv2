# DEC-0157 — Tenant/company-filtered User Access scope page

Date: 2026-07-25  Status: Controlled implementation checkpoint

Assigned Scopes now has an additive server-owned page contract built as a parameterized PostgreSQL CTE/UNION across Company, Brand, Location, Department, and Project targets. Each branch joins tenant and selected-company ownership before the common search, type filter, effective-state labeling (`CURRENT`, `FUTURE`, `EXPIRED`), count, deterministic order, and bounded page. Foreign or unknown polymorphic targets are omitted generically. Existing assignment/deactivation services remain authoritative and are not changed by this read contract.

Count and row reads share the same parameterized CTE; stale page requests are clamped from an exact count before row retrieval. The detail service no longer eagerly hydrates all scope assignments; this page projection is now the sole assigned-scope read, while deactivation revalidates the selected assignment in its transaction. Assignment action metadata is derived from the bounded row and the existing risk helpers.

Evidence: Core Admin scope contract/source test passes with the focused suite. Boundary typing repairs for the conversion composer, option catalog, PO recommendation lookup, role-permission projection, and quote queue were included in this checkpoint; web TypeScript now passes. PostgreSQL isolation/query-plan execution, responsive browser, hosted recovery, and UAT remain open.
