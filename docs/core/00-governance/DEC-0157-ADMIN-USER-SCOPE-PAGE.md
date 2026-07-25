# DEC-0157 — Tenant/company-filtered User Access scope page

Date: 2026-07-25  Status: Controlled implementation checkpoint

Assigned Scopes now has an additive server-owned page contract built as a parameterized PostgreSQL CTE/UNION across Company, Brand, Location, Department, and Project targets. Each branch joins tenant and selected-company ownership before the common search, type filter, count, deterministic order, and bounded page. Foreign or unknown polymorphic targets are omitted generically. Existing assignment/deactivation services remain authoritative and are not changed by this read contract.

Evidence: Core Admin scope contract/source test passes with the focused suite. Boundary typing repairs for the conversion composer, option catalog, PO recommendation lookup, role-permission projection, and quote queue were included in this checkpoint; web TypeScript now passes. PostgreSQL isolation/query-plan execution, responsive browser, hosted recovery, and UAT remain open.
