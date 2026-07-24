# DEC-0120 — Administration Request-History Redacted Registry

## Metadata

- Decision ID: `DEC-0120`
- Status: Confirmed (interim defense-in-depth)
- Date: 2026-07-24
- Decision owner: Core Administration
- Decision Chair: Parent agent
- Related phase/module: Phase I — Users, Roles, and Administration

## Decision

Paginated Controlled Scope and Controlled Role histories use a status-based interim projection: pending requests retain the context needed for active review, while approved/rejected rows expose safe lifecycle summaries and reason/evidence-recorded indicators. A separately authorized detail contract remains required before historical narrative is re-exposed.

## Context and options

DEC-0119 bounded the histories but still rendered sensitive free text, evidence references, review remarks, and permission labels across terminal rows. Keeping all context fails least-data. Immediate full detail-drawer work would broaden the slice. The selected interim projection closes bulk historical disclosure while preserving pending review actions; a future detail endpoint must reauthorize tenant, company, target user, and reviewer authority and must not rely on a client flag.

## Hard gates and safeguards

- Existing tenant/company/target-user predicates and server-side approve/reject controls remain unchanged.
- No inventory, money, schema, or source-record status changes occur.
- Historical records remain auditable; no destructive deletion occurs.
- Focused tests assert pending-only context and truthful historical-summary copy.
- Before release, add disposable-PostgreSQL no-query denial tests and a separately authorized detail/audit path for terminal narrative.

## Evidence and fallback

- `apps/web/src/server/services/coreAdmin.ts`
- `apps/web/src/app/(app)/admin/users/[id]/page.tsx`
- `apps/web/src/server/services/coreAdmin.test.ts`
- DEC-0119 request-history pagination contract
- Independent security and product reviews; GPT-5.6 fallback subagents used because Code Spark and GPT-5.4 were unavailable.
