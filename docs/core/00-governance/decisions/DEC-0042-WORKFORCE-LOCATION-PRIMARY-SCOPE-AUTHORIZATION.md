# DEC-0042 — Workforce Location-Primary Scope Authorization

## Metadata

- Decision ID: `DEC-0042`
- Title: Workforce Location-Primary Scope Authorization
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-004 workforce authorization
- Related decision brief: `SPF004-WORKFORCE-SCOPE`

## Decision

For current location-bound workforce records, authorization requires a live workforce capability, tenant and company equality, and an exact active `LOCATION` scope assignment. A populated brand must equal the authoritative location's `brandId` as an integrity condition, while a populated department must be active and belong to the same tenant and company but does not require a redundant `DEPARTMENT` assignment under the current scope model.

Locationless company workforce records require explicit `COMPANY`/`MANAGE` authority. Project-linked records additionally require native project authorization, and location authority never substitutes for restricted-project membership. Confidential fields require a live confidential capability. These rules must be applied through one centralized workforce authorization resolver across read, list, detail, write, approval, export, and evidence boundaries.

## Context

SPF-004 requires executable proof that workforce access is enforced consistently across permission, organizational scope, confidential data, restricted projects, exports, and evidence. Existing workforce records can carry location, brand, department, project, and confidential-data context, but current scope assignments are not bound to individual workforce permissions. Inferring a department restriction from the mere presence or absence of an unrelated department assignment would therefore make authorization unstable: an unrelated assignment could unexpectedly remove valid access, while a missing assignment could unexpectedly broaden access.

The Decision Chair confirmed the constrained location-primary rule after independent Architecture and Security analysis and a targeted challenge round. Both challengers rated ambiguity in the department rule as **Blocking**, but converged that the system must not infer department compartmentalization from the current generic assignment model. Exact department compartmentalization remains a future policy and schema decision requiring explicit workforce scope intent or a defined role/permission-to-scope binding.

## Options considered

### Option A — selected: constrained location-primary authorization

- Summary: Require live capability, tenant/company equality, and exact active location scope for location-bound records. Treat brand and department references as integrity constraints, not alternate access paths. Require company management authority for locationless records, native project authorization for project-linked records, and a separate live capability for confidential fields.
- Benefits: Matches the authoritative operational location, denies same-brand access to other locations, remains deterministic under the current assignment model, preserves restricted-project and confidentiality boundaries, and can be centralized without a schema change.
- Failure modes: Authorization drift if individual services bypass the resolver; stale permissions or scope assignments if session snapshots are trusted; records with mismatched location/brand/department relationships; or accidental treatment of location scope as restricted-project membership.
- Why selected or rejected: Selected because it satisfies the applicable hard gates without inventing a department policy that the current schema cannot express reliably.

### Option B — rejected: conditionally narrow by any department assignment

- Summary: Require an exact department assignment only when the user has one or more department assignments; otherwise allow access through location scope alone.
- Benefits: Appears to add department-level narrowing without schema work and may approximate some departmental operating patterns.
- Failure modes: An unrelated department assignment can reduce otherwise valid location access; removal or absence of an assignment can broaden access; generic assignments are not tied to workforce permissions; and equivalent users can receive different results for reasons unrelated to the workforce action.
- Why selected or rejected: Rejected. The rule is non-monotonic, not grounded in an approved workforce policy, and was identified as a blocking ambiguity by both challengers.

### Option C — deferred: exact department compartmentalization

- Summary: Require an exact active `DEPARTMENT` assignment whenever a workforce record has a department, in addition to location scope.
- Benefits: Provides a clear department privacy boundary and may be appropriate for future HR specialization or departmental casework.
- Failure modes: Current scope assignments do not declare workforce-specific intent or bind a role/permission to a scope assignment, so enforcement could deny legitimate branch workforce operations and silently create a new authority policy. It would also require migration, backfill, role design, and operational adoption decisions.
- Why selected or rejected: Not selected for the current implementation. Exact department compartmentalization remains an **OPEN future policy/schema decision** and may proceed only after explicit workforce scope intent or role/permission-to-scope binding is approved. This record does not resolve that future decision.

## Hard-gate assessment

- **Tenant and company isolation:** Every workforce resolution must compare the source record, authoritative related entities, and session against the same tenant and company. No scope assignment can cross those boundaries.
- **Server-enforced authorization:** Capability and scope are resolved from current persisted grants and active assignments at the service/data-access boundary. UI visibility and session-cached permission codes are not authorization evidence.
- **Location isolation:** A location-bound record requires an exact active location assignment. Brand, department, company membership without `COMPANY`/`MANAGE`, and same-brand access to another location do not substitute.
- **Reference integrity:** A populated brand must match the authoritative location's brand. A populated department must be active and belong to the same tenant and company. A mismatch is denied as an integrity failure, not evaluated as another route to access.
- **Project isolation:** Project-linked records require the native project authorization contract. Restricted projects still require explicit membership, exact project scope, or the separately approved project-management override; location access never substitutes.
- **Confidentiality:** Ordinary workforce access does not disclose confidential fields. The resolver must revalidate the applicable confidential capability before returning or exporting those fields or their evidence.
- **Money, inventory, and segregation controls:** This decision grants no payroll, payment, finance, inventory, or self-approval authority and does not weaken approval segregation.
- **Recovery and rollback:** The decision requires no data migration. A centralized resolver and its call sites can be reverted without changing source records; authorization audit evidence must remain preserved.

## Required safeguards

