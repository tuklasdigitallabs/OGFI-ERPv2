# DEC-0173 — Administration Readiness UAT evidence capture sheet

Status: Accepted for implementation
Date: July 25, 2026

## Decision

The long Record UAT Evidence workflow uses the shared workspace TaskSheet instead of a centered EntryModal. The sheet retains evidence type/result, title, workflow area, environment, reference, execution time, tester, policy/defect references, notes, and reason fields, with 44px controls and preserved UAT filter/page context on success or validation error.

## Controls

- `createUatEvidenceRecord` remains the authoritative selected-company/Core Admin Manage, enum/value, UTC timestamp, required-field, audit, and no-direct-gate-transition boundary.
- Filter/page hidden fields are navigation context only and do not grant evidence or gate authority.
- The create action returns to the normalized UAT context; recoverable failures surface through the existing action-feedback contract.

## Evidence and remaining gates

Release Readiness focused tests, web TypeScript, lint, production build, and diff checks are required for this slice. PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and UAT execution evidence remain open; Readiness, Administration, and Phase I are not complete. Enablement selected review parity remains the next readiness UI slice.
