# DEC-0157 — Tenant/company-filtered User Access scope page

Date: 2026-07-25  Status: Controlled implementation checkpoint

Assigned Scopes now has an additive server-owned page contract built as a parameterized PostgreSQL CTE/UNION across Company, Brand, Location, Department, and Project targets. Each branch joins tenant and selected-company ownership before the common search, type filter, count, deterministic order, and bounded page. Foreign or unknown polymorphic targets are omitted generically. Existing assignment/deactivation services remain authoritative and are not changed by this read contract.

Evidence: Core Admin scope contract/source test passes with the focused suite; the web TypeScript check currently has unrelated pre-existing errors in option-catalog, quotes, role-permission, and item composer areas, so no broad typecheck pass is claimed. PostgreSQL isolation/query-plan execution, interactive selected-scope composer, responsive browser, hosted recovery, and UAT remain open.
