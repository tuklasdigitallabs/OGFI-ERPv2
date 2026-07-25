# DEC-0172 — Administration Readiness selected deployment review sheet

Status: Accepted for implementation
Date: July 25, 2026

## Decision

Selected Deployment Evidence review actions use one focused TaskSheet instead of competing inline Verify/Reject forms. The sheet shows the selected migration, backup, restore, rollback, smoke-test, or monitoring evidence context and explains that verification affects deployment readiness counts; rejection requires an explicit reason.

## Controls

- `deploymentEvidenceId` is navigation state only. `getDeploymentEvidenceRecord` and `updateDeploymentEvidenceStatus` retain selected-company authorization, creator self-review protection, `RECORDED` compare-and-set, reason validation, and immutable audit.
- Foreign, malformed, stale, or unavailable records remain generic read-only states.
- Deployment gate status is not mutated by evidence review; aggregate readiness remains source-owned.

## Evidence and remaining gates

Release Readiness focused tests, web TypeScript, lint, production build, and diff checks are required for this slice. PostgreSQL authorization/query-plan, responsive browser, hosted recovery, and UAT execution evidence remain open; Readiness, Administration, and Phase I are not complete.
