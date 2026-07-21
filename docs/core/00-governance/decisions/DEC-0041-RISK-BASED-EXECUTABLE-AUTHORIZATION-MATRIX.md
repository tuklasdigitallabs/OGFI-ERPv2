# DEC-0041 — Risk-Based Executable Authorization Matrix

## Metadata

- Decision ID: `DEC-0041`
- Title: Risk-Based Executable Authorization Matrix
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-004 authorization regression gate
- Related decision brief: Parent-confirmed SPF-004 decision after independent Security, Architecture, QA, and Software Audit review

## Decision

SPF-004 will use **Option B: a machine-enforced, risk-based executable authorization matrix**. A manifest must classify every protected service, action, page, route, export, and download by required permission, applicable scope dimensions, guard chain, disclosure/denial contract, risk tier, and executable test IDs; static discovery must fail when a protected surface is unclassified.

Runtime verification must use the real database, service, and route boundaries. Negative tests must cover every distinct authorization adapter and every high-risk boundary, while lower-risk surfaces may share representative executable cases only when the manifest proves they use the same adapter and authorization contract.

## Context

SPF-004 must provide release evidence that tenant, company, brand, location, department, project-membership, restricted-project, and direct route/API boundaries are enforced. Existing authorization logic spans multiple surface types and adapter paths, so a static inventory alone cannot prove runtime denial, non-disclosure, or absence of mutation. Conversely, exhaustively testing every theoretical role-and-scope permutation across every surface would be disproportionate, slow, and prone to brittle or low-signal failures.

The selected approach makes coverage explicit and machine-checkable without creating a second authorization model. The production services and data-access guards remain authoritative; the manifest describes their expected contract and binds each protected surface to executable evidence. The independent Security, Architecture, QA, and Software Audit reviewers unanimously recommended this option. Their agreement is supporting evidence rather than a vote; the Decision Chair confirmed the conclusion after applying the hard gates.

## Options considered

### Option A — rejected: static authorization inventory only

- Summary: Discover protected surfaces and check that each has a declared permission or guard reference, without exercising the authorization boundary against a real database and service/route path.
- Benefits: Fast, deterministic, inexpensive to maintain, and useful for detecting unclassified surfaces.
- Failure modes: A declared guard may be absent at runtime, called with the wrong scope, bypassed by an adapter, return over-disclosing errors, permit a denied mutation, or authorize stale/incorrect relationships. Static declarations cannot prove database-backed tenant and scope isolation.
- Why selected or rejected: Rejected because it fails the runtime server-authorization hard gate. Static discovery remains required as one layer of Option B.

### Option B — selected: risk-based executable authorization matrix

- Summary: Maintain a machine-readable manifest of every protected surface and bind its permission, scope dimensions, guard chain, disclosure/denial contract, risk tier, and executable test IDs to static discovery plus real database/service/route negative tests.
- Benefits: Detects unclassified surfaces, proves each distinct authorization adapter, concentrates exhaustive coverage on high-risk boundaries, provides traceable release evidence, and scales as protected surfaces are added.
- Failure modes: Manifest drift; incorrect risk classification; several apparently similar surfaces using materially different guard behavior; tests that silently use a developer database; incomplete cross-scope fixtures; route tests that assert only status codes; or evidence generated from a different commit than the release candidate.
- Why selected or rejected: Selected because it satisfies the runtime hard gate while balancing coverage, maintainability, execution time, and auditability. Its failure modes are controlled by mandatory discovery, sentinel, fixture, denial, mutation, and exact-SHA safeguards.

### Option C — rejected: exhaustive tests for all role, scope, surface, and data permutations

- Summary: Execute every authorization combination across every protected surface and all supported scope dimensions.
- Benefits: Maximizes theoretical permutation coverage and may reveal unexpected interactions.
- Failure modes: Combinatorial growth, excessive CI duration, fixture complexity, flaky tests, duplicated low-signal cases, and maintenance effort that can obscure genuinely high-risk failures.
- Why selected or rejected: Rejected as disproportionate for the full application. Exhaustive negative coverage is still required for high-risk boundaries; representative coverage is allowed elsewhere only under an explicitly classified shared adapter and contract.