- Implement one fail-closed workforce authorization resolver and use it for list, detail, create/update, workflow actions, approvals, exports, evidence upload/list/preview/download/archive/replacement, and any direct route or API boundary.
- Resolve live permission grants and active, effective-dated scope assignments for every protected request. Do not authorize from UI state or a stale session permission snapshot.
- Require exact active `LOCATION` scope for location-bound records; explicitly test that a same-brand assignment at another location is denied.
- Resolve brand through the authoritative location. If a workforce record also stores a brand, deny when it differs from `Location.brandId`; never use that brand as an alternate access path.
- Validate a populated department as active and in the same tenant/company. Do not require or infer a department assignment until a separate confirmed decision establishes department compartmentalization.
- Require explicit `COMPANY`/`MANAGE` for locationless company workforce records; lower company access levels and brand/department/location assignments do not substitute.
- Apply native project authorization in addition to workforce scope for project-linked records, including restricted-project membership and management-override tests.
- Revalidate the confidential capability independently for confidential profile fields, compliance details, evidence, and exports. Redact or deny according to the boundary's declared disclosure contract.
- Use non-enumerating denial behavior where record existence or confidential evidence must be concealed. Denied writes must prove no business mutation occurred; required security audit events are asserted separately.
- Add paired allowed/denied database fixtures for tenant, company, exact/other location, same-brand other location, brand-integrity mismatch, inactive/cross-company department, locationless records, confidential access, native project access, and restricted projects.
- Bind the centralized resolver and its executable cases into the DEC-0041 authorization manifest and exact-SHA CI evidence.
- Open a new material decision before introducing department-specific workforce assignments, role/permission-to-scope binding, schema fields, backfill, or migration work.

## Implementation and documentation impact

- Code / architecture: Centralize workforce permission, location, integrity, project, and confidentiality resolution and remove duplicated or divergent authorization predicates from workforce services, routes, exports, approvals, and evidence adapters.
- Data / schema: No schema change, migration, or backfill is authorized by this decision. Existing location, brand, department, project, and scope-assignment relationships are validated as described.
- Workflow / permissions: No new permission grant is created. Live workforce permissions remain capability gates; exact location assignment defines the operating boundary for current location-bound records; explicit company management authority is required for locationless records.
- UI / mobile: UI filtering may mirror the resolver for usability but cannot replace it. Denied or redacted states must not reveal confidential fields or record existence beyond the declared disclosure contract.
- Reporting: Workforce exports must use the same resolver and confidentiality rules as interactive reads. No report definition or payroll authority changes.
- Knowledge base / training: Dunong should assess workforce access troubleshooting and manager guidance once the centralized behavior is implemented and user-visible denial/redaction wording is confirmed. This record itself does not authorize new user-facing policy text.
- Tests / UAT: Add database-backed service/route negative tests and UAT coverage for exact-location access, same-brand other-location denial, reference-integrity failures, locationless company management, confidential redaction, project authorization, restricted-project denial, and denied-write no mutation.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and adopt the centralized workforce authorization resolver across every protected boundary | Engineering | SPF-004 implementation | Pending |
| Add the paired database/service/route cases and authorization-manifest bindings required by this record | Engineering + QA + Security | Before SPF-004 closure | Pending |
| Verify user-visible denial, redaction, export, and evidence behavior and prepare the appropriate knowledge-base handoff | Dunong + QA | After implementation behavior is stable | Pending |
| Deliberate explicit department compartmentalization and any supporting schema only if workforce policy requires it | Decision Chair + Product + Security + Architecture | Future policy trigger | Open future decision |

## Evidence

- Parent Decision Chair confirmation dated 2026-07-21 for decision brief `SPF004-WORKFORCE-SCOPE` after independent Architecture and Security analysis and challenge convergence. Both challengers rated ambiguity Blocking and converged against inferred department narrowing.
- `docs/core/00-governance/decisions/DEC-0041-RISK-BASED-EXECUTABLE-AUTHORIZATION-MATRIX.md` — requires live database/service/route evidence, high-risk negative coverage, source-record evidence authorization, non-disclosure, and denied-write no-mutation proof.
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md` — role defines capability, assignment defines scope, least privilege applies, users may hold multiple scope assignments, and confidential HR data requires separate access.
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md` — server-side sensitive-scope enforcement and permission-checked access to confidential source records and attachments.
- `docs/core/03-data/ERP_DATA_DICTIONARY.md` — current workforce records are tenant/company/location scoped; employee assignments carry effective-dated location, brand, and department relationships; compliance details and workforce evidence require protected handling.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` — SPF-004 requires location/department scope, confidential workforce access, restricted-project membership, and cross-scope denial evidence.
- `docs/phases/phase-03-finance-and-workforce/quality/PHASE3_UAT_SCENARIOS.md` — workforce UAT requires scoped access, privacy redaction, export scope filters, and no unresolved employee-privacy or organizational-scope defects.
- `apps/web/src/server/services/authorization.ts`, `apps/web/src/server/services/workforce.ts`, `apps/web/src/server/services/attachments.ts`, and `apps/web/src/server/services/projects.ts` — implementation boundaries to be aligned with the centralized contract.

## Reversibility and supersession

This decision is not superseded. Because it introduces no schema or data migration, its implementation is reversible at the application layer while preserved audit records remain intact. A later decision may add exact department compartmentalization or change the location-primary rule only if it explicitly supersedes DEC-0042, defines workforce-specific scope intent, addresses migration and backfill, and continues to satisfy tenant/company isolation, live permission, restricted-project, confidentiality, non-disclosure, and denied-write no-mutation gates.
