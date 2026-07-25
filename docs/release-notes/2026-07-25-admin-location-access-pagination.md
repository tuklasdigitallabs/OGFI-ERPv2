# Location Context assigned-access register

Location Context now presents Assigned Access as a bounded, read-only register. It reports the exact request-time count of active, currently effective location assignments for active users in the current tenant and provides URL-backed pagination from 10 to 100 rows.

The register is assignment-grain and deterministic. It does not grant or revoke access; administrators must use User Access for those actions. Empty and stale-page states remain explicit, and the control is responsive on smaller screens.

This slice remains conditional on disposable PostgreSQL authorization/query-plan evidence, responsive browser/mobile verification, hosted recovery, and UAT.
