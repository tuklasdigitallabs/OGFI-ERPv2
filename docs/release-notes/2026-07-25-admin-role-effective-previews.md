# Role Detail effective assignment previews

Role Detail now shows active, currently effective role assignments for active users and active tenant-local/global roles. Malformed role IDs fail safely, assignment timestamps use the selected company timezone, and scope badges are explicitly capped selected-company previews rather than complete access totals.

The preview is contextual only; User Access and source workspaces remain authoritative for access decisions. High-cardinality PostgreSQL, browser/mobile, hosted recovery/deployment, and UAT evidence remain required.
