# DEC-0253 — Source-Only Controller Integrity and Recovery Closure

## Metadata

- Decision ID: `DEC-0253`
- Title: Source-Only Controller Integrity and Recovery Closure
- Status: `Confirmed — source-only controller-integrity phase; no operational activation or release credit`
- Date: 2026-07-29
- Decision owner: Shared Production Foundation / controlled release controller
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations — DEC-0248 recovery controller follow-on
- Related decisions: `DEC-0038`, `DEC-0039`, `DEC-0248`, `DEC-0249`, `DEC-0250`, `DEC-0252`
- Related decision brief: Parent-confirmed controller-integrity and recovery-closure deliberation

## Decision

The next DEC-0248 phase is limited to source-only controller integrity and
recovery closure before identity/cutover work. It must admit a versioned,
immutable artifact manifest that binds one approved candidate to keyed service
image digests, the exact Compose inputs, and the identity manifest; validate
phase-journal structure and history fail-closed; and provide no operational
release authority.

An actual maintenance actuator remains a future required capability. It is not
enabled, invoked, or credited by this phase. This decision authorizes neither
Docker/Compose execution nor any host, database, edge, identity, or release
operation.

## Context

DEC-0248 requires a single fenced release authority, immutable artifact and
Compose binding, and durable same-fence recovery. Before identity/cutover work
can be considered, the source controller must reject ambiguous candidate input
and unsafe recovery history rather than inferring state from mutable files or
partially written journal records.

The immediate control problem is therefore source-level admission and recovery
classification, not deployment execution. A candidate manifest needs a
versioned immutable schema and must bind the approved candidate to each named
service's image digest, the exact Compose material, and the identity manifest.
Recovery must prove its journal has an allowed structure, monotonic/history-safe
transitions, and internally consistent predecessor/candidate lineage. Any
missing, duplicate, malformed, unknown-version, non-canonical, out-of-order,
or contradictory record must fail closed.

The council sequenced this work before identity/cutover because identity and
cutover assertions would otherwise be evaluated against inputs or recovery
history that the controller could not safely admit. Requested Code Spark and
GPT-5.4 specialists were unavailable; the parent used the closest available
GPT-5.6 fallback for the bounded deliberation. That execution fallback changed
neither the decision scope nor its hard gates.

## Options considered

### Option A — selected: source-only immutable-manifest admission and fail-closed journal integrity

- Summary: Add controller source contracts that validate a versioned immutable
  artifact manifest, including keyed service-image digest, Compose, and identity
  manifest bindings; validate journal structure and complete permitted history;
  and classify any ambiguity as an unrecoverable source state.
- Benefits: Establishes deterministic candidate attribution and recovery input
  integrity before higher-risk identity and cutover work. It is unit-testable
  without live infrastructure and prevents permissive recovery from guessing.
- Failure modes: An underspecified manifest canonicalization rule, incomplete
  journal state machine, or permissive parser could still accept mismatched or
  fabricated inputs. Source checks alone can be mistaken for host evidence.
- Why selected: It closes the prerequisite controller-integrity boundary while
  preserving DEC-0248's requirement for separately implemented and evidenced
  release, recovery, and rollback operations.

### Option B — rejected: begin identity/cutover implementation before integrity closure

- Summary: Add served-identity or cutover behavior while admission and recovery
  history validation remain incomplete.
- Benefits: May expose end-to-end seams sooner.
- Failure modes: A response can be bound to the wrong candidate, and recovery
  can select traffic based on malformed or contradictory history. The result can
  create misleading smoke or release evidence.
- Why rejected: It reverses the necessary control sequence and fails exact
  candidate/recovery hard gates.

### Option C — rejected: accept mutable or partially specified artifact inputs

- Summary: Permit tags, unkeyed image lists, independently supplied Compose or
  identity files, or an unversioned manifest and reconcile them at runtime.
- Benefits: Lower short-term authoring and migration effort.
- Failure modes: Image substitution, service omission/duplication, Compose
  drift, identity mismatch, and non-reproducible candidate attribution.
- Why rejected: It does not bind the complete candidate tuple required by
  DEC-0248 and cannot produce trustworthy recovery lineage.

### Option D — rejected: make journal recovery best-effort

- Summary: Tolerate malformed, truncated, duplicate, out-of-order, or unknown
  journal records and choose the most plausible predecessor/candidate.
