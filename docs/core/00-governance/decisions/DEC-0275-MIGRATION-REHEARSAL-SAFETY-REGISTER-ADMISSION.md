# DEC-0275 — Migration Rehearsal Safety-Register Admission

## Metadata

- Decision ID: `DEC-0275`
- Title: Migration Rehearsal Safety-Register Admission
- Status: `Confirmed — rehearsal-only approval; production blocked`
- Date: 2026-08-06
- Decision owner: Shared Production Foundation / migration data-safety verification
- Decision Chair: Parent agent
- Related phase/module: Phase I shared production foundations — SPF-002 migration rehearsal
- Related decisions: `DEC-0039`, `DEC-0258`, `DEC-0263`, `DEC-0264`, `DEC-0268`, `DEC-0273`
- Related decision brief: Parent-confirmed MIG-2026-08-06 exact-candidate migration safety-register review

## Decision

Source candidate `30410fc` failed migration-safety-register admission because
six migration directories had no safety-register rows. Add those six exact
content hashes to the reviewed set as **`APPROVED_FOR_REHEARSAL` only**. The
necessary successor may contain the unchanged reviewed migration SQL plus the
safety-register, scanner-regression, decision-record, and plan corrections
required by this decision. The successor's full commit SHA, not `30410fc`, must
then bind the disposable hosted evidence run. This authorizes only the
rehearsal required by `DEC-0039`; it does not authorize production deployment,
a VPS action, or a production `APPROVED` disposition.

Production remains blocked until a populated predecessor is used and retained
hosted evidence binds the exact SHA to migration, recovery, and authenticated
browser results.

## Context

`DEC-0039` requires a frozen, exact-hash migration inventory and a populated
predecessor rehearsal before data-safety closure. The candidate `30410fc` did
not meet that prerequisite: the safety register lacked rows for six migrations
that form part of the reviewed inventory. Treating absent rows as implicit
approval, or promoting them directly to production approval, would defeat the
review lineage and recovery gate.

The six missing rows are:

| Migration directory | SHA-256 | Disposition |
|---|---|---|
| `20260731090000_inventory_pilot_classifier_activation_intents` | `a560e3e9fd5f70f4bd117bb07215a518148cd4246d88005a2ec2e5a9a0732895` | `APPROVED_FOR_REHEARSAL` |
| `20260731110000_opening_inventory_cutover_foundation` | `19319932c478073e9a6a5ea2936314ced4dc64896271e01f8aac70e05442af2b` | `APPROVED_FOR_REHEARSAL` |
| `20260731140000_stock_count_recount_recovery_foundation` | `be9f5e0a1d8f521fa3512504628c6427c5bfc71a698289974188a071c8e94412` | `APPROVED_FOR_REHEARSAL` |
| `20260731150000_stock_count_recount_transition_truncate_guard` | `6f9029c8c992964b25c19e10603eb2961264696208d1b5bc42971c89e4b38dab` | `APPROVED_FOR_REHEARSAL` |
| `20260803090000_wastage_reason_code_explicit_applicability` | `a93ac9f23eafe904811dc7e07fe5698183d8534d6c5e8d70d501f1c44661729a` | `APPROVED_FOR_REHEARSAL` |
| `20260806120000_inventory_pilot_configuration_draft_seal` | `a85526568663ba79cef9490a7275a8fe4e7cfbf8fde989923df5b0fac67cb837` | `APPROVED_FOR_REHEARSAL` |

## Options considered

### Option A — selected: exact-hash rehearsal-only admission

- Summary: Register only the six listed directory/hash pairs as
  `APPROVED_FOR_REHEARSAL`, then require the full populated-predecessor,
  exact-SHA rehearsal and recovery evidence before any further disposition.
- Benefits: Restores a complete, reviewable inventory without conflating a
  source review with production release authority; keeps `DEC-0039` evidence
  gates intact.
- Failure modes: A migration file could change after registration; a rehearsal
  result could be attributed to another SHA; weak recovery evidence could be
  mistaken for production authorization; or a non-transactional DDL failure
  could leave a partially changed disposable database.
- Why selected: It is the only option that permits the required rehearsal while
  preserving fail-closed production and recovery controls.

### Option B — rejected: mark all six production `APPROVED` now

- Summary: Promote the six rows directly from missing to production approval.
- Benefits: Reduces a later administrative step.
- Failure modes: Skips the populated-predecessor, recovery, and hosted
  exact-SHA evidence gates; could authorize an unproven data transformation or
  trigger behavior in production.
- Why rejected: Safety-register completion is a rehearsal prerequisite, not
  production acceptance evidence.

### Option C — rejected: treat missing rows as implied approval

- Summary: Permit the candidate because the migration files exist in source.
- Benefits: No register maintenance.
- Failure modes: Removes the auditable relationship between directory, exact
  hash, reviewed recovery behavior, and disposition; later source drift could
  be silently admitted.
- Why rejected: It fails the frozen-inventory and auditability requirements of
  `DEC-0039`.

### Option D — rejected: omit the six migrations from the rehearsal

- Summary: Rehearse a partial migration set or use a modified candidate.
- Benefits: Avoids reviewing the absent rows.
- Failure modes: Does not test the release candidate that would be promoted;
  dependencies, enum values, recount constraints, or wastage applicability may
  diverge from the intended schema and behavior.
- Why rejected: An exact-SHA rehearsal must apply the complete reviewed
  inventory.

## Hard-gate assessment

- **Exact candidate and auditability:** Each admitted row is bound to one
  named migration directory and its full SHA-256. Any directory or hash change
  invalidates the admission and requires a new review and evidence run.
- **Recovery and data integrity:** Rehearsal-only admission does not close
  `DEC-0039`. A populated predecessor, pre-migration backup, isolated restore
  equivalence, migration-specific recovery matrix, all-model/invariant checks,
  and idempotent redeploy remain required.
