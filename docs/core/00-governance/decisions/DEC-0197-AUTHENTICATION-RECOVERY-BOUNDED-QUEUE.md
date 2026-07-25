# DEC-0197 — Authentication Recovery Bounded Queue

## Metadata

- Status: Confirmed
- Date: 2026-07-25
- Decision Chair: Parent agent
- Related phase/module: Phase I Administration / Authentication

## Decision

Make Recovery the first URL-backed Authentication section. Use a bounded,
server-paginated queue with exact filtered totals, status/search/UTC date filters,
deterministic ordering, and a selected-request TaskSheet. Keep terminal history
visible and read-only; pending review actions are not repeated in every row.

## Controls

All reads and mutations remain tenant/company scoped and Core Administration
authorized. Approval retains privileged MFA, no-self/separate-reviewer checks,
current target-scope revalidation, local-identity validation, pending CAS,
session/MFA revocation, activation issuance, and audit transaction semantics.
Rejection is a non-granting cleanup action and may close a company-scoped pending
request even if the target's operational scope has since been revoked; approval
is unavailable until current scope is restored. Requests require an active local
identity, keeping first-time activation on the separate activation workflow.

## Evidence and remaining gates

Focused service/UI contract, TypeScript, lint, and production build evidence is
required for this slice. PostgreSQL isolation/concurrency/query-plan, responsive
browser, hosted recovery, and UAT evidence remain open.