- Benefits: Might keep traffic available after some failures.
- Failure modes: It can restore or retain an unverified candidate, discard
  evidence of a failed transition, and allow a new release after ambiguous
  recovery.
- Why rejected: Recovery must fail closed under DEC-0248; availability does not
  override state integrity.

### Option E — deferred: enable a maintenance actuator in this phase

- Summary: Implement and activate real traffic withdrawal/maintenance control
  together with source validation.
- Benefits: Could provide an executable response to unsafe recovery.
- Failure modes: Introduces host/edge authority, unsafe activation paths, and
  operational claims before Docker/Compose, edge, cutover, recovery, rollback,
  and installed-host evidence are separately complete.
- Why deferred: A real actuator is required before an operational recovery
  controller can be accepted, but its implementation and enablement are outside
  this source-only phase.

## Hard-gate assessment

- **Exact-candidate integrity:** Admission requires one declared schema version,
  immutable candidate identity, and a complete keyed service map. Every service
  image digest, Compose binding, and identity-manifest binding must match the
  same candidate; missing, extra, duplicate, tag-only, or mismatched entries are
  rejected before any future controller action.
- **Journal integrity and audit history:** Recovery accepts only a structurally
  valid, append-only, permitted phase history with consistent request,
  predecessor, candidate, artifact-manifest, and transition lineage. Unknown,
  malformed, truncated, repeated, impossible, or contradictory history is a
  fail-closed condition; it cannot be repaired by inference or silent rewrite.
- **Authorization and least authority:** This phase adds no release execution,
  host privilege, credential, maintenance, migration, snapshot, proxy, or
  identity authority. Source validation must not load or expose credentials.
- **Recovery boundary:** An unsafe journal prevents future admission/recovery
  progression. A future real maintenance actuator must be available and tested
  before any operational controller relies on this classification; no stub,
  log-only signal, or UI flag substitutes for it.
- **Topology and phase scope:** The single-host boundary and all DEC-0248/0249/
  0250 controls remain unchanged. No ERP workflow, permission, inventory,
  financial, or user-facing behavior changes.

This decision passes source-of-truth design gates only. It does not pass any
installed-host, operational recovery, or production readiness gate.

## Required safeguards

1. Define a versioned manifest schema with deterministic canonical form and
   strict rejection of unknown/ambiguous fields and unsupported versions.
2. Require an immutable approved candidate identity and an explicit keyed
   service-image map. Each service must use a content digest; mutable tags or
   unkeyed/duplicate service entries cannot satisfy admission.
3. Bind and validate the exact Compose material by immutable digest/reference
   and bind the identity manifest by immutable digest/reference in the same
   admitted artifact manifest. Do not independently discover, substitute, or
   regenerate either input during future execution.
4. Bind the manifest's candidate, service-image map, Compose binding, and
   identity-manifest binding into the journal lineage before a future externally
   visible transition. Preserve the admitted source data for safe evidence, with
   no credentials or secret material.
5. Implement a closed journal state machine with record schema/version checks,
   sequence/transition validation, unique correlation identifiers, and
   predecessor/candidate consistency checks. Reject partial writes and any
   history that lacks a provable safe terminal or recoverable state.
6. Do not rewrite, truncate, normalize, or auto-heal an unsafe journal. Return
   a bounded fail-closed result suitable only for a later real maintenance and
   durable-alert path.
7. Keep the maintenance actuator interface or requirement explicitly future and
   disabled. It must not call Docker/Compose, reload Caddy/Nginx, change traffic,
   or claim maintenance has occurred.
8. Keep exact source-versus-host evidence labeling. Test fixtures, static
   analysis, and source unit tests cannot be represented as deployment, migration,
   snapshot, cutover, rollback, credentials, installation, or release evidence.

## Required tests and acceptance evidence

1. Unit tests accept only a supported, canonical manifest whose candidate,
   keyed service-image digests, Compose binding, and identity-manifest binding
   are complete and mutually consistent.
2. Negative tests reject unsupported schema versions, missing/extra/duplicate
   service keys, mutable tags, malformed or mismatched digests, candidate
   mismatch, altered Compose material, altered identity manifest, and any
   independently supplied substitution.
3. Journal tests accept only allowed record schema versions and phase sequences,
   proving consistent request, predecessor, candidate, and admitted-manifest
   lineage.
4. Fault/negative tests reject malformed, partial, truncated, duplicate,
   out-of-order, impossible-transition, unknown-version, and contradictory
   journal history; every such case yields a fail-closed classification with no
   inferred predecessor/candidate and no new admission.
