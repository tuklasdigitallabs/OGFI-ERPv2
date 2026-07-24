# DEC-0121 — High-Risk Scope Review Membership Revalidation and CAS

## Metadata

- Decision ID: `DEC-0121`
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Core Administration
- Decision Chair: Parent agent
- Related phase/module: Phase I — Users, Roles, and Administration

## Decision

High-risk scope approval and rejection must lock the target user inside the transaction, revalidate active/effective selected-company membership, and claim the request with `updateMany({ where: { id, status: "PENDING" } })`. A claim count other than one fails closed. This prevents stale-target grants and concurrent double review.

## Context

The prior path pre-read a pending request and target user, then unconditionally updated by ID inside a later transaction. A membership revocation or competing reviewer could occur between those operations. The security model requires target-user actions to have active/effective selected-company membership at mutation time.

## Hard gates and safeguards

- Tenant, company, target-user, location, self-review, privileged-MFA, and manager-scope checks remain enforced.
- Target row locking and the pending-status claim are inside the same transaction as assignment creation or rejection audit.
- Concurrent review must result in exactly one successful claim; the loser receives a safe not-found/stale error and creates no assignment or audit mutation.
- No destructive deletion or inventory/financial mutation is introduced.

## Evidence

- `apps/web/src/server/services/coreAdmin.ts`
- `apps/web/src/server/services/coreAdmin.test.ts`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md` target-user membership rule
- Independent security review identified stale-target and concurrent-review risk; GPT-5.6 fallback subagent used because Code Spark and GPT-5.4 were unavailable.
