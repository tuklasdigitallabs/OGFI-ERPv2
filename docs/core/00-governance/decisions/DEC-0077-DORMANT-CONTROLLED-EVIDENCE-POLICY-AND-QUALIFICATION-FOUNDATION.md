# DEC-0077 — Dormant Controlled-Evidence Policy and Qualification Foundation

## Metadata

- Decision ID: `DEC-0077`
- Title: Dormant Controlled-Evidence Policy and Qualification Foundation
- Status: `Implemented dormant checkpoint — PostgreSQL execution, policy approval, real integration, and activation pending`
- Date: 2026-07-24
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — controlled-evidence qualification for high-risk actions
- Related decision brief: Parent-led dormant controlled-evidence foundation deliberation, 2026-07-24

## Decision

Select Option A1: build a **dormant, policy-empty** controlled-evidence qualification foundation consisting of immutable `ControlledEvidencePolicyVersion` records, a scoped active-version pointer with versioned activation provenance, immutable `ControlledEvidenceActionQualification` facts and immutable selected-evidence rows, plus one generic transaction-bound qualification service. The action-adapter registry starts empty and there will be no policy rows, seed/default policy, policy publisher, administration UI, or real action integration.

The feature flag remains `false`. With no registered adapter or active approved policy, the service fails closed and writes no qualification. `CompanyPolicySetting` is not authority for controlled-evidence qualification. `DEC-0047` remains `OPEN`; this record confirms only a reversible technical foundation and does not approve evidence policy or any production action.

## Context

High-risk finance actions must eventually prove that specifically selected controlled evidence satisfies an approved action policy inside the same transaction as the action. Legacy `evidenceReference` text is supplemental and cannot prove a clean, durable, available immutable object version. The necessary policy matrix—artifact types, purposes, counts, thresholds, selection rules, and outage handling—has not been approved by the responsible humans.

Fully deferring the technical boundary leaves transaction, lineage, privilege, and append-only design risks unresolved. Hardcoding one action or treating a mutable generic setting as policy authority would prematurely create production semantics. The selected foundation therefore proves only the policy-neutral contract while remaining incapable of qualifying a real action.

## Options considered

### Option A1 — selected: dormant immutable policy and qualification foundation

- Summary: Add immutable versioned policy/qualification structures and a generic supplied-transaction service, but ship an empty adapter registry and no active policy, defaults, seed, publisher, UI, or real action call site.
- Benefits: Establishes scoped lineage, append-only history, exact lock/readiness order, least privilege, deterministic hashing, and atomic qualification without inventing business policy; remains safely reversible behind a false flag.
- Failure modes: A default or seed may accidentally become de facto policy; an adapter may register before human approval; runtime may receive mutation authority over policy; or synthetic fixtures may be misrepresented as production qualification.
- Why selected or rejected: Selected because it advances the integrity boundary while structurally preventing real action qualification until separately approved policy and adapters exist.

### Option B — rejected: hardcode a controlled-evidence link into one finance action

- Summary: Require one existing active attachment link in a selected action without a versioned policy/qualification model.
- Benefits: Short implementation path for one workflow.
- Failure modes: Encodes an unapproved purpose/count rule, omits reusable policy provenance, and cannot prove what exact approved rule the actor satisfied.
- Why selected or rejected: Rejected because action-specific convenience cannot replace the open `DEC-0047` policy or immutable qualification evidence.

### Option C — rejected: defer all work until policy approval

- Summary: Make no schema, service, or contract change until Finance, Operations, Security, and Release approve the complete policy matrix.
- Benefits: Avoids dormant schema and code.
- Failure modes: Defers database lineage, privilege, locking, atomicity, and test-contract risks and may force them into the later activation change.
- Why selected or rejected: Rejected because a deliberately inert foundation can prove those controls without choosing policy.

### Option D — rejected: use mutable `CompanyPolicySetting` as qualification authority

- Summary: Read generic company settings at action time as the evidence rule.
- Benefits: Reuses an existing settings surface.
- Failure modes: Mutable values do not preserve immutable policy-version provenance, controlled activation, action-specific schema, or historical replay; generic editors could silently change a high-risk gate.
- Why selected or rejected: Rejected. `CompanyPolicySetting` may never be treated as qualification authority.

### Option E — rejected: policyless prototype wired to real actions