5. Tests prove unsafe history is preserved for diagnosis and never silently
   repaired or rewritten.
6. Tests prove the maintenance path is not operationally enabled: it has no
   Docker/Compose invocation, migration/snapshot activity, Caddy/Nginx reload,
   traffic/cutover action, credential use, host installation action, rollback,
   or release-success output.
7. Review source evidence separately from future installed-host and public-edge
   evidence. No passing source test grants release credit.

## Implementation and documentation impact

- **Code / architecture:** Future implementation may add only controller source
  validation for immutable manifest admission and fail-closed journal structural/
  history integrity. It must not implement or enable Docker/Compose execution,
  migration/snapshot handling, Caddy/Nginx reload, cutover, rollback, credential
  delivery, host installation, or release success paths.
- **Data / schema:** No ERP business-schema or database migration change. The
  source controller's journal/manifest contracts are operational-source metadata,
  not permission to create or alter a hosted journal.
- **Workflow / permissions:** No product or deployment-role authority changes.
  The controller remains non-operational in this phase.
- **UI / mobile:** None.
- **Reporting:** Any output must be labeled source validation only. It cannot
  report a deployment, snapshot, migration, served identity, maintenance action,
  cutover, recovery, rollback, host installation, or release result.
- **Knowledge base / training:** No user-facing behavior changes; no Dunong
  handoff is required. Future operator runbooks remain required before any real
  maintenance or recovery actuator is enabled.
- **Tests / UAT:** Source contract tests are required before identity/cutover
  work. Installed-host, recovery rehearsal, backup/restore, edge, rollback, and
  release/UAT gates remain pending and independent.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement source-only versioned immutable artifact-manifest admission and keyed service-image/Compose/identity binding. | Engineering / DevOps | Before identity/cutover source work | Pending |
| Implement fail-closed structural and history validation for the phase journal, with the required negative tests. | Engineering / Security / QA | Before identity/cutover source work | Pending |
| Define, implement, authorize, and rehearse a real maintenance actuator and durable alert path. | DevOps / Security / Release | Before operational recovery controller acceptance | Pending; explicitly outside this phase |
| Perform Docker/Compose, migration/snapshot, Caddy/Nginx, identity, cutover, rollback, credential-isolation, host-installation, and public/hosted evidence only under their separately approved work. | DevOps / QA / Release | Before any production GO | Pending; not authorized or credited here |
| Reassess DEC-0248 recovery closure after source, installed-host, and operational evidence is complete. | Security / QA / Release | Before production promotion | Pending |

## Evidence

- `docs/core/00-governance/DECISION_RECORD_TEMPLATE.md`
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/00-governance/decisions/DEC-0038-CI-PRODUCTION-BASELINE-GATE.md`
- `docs/core/00-governance/decisions/DEC-0039-MIGRATION-DATA-SAFETY-VERIFICATION-GATE.md`
- `docs/core/00-governance/decisions/DEC-0248-SINGLE-HOST-CONTROLLED-DEPLOYMENT-FENCE.md`
- `docs/core/00-governance/decisions/DEC-0249-SERVED-IDENTITY-PROVENANCE-AND-PUBLIC-PROBE-CONTRACT.md`
- `docs/core/00-governance/decisions/DEC-0250-NGINX-SINGLE-HOP-SHARED-VPS-EDGE.md`
- `docs/core/00-governance/decisions/DEC-0252-CI-PRODUCTION-AUTHENTICATED-BROWSER-LANE.md`
- Parent-led council sequence: independent controller-integrity/recovery
  analysis; targeted challenge on immutable manifest binding, journal ambiguity,
  and maintenance behavior; hard-gate review; parent confirmation on 2026-07-29.
  The sequence selected source-only integrity closure first because controller
  input and recovery state must be trustworthy before identity/cutover work.
- Requested Code Spark and GPT-5.4 specialists were unavailable. The closest
  available GPT-5.6 fallback was used for the deliberation without relaxing hard
  gates or expanding implementation authority.

## Supersession

This record supplements DEC-0248 with the confirmed source-only admission and
journal-integrity sequence. It does not supersede DEC-0248, DEC-0249,
DEC-0250, or DEC-0252, and it does not close any installed-host, maintenance,
recovery, cutover, rollback, identity, public-edge, migration, snapshot,
credential, or production-release obligation.
