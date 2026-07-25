# Administration User Access scope-read selection

User Access now loads the bounded scope register only where it is needed: Overview, Scopes, and scope Requests. Roles, role Requests, and Audit do not execute an irrelevant scope read and show an unavailable count marker when scope totals are not part of the active section.

PostgreSQL query-count/isolation, responsive browser, hosted recovery, and UAT evidence remain pending.
