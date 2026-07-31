# DEC-0263 — Immutable Opening-Stock Cutover

## Metadata

- Decision ID: `DEC-0263`
- Title: Immutable Opening-Stock Cutover
- Status: `Confirmed`
- Date: 2026-07-31
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory Control Pilot — opening inventory
  cutover, inventory ledger, stock count, approvals, and pilot activation
- Related decisions: `DEC-0013`, `DEC-0019`, `DEC-0023`, `DEC-0036`,
  `DEC-0049`, `DEC-0098`, `DEC-0258`, `DEC-0260`, `DEC-0261`, `DEC-0262`
- Related decision brief: Parent-led opening-stock cutover decision council

## Decision

Use a dedicated immutable opening-stock cutover architecture, not ordinary
`StockAdjustment.OPENING_BALANCE` records. One company/pilot `OpeningInventoryCohort`
manifest is bound to one sealed Inventory Pilot configuration revision and digest.
It contains complete selected-item coverage, including recorded zero quantities,
and is released only once through an atomic authority-release event. Zero-quantity
cutover lines remain immutable evidence, but activation creates no zero movement or
zero-balance-cache row for them.

Each pilot location is posted as an atomic child batch sourced from a reviewed,
immutable `OPENING` stock-count attempt. Controlled evidence and a valuation
snapshot are mandatory. Separate Operations and Accounting approvals are required.
Normal application UI may create immutable commands only; a distinct
least-privilege executor consumes eligible commands through hardened,
source-bound routines. No direct balance write is allowed.

Before the cohort is released, correction is a full child-batch reversal and
replacement only, while the cohort is unreleased and no later activity exists.
After release, correction uses a separately approved delta Stock Adjustment;
the opening batch is never edited or deleted.

**Local implementation status (2026-07-31):** The cohort, child-cutover,
command, approval-attestation, reconciliation, executor, fence, and
ledger-owned balance-cache boundary are implemented and locally verified. This
is not a production activation, pilot release, or UAT sign-off. `STAGE` is
validation/reconciliation only and creates neither a movement nor a balance.
`ACTIVATE` posts the complete eligible cohort atomically. An unreleased cohort
is recovered by an auditable logical supersession with zero ledger effect;
after release, correction remains a separately approved delta adjustment.

## Context

The existing `OPENING_BALANCE` value on the general Stock Adjustment model was
not a safe cutover aggregate: it had no sealed pilot-cohort binding, no complete
coverage assertion, no pilot-wide movement fence, no separate release event, and
no protected execution boundary. Its ordinary reversal boundary also explicitly
excludes opening balances. A cutover affects the initial inventory
stock-of-record and therefore requires a stronger, recoverable operational and
database contract than a routine correction.

The parent confirmed the selected option after independent Workflow, Database,
and Security first-round analysis and a targeted challenge round. Requested Code
Spark and GPT-5.4-mini subagent models were unavailable; the owner authorized
the closest available GPT-5.6 Terra fallback. This substitution did not relax
independence, the implementation lock, or hard control gates.

## Options considered

### Option A — selected: dedicated sealed cohort with atomic child batches

- **Summary:** A sealed company/pilot cohort references the sealed pilot
  revision/digest, controls all selected items and locations, and releases one
  reconciled, approved set of immutable location batches through a separate
  authority event and executor.
- **Benefits:** Provides full coverage proof, cross-location cutover integrity,
  explicit release authority, deterministic ledger lineage, replay safety, and a
  defined pre-release recovery path.
- **Failure modes:** A weak coverage query could omit zero lines; an unsealed or
  mismatched revision could admit the wrong cohort; partial child posting or
  activation could create an inconsistent stock-of-record; a privileged runtime
  could bypass approval or fencing.
- **Why selected:** This is the only evaluated option that can meet inventory,
  authorization, atomicity, audit, recovery, and pilot-scope gates together.

### Option B — rejected: reuse ordinary `OPENING_BALANCE` Stock Adjustments

- **Summary:** Retain the current general adjustment type and add more policy
  checks around it.
- **Benefits:** Lower apparent delivery effort and UI reuse.
- **Failure modes:** Cannot natively prove pilot-wide completeness, bind a
  cohort to a sealed revision, atomically release multiple locations, or enforce
  a dedicated executor and cutover fence; ordinary adjustment reversal semantics
  are not a safe cohort recovery path.
- **Why rejected:** It turns an initial stock-of-record cutover into a sequence
  of routine corrections and fails the required aggregate control boundary.

