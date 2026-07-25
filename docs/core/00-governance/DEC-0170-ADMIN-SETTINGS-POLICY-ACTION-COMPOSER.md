# DEC-0170 — Administration Settings policy action composer

Status: Accepted for implementation
Date: July 25, 2026

## Decision

Admin Settings replaces repeated per-row Configure and Use Recommended forms with one URL-selected policy action composer. Selecting a policy preserves category, search, page, and page-size context. The selected composer shows the policy label, description, current value, type, and recommended value; update and reset actions return to the same bounded registry context.

## Controls

- The browser-supplied `settingKey` is allowlisted for display and return context only. `updateCompanyPolicySetting` and `resetCompanyPolicySetting` continue to resolve the policy definition and enforce Core Admin, selected-company Manage, value validation, transaction, and audit rules server-side.
- Stale or filtered-out selections are read-only and explain that the registry must be refreshed.
- Updates require a five-character reason. Reset remains a separate short audited action and does not inherit the update form’s required reason field.

## Evidence and remaining gates

Policy Settings focused tests, web TypeScript, lint, production build, and diff checks are required for this slice. PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and UAT evidence remain open; Administration and Phase I are not complete.
