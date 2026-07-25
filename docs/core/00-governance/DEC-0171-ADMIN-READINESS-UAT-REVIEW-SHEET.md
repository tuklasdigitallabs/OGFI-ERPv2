# DEC-0171 — Administration Readiness selected UAT review sheet

Status: Accepted for implementation
Date: July 25, 2026

## Decision

Selected UAT evidence review actions use one focused TaskSheet instead of competing inline Verify/Reject forms. The sheet shows the selected record and current status, explains the consequence of each outcome, preserves the existing filter/page context, and keeps rejection reason validation visible at a usable touch target.

## Controls

- `evidenceId` remains display/navigation state only. `getUatEvidenceRecord` and `updateUatEvidenceStatus` retain selected-company authorization, creator self-review protection, `RECORDED` compare-and-set, reason validation, and immutable audit.
- Foreign, malformed, stale, or unavailable records remain generic read-only states.
- Verified and rejected records remain historical and cannot be changed from this review surface.

## Evidence and remaining gates

Release Readiness focused tests, web TypeScript, lint, production build, and diff checks are required for this slice. PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and UAT execution evidence remain open; Readiness, Administration, and Phase I are not complete.