- **Transactional consistency:** The opening-inventory enum evolution is
  explicitly assessed as potentially outside a transaction. The stock-count
  recount trigger replacement is also assessed as potentially outside a
  transaction. Neither may rely on an unsupported all-or-nothing DDL claim.
- **Inventory, approval, and audit integrity:** The inventory-pilot classifier,
  opening cutover, recount recovery, recount guard, wastage applicability, and
  pilot configuration seal must retain their existing controlled workflow,
  scope, segregation, immutable-history, and ledger boundaries. This decision
  grants no workflow or posting authority.
- **Release scope and recovery:** No production, staging/VPS, or operational
  cutover action is authorized. Production remains NO-GO pending the listed
  evidence gates.

## Required safeguards

1. Record the six rows with exactly the directory names, SHA-256 values, and
   `APPROVED_FOR_REHEARSAL` disposition above. Do not substitute abbreviated
   hashes or broaden the disposition to production `APPROVED`.
2. Freeze the complete migration inventory for the exact candidate before the
   rehearsal. A changed file, register row, candidate SHA, predecessor, or
   evidence run invalidates the result.
3. Use a populated, identified predecessor and a disposable isolated target;
   create a checksummed pre-migration backup and prove isolated restore
   equivalence before the rehearsal can receive credit.
4. For the opening-inventory enum change outside a transaction, document the
   actual PostgreSQL behavior and recovery boundary in the migration-specific
   matrix; prove failed-apply recovery/restore and second-run idempotency. Do
   not claim rollback that PostgreSQL or the migration runner cannot perform.
5. For recount trigger replacement outside a transaction, prove the failure
   path cannot leave an unsafe trigger state unnoticed. The recovery matrix
   must specify trigger-presence/definition checks, the forward-fix or restore
   action, responsible owner, and verification before retry or promotion.
6. Extend the release scanner to detect and require review coverage for
   `DROP TRIGGER` and `DISABLE TRIGGER`. QA identified this gap; until the
   scanner is corrected and its regression coverage passes, scanner success is
   not sufficient evidence that trigger-risk DDL was reviewed.
7. Retain exact-SHA hosted migration, recovery, and production-authenticated
   browser evidence under one reviewable lineage. Local or source-only checks
   do not satisfy the production gate.
8. Fail closed on missing/changed hash rows, a non-populated predecessor,
   incomplete recovery proof, unexplained migration result, scanner gap left
   unresolved, absent hosted evidence, or browser evidence for another SHA.

## Implementation and documentation impact

- **Code / architecture:** No application architecture change is authorized by
  this record. Release tooling must maintain the exact safety-register mapping
  and close the QA-identified trigger-DDL scanner gap.
- **Data / schema:** The six listed migrations may be exercised only in an
  isolated rehearsal. Their production data effects remain unapproved pending
  evidence and a later disposition.
- **Workflow / permissions:** No product workflow, role, scope, approval, or
  inventory-posting permission changes.
- **UI / mobile:** No UI or mobile behavior change.
- **Reporting:** Retain the exact inventory, candidate SHA, predecessor
  identity, recovery matrix, hosted migration/recovery evidence, browser
  evidence, and final reviewer disposition in the release-evidence packet.
- **Knowledge base / training:** No Dunong handoff is required; this is an
  internal release-control decision with no approved end-user behavior change.
- **Tests / UAT:** Add scanner regression coverage for `DROP TRIGGER` and
  `DISABLE TRIGGER`; run migration failure/recovery and idempotency checks for
  the enum and recount-trigger changes, then retain exact-SHA hosted migration,
  recovery, and authenticated-browser evidence.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Add and verify the six exact safety-register rows as rehearsal-only | Database Engineering / Release Engineering | Before exact-candidate rehearsal | Complete locally — exact-hash register generation passes for all 151 migrations |
| Correct release-scanner detection for `DROP TRIGGER` and `DISABLE TRIGGER` and add regression coverage | Release Engineering / QA | Before relying on scanner acceptance | Complete locally — release-tool self-test passes |
| Complete migration-specific recovery proof for the opening enum and recount trigger replacement | Database Engineering / QA | During rehearsal design and execution | Pending |
| Run the hosted populated-predecessor exact-SHA migration and recovery rehearsal | Platform Engineering / Database Engineering / QA | After safeguards are complete | Pending |
| Retain exact-SHA production-authenticated browser evidence | Platform Engineering / QA | Before production release review | Pending |
| Determine any production `APPROVED` disposition only after evidence review | Decision Chair / Release Manager | After all gates pass | Pending — production blocked |

## Evidence

- Parent Decision Chair confirmed MIG-2026-08-06 on 2026-08-06: candidate
  `30410fc` failed because the six listed migrations lacked safety-register
  rows; all six are approved for rehearsal only.
- `DEC-0039-MIGRATION-DATA-SAFETY-VERIFICATION-GATE.md` establishes the
  populated-predecessor, exact-SHA, backup, restore, idempotency, and recovery
  evidence requirements that remain binding.
- QA identified the release-scanner gap: `DROP TRIGGER` and `DISABLE TRIGGER`
  are not currently detected/review-gated.
- Review safeguards explicitly cover the opening enum outside-transaction risk
  and recount trigger replacement outside-transaction risk.
- Subagent fallback note: Code Spark and GPT-5.4-mini were unavailable;
  GPT-5.6 Terra was used. The fallback did not relax any hard gate or evidence
  requirement.

## Supersession

This decision is not superseded. A later record may authorize production only
after the evidence and release gates stated here have been met; it must not
reinterpret `APPROVED_FOR_REHEARSAL` as production approval.