### Option D — rejected: defer the authorization regression gate

- Summary: Continue delivery without a machine-enforced authorization inventory and runtime regression gate.
- Benefits: No immediate implementation or CI cost.
- Failure modes: Cross-tenant or cross-scope access, direct route/API bypass, restricted-project disclosure, unauthorized evidence download, denied-write mutation, and release claims without reproducible authorization evidence.
- Why selected or rejected: Rejected because it fails the tenant-isolation and server-enforced authorization hard gates and leaves SPF-004 unresolved.

## Hard-gate assessment

- **Tenant and organizational isolation:** Paired negative fixtures must prove tenant, company, brand, location, and department isolation at the real persistence and request boundaries. The manifest declares which dimensions apply to each surface; omission of an applicable dimension is a review failure.
- **Server-enforced authorization:** Static discovery and manifest declarations do not substitute for runtime checks. Every distinct authorization adapter and every high-risk boundary requires real database/service/route negative evidence.
- **Project isolation:** Project access must exercise membership, exact project scope, restricted-project state, and the narrowly authorized project-management override. Broad brand, location, or department access alone never opens a restricted project.
- **Segregation, inventory, and money controls:** Surfaces that approve, post, reverse, export, download evidence for, or otherwise expose controlled financial or inventory records are high risk and require exhaustive applicable negative cases. The matrix cannot weaken self-approval, immutable-ledger, audit, transactional, or idempotency rules.
- **Non-disclosure and mutation safety:** Denials must use the declared stable `401`, `403`, or non-enumerating unavailable contract as appropriate. Denied writes must leave persistent state unchanged.
- **Phase and architecture fit:** The matrix verifies existing modular-monolith service and route authorization. It does not add a second role/scope engine or expand phase scope.
- **Recovery and rollback:** The manifest, discovery checks, tests, and CI gate are application/repository controls and can be corrected or reverted without modifying production business data. A newly discovered data-representation gap cannot be patched into this decision and requires separate deliberation.

## Required safeguards

- Maintain a machine-readable authorization manifest that classifies every protected service, action, page, route, export, and download with:
  - stable surface identity and surface type;
  - required permission;
  - applicable tenant, company, brand, location, department, project, membership, and restricted-project dimensions;
  - complete guard/adapter chain;
  - expected authentication, denial, and non-disclosure contract;
  - risk tier; and
  - executable test IDs.
- Run static discovery in CI and fail when a protected surface is missing from the manifest, when a manifest entry has no discovered surface, or when its required classification or executable evidence link is incomplete.
- Require real database, service, and route negative tests for every distinct authorization adapter and every high-risk boundary. Do not satisfy this requirement with mocks of the guard under test.
- Treat controlled writes, approvals, inventory or financial effects, user/role/scope administration, restricted-project access, exports, evidence access, and comparable sensitive disclosures as high-risk boundaries. Cover all applicable negative scope and authority cases for each such boundary.
- Use an explicit disposable-database sentinel for database-backed authorization tests. Tests must fail before execution unless the sentinel and isolated database identity are present; there must be no generic `.env` fallback or silent skip path.
- Build paired allowed/denied fixtures across tenant, company, brand, location, department, and project dimensions, including deliberately overlapping identifiers or relationships where useful to expose missing predicates.
- For a restricted project, permit access only through explicit project membership, an exact `PROJECT` scope assignment, or `projectManage` together with `COMPANY`/`MANAGE` authority for that company. Broad brand, location, or department scope alone must never grant restricted-project access.
- Declare and test the disclosure contract for each boundary: unauthenticated requests return stable `401`; authenticated but disallowed requests return stable `403` or a non-enumerating unavailable response where record existence must be concealed. User-visible and API responses must not leak internal guard or database detail.
- For every denied write, compare relevant persistent state before and after the attempt and prove no business mutation, inventory movement, workflow transition, evidence change, or unauthorized audit side effect occurred. Required denial/security audit events may be asserted separately where policy requires them.
- Authorize evidence preview and download through the linked source record's current permission and scope rules. Possession of an attachment identifier, project/task visibility, or a previously issued UI link must not grant evidence access.
- Make the authorization regression suite a required CI release gate. Evidence must identify the exact source commit SHA, manifest version or checksum, test command/result, database sentinel/environment identity, and retained artifact/run reference.
- Require review when a surface changes adapter, permission, scope dimensions, denial contract, or risk tier. A newly discovered representation or schema gap requires a separate material decision before schema work begins.

