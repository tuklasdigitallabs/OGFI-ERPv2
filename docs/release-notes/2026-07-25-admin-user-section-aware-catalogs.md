# Administration User Access section-aware catalogs

User Access now loads assignment catalogs only where their controls are available: roles in Roles, locations in Scopes or scope Requests, and the matching catalog for role Requests. Overview and Audit no longer load either assignment catalog. Existing server authorization and mutation revalidation remain unchanged.

Query-count/isolation, PostgreSQL, responsive browser, hosted recovery, and UAT evidence remain pending.