### Option C — rejected: direct inventory-balance import or editable load sheet

- **Summary:** Load opening quantities directly into balance rows or permit
  mutable spreadsheet/import edits after posting.
- **Benefits:** Fast operationally.
- **Failure modes:** Bypasses the immutable ledger, loses source/evidence and
  approval lineage, permits unreviewed correction, and makes reconciliation or
  rollback ambiguous.
- **Why rejected:** It fails ledger, audit, integrity, and recovery hard gates.

### Option D — rejected: defer cutover and use legacy stock as the ERP record

- **Summary:** Keep the pilot operationally inactive or use a parallel legacy
  stock record without an ERP opening load.
- **Benefits:** Avoids immediate cutover risk.
- **Failure modes:** Does not establish a controlled inventory stock-of-record,
  delays the stated pilot outcome, and maintains manual reconciliation exposure.
- **Why rejected:** Retained as the safe NO-GO fallback, but not the confirmed
  implementation path.

## Hard-gate assessment

- **Scope isolation:** Cohort, child batch, selected items, and locations are
  tenant- and company-scoped, and every child batch is bound to its exact pilot
  location and sealed revision/digest.
- **Server authorization and segregation:** UI command creation is authorized
  server-side; Operations and Accounting approvals are distinct and no actor may
  approve their own controlled action. Opening-cutover approval submission
  revalidates the exact location scope before acquiring the shared approval
  producer barrier. Command requests establish live exact target/cohort-location
  scope before target/advisory locks, then revalidate it after the locks inside
  the transaction before mutation. Approval decisions likewise establish the
  exact location scope before their producer barrier and retain transaction
  authority checks. Runtime has no release, execution, or reversal authority.
- **Immutable ledger and audit:** Posting produces deterministic, source-bound
  inventory movements only. A database-owned `AFTER INSERT` movement trigger is
  the sole writer of the derived `InventoryBalance` cache; neither runtime nor
  the opening-cutover owner may directly insert, update, or delete balance
  rows. Command, approval, release, execution, evidence, and reconciliation
  records are auditable and append-only where material.
- **Atomicity and idempotency:** Child batches are posted atomically under
  explicit lock order and deterministic keys. The cohort's single authority
  release is compare-and-swap/idempotent and cannot partially activate a pilot.
- **Command-target integrity:** An unresolved semantic action is unique for its
  actual target: `FREEZE_COHORT` and `ACTIVATE_COHORT` for a cohort, or
  `STAGE_LOCATION` and `REVERSE_LOCATION` for a location cutover. Database
  guards reject an invalid action target or cutover/cohort/tenant/company
  lineage; concurrent different idempotency keys therefore cannot queue two
  unresolved commands for the same target/action.
- **Recovery:** Full child reversal/replacement is allowed only before release
  and only with no later activity; after release, approved delta adjustment is
  the forward-only correction path.
- **Phase scope:** This establishes only the bounded Phase I Inventory Control
  Pilot cutover. It does not authorize valuation/GL accounting, broad migration,
  or operational activation before the retained release gates pass.

## Required safeguards

1. Model a dedicated cohort, location child batches, immutable commands,
   approvals, evidence/valuation snapshots, release event, execution lineage,
   reconciliation, and correction/replacement lineage; do not overload ordinary
   Stock Adjustment as the cohort authority.
2. Seal and independently re-verify the exact configuration revision, canonical
   digest, locations, and selected-item cohort before approval, execution, and
   release. Missing, duplicate, cross-scope, or digest-divergent membership
   fails closed.
3. Require complete selected-item coverage per location, including explicit zero
   lines, with opening count source lineage and required lot/expiry details.
4. Enforce a pilot-wide cutover fence: ordinary inventory movement, transfer,
   receiving, count, and adjustment writers must deny conflicting activity until
   the controlled cohort transition permits it.
5. Require immutable controlled evidence and valuation snapshot plus distinct
   Operations and Accounting approvals before an executor can post a batch.
6. Separate normal UI/runtime command authority from an isolated,
   least-privilege executor. Harden source-bound database routines, role ACLs,
   fixed search paths, ownership, and trigger behavior; prohibit direct
   runtime balance/config/release/reversal writes.
7. Use deterministic source-event/idempotency keys, stable lock order, versions,
   and exactly-once ledger posting. Release only when every required child batch
   is reconciled and eligible.
