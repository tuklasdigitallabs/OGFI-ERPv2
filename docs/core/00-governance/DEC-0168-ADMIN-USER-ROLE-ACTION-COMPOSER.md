# DEC-0168 — Administration User Access role action composer

Status: Accepted for implementation
Date: July 25, 2026

## Decision

The User Access Roles section uses one URL-selected role action composer instead of a repeated deactivation form in every row. Selecting a mutable active assignment carries `roleActionId`, assigned-role search, and page state in the URL. The composer shows the selected role context and consequence, requires a five-character reason, and preserves the return path across success and error redirects.

## Controls

- The selected identifier is display state only; `deactivateUserRoleAssignment` remains the authoritative tenant/company, target-user, self-protection, role eligibility, CAS, locking, SOD, privilege-epoch, and audit boundary.
- A missing, stale, filtered-out, or non-mutable selection is read-only and explains that the role must be refreshed or cannot be changed.
- The bounded role page remains the only source for the selected row; no hidden or unbounded role read is introduced.

## Evidence and remaining gates

Core Admin focused tests, web TypeScript, lint, production build, and diff checks are required for this slice. PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and UAT evidence remain open; Administration and Phase I are not complete.