- Summary: Register real action adapters against a synthetic or implicit rule until policy is approved.
- Benefits: Exercises end-to-end call sites early.
- Failure modes: Converts test assumptions into live semantics, permits policy-free qualification, and makes rollback/data interpretation unsafe.
- Why selected or rejected: Rejected because synthetic contract proof is not policy approval and must never authorize a real action.

## Hard-gate assessment

- **Tenant/company/scope isolation:** Every policy version, active pointer, qualification, selection, attachment, scan fact, and controlled-evidence link uses tenant/company-qualified foreign keys and source/action lineage. A caller-supplied ID is never scope authority.
- **Server-enforced authorization:** The generic service runs only inside a caller-supplied transaction after the source is already locked and authorized. An empty registry, missing active policy, disabled flag, or incomplete readiness state fails closed.
- **Approval segregation:** Qualification proves evidence only; it does not approve, review, post, pay, release, or bypass actor/scope/segregation controls. Future adapter policy must preserve the action's independent authority checks.
- **Audit and evidence integrity:** Policy versions, qualifications, and selections are append-only. Each qualification binds exact policy version, action/source, actor, selected link/attachment, object version, checksum, readiness facts, and deterministic payload hash. Activation records actor, time, reason, prior/new version, and pointer version.
- **Transactional consistency/idempotency:** Qualification shares the real action transaction. There is no network call inside that transaction. Deterministic keys/hashes and uniqueness must produce one fact or a safe conflict, never overwrite history.
- **Phase scope:** No policy value, real action adapter, UI, publisher, seed, default, or production behavior is authorized. Legacy text remains supplemental.
- **Recovery/rollback:** The flag stays false and the registry/policy tables start empty. No production row requires interpretation or cleanup. Committed append-only facts may never be deleted as rollback.

## Required safeguards

- Keep `ControlledEvidencePolicyVersion` immutable and tenant/company/action scoped. Use a separate scoped active pointer with compare-and-swap versioning and immutable activation provenance; runtime receives `SELECT` only over policy state and cannot publish or activate policy.
- Keep `ControlledEvidenceActionQualification` and its selection rows immutable with scoped foreign keys, exact source/action/policy lineage, actor and activation provenance, deterministic version/hash/idempotency fields, and database denial of update, delete, or truncate. Runtime privilege is the minimum `SELECT`/`INSERT` required for qualification; it receives no destructive privilege.
- Ship no policy rows, seed/default policy, publisher, UI, real action adapter, or implicit fallback. The adapter registry is closed and empty. Unknown or unregistered actions fail closed before any write.
- Use one supplied transaction. The caller must already hold the exact source lock. Then lock/read in this order: active policy pointer/version; selected `Attachment` rows sorted by ID; exact scan facts; active controlled-evidence links sorted by ID; then append the qualification and sorted selections. Do not re-lock the source or call external storage/scanner/network services inside the transaction.
- Require each selection to prove the exact immutable object is `VERIFIED`, `CLEAN`, `AVAILABLE`, and `DURABLE`, with matching object version and checksum across the attachment, qualifying scan fact, and captured selection. Missing, stale, archived, replaced, mismatched, indeterminate, or non-clean evidence fails closed.
- Treat legacy/free-text evidence references as supplemental audit context only. They cannot satisfy policy, readiness, selection, or qualification.
- Synthetic/test-only policy and adapter fixtures may prove the generic contract, locking, append-only rules, and rollback. They must be clearly test-only, absent from production seed/runtime configuration, and never cited as policy approval, action readiness, or activation evidence.
- Keep the feature flag false. Disposable-PostgreSQL execution, independent implementation review, approved human policy, real-adapter deliberation, exact-candidate authorization/E2E, hosted evidence/recovery controls, and Release acceptance remain mandatory before activation.

## Implementation and documentation impact

- Code / architecture: Add a generic supplied-transaction qualifier and closed empty adapter registry. No real action invocation is authorized.
- Data / schema: Add immutable policy-version, active-pointer/activation-provenance, qualification, and selection structures with scoped keys, hashes, version guards, append-only enforcement, and least-privilege role reconciliation. Concrete implementation requires a reviewed migration and data-dictionary update.
- Workflow / permissions: No role, action, approval, or evidence rule changes. `DEC-0047` stays open.
- UI / mobile: No settings, selection, qualification, or action UI.
- Reporting: No production report or readiness metric.
- Knowledge base / training: No user-facing change while the foundation is dormant and inaccessible.
- Tests / UAT: Synthetic contract tests may cover exact readiness, lock order, scope denial, stale versions, hash/idempotency, append-only denial, rollback, privilege denial, empty-registry behavior, and absence of real integration. PostgreSQL behavioral execution is required but is not policy evidence.