8. Prove replay/conflict handling, stale/revoked authorization, self-approval
   denial, source/evidence tampering denial, full coverage/zero-line rejection,
   partial-failure rollback, concurrent release/posting serialization, fence
   enforcement, no direct balance write, child recovery limits, and no movement
   duplication or loss.
9. Keep all feature flags default-off. A real sealed cohort, named operational
   roster, recovery rehearsal, browser UAT, and Release Board authorization are
   required before activation.
10. Lock the exact affected inventory locations in stable identifier order in
    both ordinary movement posting and the opening-cutover transition. The
    movement fence itself takes that lock before its decision so a raw movement
   cannot bypass the application-level ordering.
11. Before production deployment, reconcile the ledger-derived expected balance
    to every `InventoryBalance` cache row exactly. Existing drift is a release
    blocker and must not be repaired by a direct cache edit. Deploy the
    application and the cache-trigger/ACL migration as one coordinated
   maintenance-fenced artifact; mixed old-application/new-trigger operation is
   not an approved state.
12. Keep the focused opening-inventory queue and detail subworkspaces bounded by
    server-side pagination. Cohort-wide evidence, authority events, and commands
    may be shown only when the reader has live view scope for every location in
    that cohort; otherwise show only the authorized local batch and an explicit
    restriction state. Draft-cohort option lists are independently restricted to
    configuration revisions whose endpoint membership includes the reader's
    exact current location; a draft identifier, reference, revision, or digest
    must not disclose another location's cohort.
13. Register the exact `OpeningInventoryCutover` producer through forward
    migration
    `20260731130000_opening_inventory_approval_producer_barrier`. Preserve the
    barrier function's closed producer-family allowlist: arbitrary document-type
    text must continue to fail closed. Validate the submitting actor's exact
    location scope before attempting that tenant/company shared barrier.
14. Preserve terminal transfer validation order used by the shared approval
    perimeter: after exact replay resolution, validate the locked transfer's
    terminal lifecycle before reading and validating its lines or invoking the
    pilot classifier. This prevents a stale or ineligible source from reaching
    broader dependent validation.
15. Serve opening-cutover activity through a bounded database query rather than
    hydrating all audit, cohort-event, or command rows for application-side
    slicing. The query must preserve deterministic newest-first ordering and
    apply the same cohort-wide scope restriction to shared event/command facts.

## Implementation and documentation impact

- **Code / architecture:** A dedicated opening-cutover aggregate and isolated
  executor are locally implemented. `OPENING_BALANCE` Stock Adjustment is not
  an eligible pilot cutover path. `InventoryMovement` is now the sole
  authoritative write source for the derived balance cache through a
  database-owned trigger; historic general-adjustment records are retained.
- **Data / schema:** Add forward-only cohort, batch, command, evidence,
  valuation, approval, release, execution, reconciliation, and correction
  lineage. No direct balance migration or historical data rewrite is allowed.
- **Workflow / permissions:** Define separate scoped command, Operations review,
  Accounting review, executor, and post-release delta-adjustment authorities;
  preserve no-self-approval and live revocation checks. The opening approval
  producer is registered by exact document type in the shared barrier's closed
  allowlist, with exact-location authorization established before barrier
  acquisition. Draft selection and command preflight are non-enumerating across
  adjacent locations; command scope is rechecked after locks before any durable
  change.
- **UI / mobile:** The locally implemented focused, role-aware queue,
  preparation task, and detail subworkspaces expose explicit
  sealed/review/reconciliation/release states and bounded server-side pages. A
  local-scope reader sees an explicit restriction instead of cohort-shared
  evidence or authority history. An unavailable/out-of-scope record has a
  non-enumerating in-workspace state rather than a redirect, command failures
  map stable errors to safe actionable guidance, and controls meet the shared
  44 px target. The workspace must not present an ordinary adjustment form as a
  cutover tool.
- **Reporting:** Reconciliation must prove expected selected-item/location
  coverage, opening count/batch/movement lineage, zero lines, valuation snapshot,
  approvals, release event, and post-release corrections.
- **Knowledge base / training:** Pilot-only cutover knowledge-base, training,
  release-note, and glossary coverage is locally published. It states that
  stock adjustments are not an opening-cutover substitute. Browser-authenticated
  responsive UAT remains required before operational use.
- **Tests / UAT:** Database, authorization, executor-ACL, concurrency, fence,
  rollback/recovery, browser role-flow, and operational reconciliation evidence
  are release-blocking.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the dedicated opening cohort, fence, executor, immutable ledger/reconciliation contract, and ledger-owned balance cache. | Backend / Database / Security | Current local Phase 3 slice | Implemented and independently reviewed locally; production deployment and activation pending |
