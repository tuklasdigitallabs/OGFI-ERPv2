# DEC-0165 — Administration User Access section-aware catalogs

Date: 2026-07-25  Status: Controlled implementation checkpoint

The User Access detail service now accepts an internal allowlisted section projection. Overview and Audit skip role/location assignment catalogs; Roles loads only the role catalog; Scopes loads only the location catalog; Requests loads only the catalog needed by its selected scope or role request kind. Existing callers that omit the projection retain the compatibility `both` behavior. Authorization, target membership, mutation revalidation, and effective-role graph reads remain unchanged.

The Assign Role panel is now visible only in Roles, and assignment/request selectors remain visible only in their corresponding section. Skipped catalogs return empty options and `hasMore: false`; this is a read-shaping optimization and never grants or removes authority.

Evidence: Core Admin tests 34/34, web TypeScript, lint, production build, and diff checks pass. Query-count/isolation, PostgreSQL, responsive browser, hosted recovery, and UAT remain open; scope-page and role-page reads are a separate follow-up.
