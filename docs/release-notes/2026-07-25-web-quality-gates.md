# Web quality gates restored

The web lint and TypeScript gates are green after removing obsolete client overflow state left behind by the bounded Purchase Request lookup migration. No user workflow policy changed.

User Access now limits assigned-role and effective-permission reads to the Overview and Roles sections. Other sections show an unavailable marker for those summaries, while role Requests retains only the identifiers needed by its assignment catalog.

The Roles section now uses one selected-role action composer with preserved search/page context and a required reason, replacing repeated deactivation forms in each row.

Scope navigation and deactivation now preserve the Scopes tab, filters, and page context through search, paging, and action redirects.

Admin Settings now uses one selected-policy composer for Configure and Use Recommended actions, preserving registry context and keeping policy mutation/audit validation server-authoritative.

Release Readiness UAT evidence review now uses one focused review sheet for Verify/Reject actions, with explicit status consequences and preserved filter/page context.