| Add focused cutover queue, preparation task, detail subworkspaces, server-paged reads, and role-aware read-only/disabled states. | Frontend / Product Design | Current local Phase 3 slice | Implemented and independently reviewed locally; browser-authenticated responsive UAT pending |
| Complete browser role-flow, recovery rehearsal, and production deployment/recovery evidence. | Parent / QA / Security / DevOps | Before any activation | Pending / release-blocking |
| Replace the broad runtime `InventoryMovement` write capability with typed source-specific posting authority, or otherwise close the raw-runtime forged ordinary-movement risk. | Architecture / Database / Security | Before production activation | Blocking production hardening gate |
| Confirm real cohort, valuation owner, named approvers/executor, recovery rehearsal, and Release Board decision. | Product / Operations / Accounting / Release | Before any activation | Blocking |
| Assess and publish pilot cutover enablement once the UI/workflow is implemented. | Dunong | Current local Phase 3 slice | Locally complete; browser-authenticated responsive UAT pending |

## Evidence

- [`DEC-0258`](DEC-0258-INVENTORY-CONTROL-PILOT-RELEASE-SCOPE.md) — bounded
  pilot and NO-GO release posture.
- [`DEC-0260`](DEC-0260-INVENTORY-PILOT-TRANSFER-AND-COUNT-APPROVAL-SEMANTICS.md)
  and [`DEC-0261`](DEC-0261-INVENTORY-PILOT-RELATIONAL-CLASSIFIER-ACTIVATION-AND-SUBMISSION-INTENTS.md)
  — sealed cohort configuration, exact scope, normalized approval, and
  activation foundations.
- [`DEC-0023`](DEC-0023-STOCK-ADJUSTMENT-APPROVAL-POSTING-REVERSAL.md) —
  ordinary adjustment boundary that deferred opening balances.
- [`wastage-stock-adjustment-workflow.md`](../../../phases/phase-01-procurement-inventory/workflows/wastage-stock-adjustment-workflow.md)
  and [`MIGRATION_AND_SEED_DATA_PLAN.md`](../../../phases/phase-01-procurement-inventory/implementation/MIGRATION_AND_SEED_DATA_PLAN.md)
  — prior opening-count, evidence, valuation, and sign-off requirements.
- Parent decision brief; independent Workflow, Database, and Security positions;
  and targeted challenge evidence confirmed on 2026-07-31 using the
  owner-authorized GPT-5.6 Terra fallback.
- Final local evidence: 146 migration directories/files applied;
  role-contract verifier passed; append-only history suite passed (17/17);
  opening cutover disposable-PostgreSQL integration suite passed (12/12);
  procurement/inventory authorization passed (75/75 across 8 files);
  authorization manifest passed (21/21); focused opening/UI/schema/service tests
  passed (45/45 across 6 files); the Docker-isolated non-database web suite
  passed 1,651 tests across 152 files, with 362 skipped, 19 skipped files, and
  one existing TODO; and lint, 4 GiB typecheck, 4 GiB production build, and
  diff hygiene passed. Independent Security, QA, and UI re-reviews each returned
  GO with no Critical, High, or Medium findings for this local slice. Hostile
  cohort IDs disclose no option metadata; shared authority comes only from the
  exact sealed endpoint graph with current all-endpoint scope; and evidence
  resolution failure is represented as a separate fail-closed unavailable state.
  Browser-authenticated responsive UAT, recovery, and production gates remain
  pending; this evidence does not substitute for them.

## Residual production risk

The new balance-cache boundary prevents a runtime or opening-cutover owner from
directly mutating `InventoryBalance`; cache contents remain derived from the
immutable movement ledger. The runtime database credential can still submit a
forged *ordinary* `InventoryMovement` outside the intended application service
if that credential is compromised. The movement fence and cache trigger apply,
but they cannot establish source-workflow authority for an arbitrary raw insert.
Replacing that broad capability with typed source-specific posting authority is
therefore a production hardening gate, not a waived risk.

## Supersession

This decision supersedes only the opening-balance-cutover deferral and any
contrary implication that ordinary `OPENING_BALANCE` Stock Adjustments implement
pilot cutover in `DEC-0023`, `DEC-0036`, the Phase I stock-adjustment workflow,
and the data dictionary. It does not change the manual `INCREASE`/`DECREASE`
adjustment slice, count-variance controls, or other deferred stock-adjustment
features.