## Human policy blockers

Before any policy row, publisher, real adapter, UI, or production activation, authorized Finance/Operations/Security/Release owners must approve: the closed source/action matrix; allowed artifact types and purposes; minimum/maximum selection count; value/risk/materiality thresholds; actor selection/acknowledgment rules; exception, outage, stale-scan, and indeterminate handling; policy publisher/activation authority and segregation; effective-version/in-flight-action behavior; legacy/backfill treatment; audit/reporting needs; and hosted recovery plus acceptance criteria.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and review the dormant schema, database guards, privileges, empty registry, and generic transaction-bound service | Database + Backend + Security | Before dormant checkpoint acceptance | Complete for dormant source checkpoint |
| Execute synthetic contract and disposable-PostgreSQL concurrency/rollback/privilege evidence | QA + Database + Security | Before foundation acceptance | Pending / PostgreSQL NO-GO |
| Resolve the human `DEC-0047` matrix and activation authorities | Finance + Operations + Security + Release | Before any policy publication or real adapter | Open blocker |
| Deliberate each real action adapter and visible selection workflow | Product Governance + affected specialists | After policy approval | Not authorized |
| Keep feature disabled until exact-candidate hosted and release gates pass | Release Management | Before activation | Activation NO-GO |

## Evidence

- The Decision Chair confirmed Option A1 on 2026-07-24 after independent Product, Architecture, and Security analysis reached consensus. A targeted Architecture challenge tested whether an empty policy/adapter registry was useful or an unsafe policyless prototype; it accepted the foundation only with no seed/default/publisher/UI/real integration, fail-closed operation, exact transaction locks, and explicit separation of synthetic proof from policy approval.
- Requested GPT-5.3 Codex Spark and `gpt-5.4` models were unavailable in the active toolset. The closest permitted GPT-5.6 specialist fallback was used without relaxing any deliberation or hard gate.
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md` records `DEC-0047` as open for the action/artifact/purpose/count/threshold/outage/selection policy and prohibits legacy text from satisfying high-risk evidence gates.
- `DEC-0046-CONTROLLED-EVIDENCE-ON-HOSTINGER-VPS.md` confirms exact immutable version/checksum, scan, availability, preservation, authorization, and hosted recovery controls for controlled evidence.
- `DEC-0051` and `DEC-0052` require transaction-bound exact evidence selection/qualification and keep affected actions/routing disabled while `DEC-0047` remains unresolved.
- The dormant implementation adds immutable policy versions and activation events, a scoped compare-and-swap active pointer, immutable qualification/selection facts, exact tenant/company/action/source/actor/session/approval/evidence lineage, database-authoritative canonical hashes and policy cardinality, commit-time evidence readiness revalidation, role reconciliation/verifiers, and a generic supplied-transaction qualifier. It adds no production policy, adapter, call site, endpoint, UI, report, publisher, seed, or default.
- Focused evidence passes 8 qualifier tests, 7 database contract tests, Prisma validation, routine/trigger integrity verification, and `git diff --check`. The full candidate passes lint, typecheck, production build, 1,252 web tests, 34 database tests, one worker test, the 20-case authorization manifest, 8 database-role tool tests, secret review, release-tool self-tests, and the 127-migration inventory; migration `20260724010000_controlled_evidence_qualification_foundation` is recorded as `APPROVED_FOR_REHEARSAL`, not production approved. The exact suite discovers 23 PostgreSQL cases but cannot execute without `DISPOSABLE_DATABASE_ADMIN_URL`; migration, trigger, concurrency, rollback, runtime-role, and deferred-constraint behavior therefore remain unaccepted.
- Independent Architecture, Security, and QA reviews returned GO only for committing this unreachable dormant checkpoint. Requested Spark/GPT-5.4 models were unavailable, so the permitted GPT-5.6 specialist fallback was used and recorded. PostgreSQL behavioral acceptance, policy approval, action readiness, hosted recovery, and activation remain **NO-GO**.

## Supersession

This decision is not superseded. It supplements `DEC-0046`, `DEC-0051`, and `DEC-0052` with a dormant policy-neutral technical boundary and does not resolve or supersede open `DEC-0047`. A later decision must explicitly confirm human policy and each real action adapter before any production qualification path exists.
