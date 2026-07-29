# DEC-0251 — Purchase Request draft budget public-boundary protection

## Metadata

- Decision ID: `DEC-0251`
- Title: Purchase Request draft budget public-boundary protection
- Status: Confirmed
- Date: 2026-07-29
- Decision owner: Parent agent
- Decision Chair: Parent agent
- Related phase/module: Phase I — Procurement / Purchase Request draft composer
- Related decision brief: Parent-led security, backend, and QA review of `getPurchaseRequestDraftOptions`

## Decision

`getPurchaseRequestDraftOptions` is a **HIGH PUBLIC_BOUNDARY** because it returns budget metadata to the Purchase Request composer. Its budget-line query must constrain the parent `Budget` by the active session's `tenantId` and `companyId`, in addition to the existing authorization and active-status controls.

This decision does not approve a brand/location hierarchy or conjunction policy for budget eligibility. That policy remains open in the governance register and must not be inferred from this query safeguard.

**Release status:** No GO claim is made by this record. The source safeguard and dedicated test are implemented; clean disposable-PostgreSQL execution and broader release evidence remain pending.

## Context

The legacy draft-options service returns a bounded budget-line option list, including budget reference and name, for a browser-visible Purchase Request composer. Although the child `BudgetLine` query has scope fields and status predicates, its parent `Budget` relation is the source of the returned metadata. The public read boundary therefore requires an explicit parent tenant/company predicate to prevent disclosure if inconsistent or adversarially seeded relational data bypasses assumed child-row integrity.

The decision was confirmed after independent security, backend, and QA review. Requested Code Spark/GPT-5.4 availability was unavailable; the active agents used the closest permitted GPT-5.6 fallback. This fallback was an execution-availability measure only and did not change the hard gates or decision authority.

## Options considered

### Option A — selected

- Summary: Classify the service as HIGH PUBLIC_BOUNDARY and add parent `Budget.tenantId` and `Budget.companyId` predicates to the budget-line relation filter.
- Benefits: Defends the metadata-returning read at its parent ownership boundary; retains bounded composer behavior; makes the no-disclosure invariant directly testable.
- Failure modes: A future change could omit or weaken the parent predicate, or relation/query-shape changes could return parent metadata without the same fence.
- Why selected or rejected: Selected because it closes the demonstrated relational-disclosure class without changing Purchase Request workflow or deciding unresolved budget hierarchy semantics.

### Option B — rejected

- Summary: Rely only on `BudgetLine` tenant/company fields and the existing location/brand filter.
- Benefits: Smaller query and no immediate behavior change.
- Failure modes: A mismatched child/parent ownership relation could expose the parent budget reference or name across tenant/company boundaries.
- Why selected or rejected: Rejected because child-row scope is not sufficient protection for metadata projected from the parent relation at a public boundary.

### Option C / defer — rejected

- Summary: Defer the safeguard until brand/location hierarchy policy is confirmed.
- Benefits: Avoids touching a legacy lookup before policy review.
- Failure modes: Leaves an immediate cross-tenant/company metadata-disclosure risk in a browser-facing service.
- Why selected or rejected: Rejected because parent ownership isolation is independent of the unresolved brand/location semantics and must not wait for that policy decision.

## Hard-gate assessment

- Tenant/company/brand/location scope isolation: Parent `Budget` tenant/company predicates are required. Brand/location eligibility is not newly authorized and remains an open policy question.
- Server-side authorization: Existing `purchaseRequestCreate` permission and authorized-location assertion remain required; client filtering is not a control.
- Approval segregation and inventory integrity: Not changed; this is a read-only composer lookup.
- Transaction consistency, audit, and recovery: No write, posting, or audit mutation is introduced. A query regression can be rolled back independently.
- Phase scope: Limited to Phase I Purchase Request draft lookup protection.

## Required safeguards

1. Keep `requirePermission(session, permissions.purchaseRequestCreate)` and `assertAuthorizedLocation` ahead of lookup execution.
2. Require `budget: { is: { tenantId: session.context.tenantId, companyId: session.context.companyId, ... } }` (or an equivalent relation predicate) wherever this public boundary returns Budget-derived metadata.
3. Preserve child `BudgetLine` tenant/company scope and active budget-status filters; the parent predicate complements rather than replaces them.
4. Add a dedicated database-backed no-disclosure test that seeds a child/parent ownership mismatch or equivalent adversarial relation and proves another tenant's or company's budget reference/name is never returned.
5. Test both the ordinary bounded page and any selected-ID retention path if retained/introduced; a selected ID must not bypass the same parent fence.
6. Keep the option payload minimal and bounded. Do not add balance, amount, commitment, or other budget-sensitive fields through this endpoint without a separate reviewed decision.
7. Do not use the current location/brand conjunction as evidence of an approved hierarchy policy; resolve the linked open decision before making policy-dependent changes.

## Implementation and documentation impact

- Code / architecture: Harden `getPurchaseRequestDraftOptions` in `apps/web/src/server/services/purchaseRequests.ts`; preserve its server-owned read boundary.
- Data / schema: No schema or migration change.
- Workflow / permissions: No new permission, workflow status, or authority.
- UI / mobile: No required UI change; the composer continues to show only authorized, bounded lookup options.
- Reporting: None.
- Knowledge base / training: No Dunong handoff required; no user-visible workflow change is confirmed.
- Tests / UAT: Dedicated DB no-disclosure coverage is required before any security-completion or release-readiness claim. General focused test/typecheck/lint results remain separate evidence.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the parent Budget tenant/company relation predicate. | Backend owner | Before merging the safeguard | Complete in source; execution pending |
| Add and run dedicated database-backed cross-tenant/company no-disclosure tests, including selected-ID behavior when applicable. | QA / backend owner | Before security-completion or release-readiness claim | Implemented; execution pending |
| Confirm budget-line brand/location hierarchy and conjunction semantics. | Authorized business/architecture decision council | Before policy-dependent lookup changes or production enforcement | Open |
| Verify focused regression, typecheck, lint, and release evidence. | Parent agent | After implementation | Pending |

## Evidence

- `apps/web/src/server/services/purchaseRequests.ts` — `getPurchaseRequestDraftOptions` is browser-facing through the Purchase Request composer and projects `Budget.publicReference` and `Budget.name`.
- `docs/core/00-governance/decisions/DEC-0148-PR-BOUNDED-DRAFT-LOOKUPS.md` — server-owned, bounded Purchase Request draft lookup contract.
- `docs/core/00-governance/decisions/DEC-0215-PR-DRAFT-LOOKUP-SELECTED-SCOPE-HARDENING.md` — selected budget-line lookup controls; it does not settle the parent-relation disclosure safeguard or brand/location policy.
- Parent-led independent security, backend, and QA review conclusion, 2026-07-29 — HIGH PUBLIC_BOUNDARY classification and required parent tenant/company predicate.
- Model availability note: closest permitted GPT-5.6 fallback was used because the requested Code Spark/GPT-5.4 agents were unavailable.

## Supersession

Not superseded. This record does not supersede `DEC-0148` or `DEC-0215`; it adds a parent-relation no-disclosure safeguard and records the remaining policy boundary.