## Implementation and documentation impact

- Code / architecture: Add the executable manifest, protected-surface discovery, adapter classification, negative-test harness, and CI enforcement. Existing server-side authorization remains the source of truth; the matrix must not become a parallel permission engine.
- Data / schema: No schema migration is expected. Any discovered inability to represent a required authorization relationship or scope must be raised as a separate decision before schema or data-model changes.
- Workflow / permissions: No permission grant, role policy, or scope-expansion change is authorized. The matrix codifies and verifies current permission and scope contracts, including the restricted-project rule stated in this record.
- UI / mobile: Protected pages and actions must be included in discovery and tied to their server-enforced contract. UI hiding alone does not satisfy a manifest entry or executable test.
- Reporting: Exports and downloads are protected surfaces and must declare scope, disclosure, and source-record authorization behavior. No report definition changes are authorized.
- Knowledge base / training: No Dunong handoff is required for this internal verification control because it introduces no end-user workflow, navigation, terminology, or authority change. A future user-visible denial or access workflow change must be handed off separately.
- Tests / UAT: Add static completeness tests, real database adapter tests, service and direct-route/API negatives, high-risk exhaustive cases, denial/no-mutation assertions, source-record evidence tests, and exact-SHA CI evidence. This control is engineering release evidence rather than a substitute for role-based UAT.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the machine-readable manifest and protected-surface discovery with fail-closed completeness checks | Engineering | SPF-004 implementation | Pending |
| Define risk tiers, distinct authorization adapters, disclosure contracts, and executable test IDs for every discovered protected surface | Security + Architecture + Engineering | Before SPF-004 gate execution | Pending |
| Add disposable-database sentinel controls and paired cross-scope fixtures with no generic `.env` fallback | Engineering + QA | Before database-backed tests run in CI | Pending |
| Add real database/service/route negative tests, exhaustive high-risk cases, denied-write no-mutation checks, and evidence source-record authorization tests | Engineering + QA + Security | Before SPF-004 closure | Pending |
| Make the suite a required CI gate and retain exact-SHA manifest and execution evidence | DevOps + Release | Before SPF-004 closure | Pending |
| Open a separate decision if implementation discovers a permission/scope representation or schema gap | Decision Chair | On discovery | Conditional |

## Evidence

- The Decision Chair confirmed Option B on 2026-07-21 after unanimous independent Security, Architecture, QA, and Software Audit round-one review. The council identified static-only verification and deferral as hard-gate failures, and exhaustive all-permutation testing as disproportionate except at high-risk boundaries.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` — SPF-004 requires tenant, company, brand, location, department, project-membership, restricted-project, and direct route/API enforcement evidence.
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md` — role defines capability, assignment defines scope, permissions are server-enforced, and restricted projects require explicit project membership or authorized project-administrator scope rather than broad branch or department access.
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md` — sensitive scope is validated server-side; project access uses company scope, project scope, membership, role, and restricted-project state; attachments require source-record permission and scope checks.
- `docs/phases/phase-01-5-projects-implementation/PROJECTS_IMPLEMENTATION_PRODUCT_SPEC.md` — restricted projects require explicit membership or authorized project-administrator scope.
- `AGENTS.md` — tenant/company ownership, explicit role-plus-scope authorization, server-side enforcement, restricted-project access, source-record controls, and required testing rules.

## Supersession

This decision is not superseded. A later record may replace the risk model, manifest contract, or coverage strategy only if it explicitly supersedes DEC-0041 and continues to satisfy runtime tenant/scope isolation, restricted-project, denial/no-mutation, source-record authorization, CI, and exact-SHA evidence gates.
