# DEC-0039 — Migration Data-Safety Verification Gate

## Metadata

- Decision ID: `DEC-0039`
- Title: Migration Data-Safety Verification Gate
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex
- Related phase/module: Shared Production Foundation — SPF-002 migration and data-safety verification
- Related decision brief: Parent-confirmed SPF-002 decision after independent Ligaya, Mayumi, Lualhati, and Tala review

## Decision

Select **Option B**: harden and run an exact-SHA hosted upgrade rehearsal in a disposable environment using PostgreSQL 17 and an identified, populated predecessor baseline. SPF-002 may close only when one retained evidence run proves the reviewed migration inventory, schema-drift resolution, pre-migration backup, upgrade, data preservation, isolated restore equivalence, idempotent redeploy, and per-migration recovery plan described below.

SPF-002 closure does not close SPF-009. Staging SSH/deployment execution, application rollback, smoke checks, monitoring, and hypercare remain SPF-009 evidence requirements.

## Context

The current migration tooling and artifacts do not yet prove preservation of existing operational data through an upgrade. Although 107 migrations are reported up to date, the non-empty datasource/schema diff remains unresolved. The available baseline is empty; the snapshot covers only 63 of 158 models and records counts without content or business-invariant verification; related workflow evidence does not consistently use one shared run ID; PostgreSQL 16 evidence does not match the PostgreSQL 17 production baseline; the backup was taken after migration; and restore evidence proves connectivity rather than data equivalence.

These limitations prevent the existing evidence from satisfying the recovery and data-integrity hard gate. A fresh install can prove that migrations build a schema, but it cannot prove that a populated predecessor database upgrades without loss, corruption, or semantic drift.

## Options considered

### Option A — rejected: accept CI-only fresh-install evidence

- Summary: Use the existing CI migration path and fresh database checks as sufficient migration verification.
- Benefits: Lowest additional execution effort and fast repeatability in CI.
- Failure modes: Fresh installation may succeed while an upgrade from real predecessor state loses or alters data; unresolved schema drift may remain hidden; partial count-only snapshots may miss corrupted content or broken relationships; and backup/restore recoverability remains unproved.
- Why selected or rejected: Rejected because it fails the recovery and data-integrity hard gate. Fresh-install success is not evidence of data preservation across an upgrade.

### Option B — selected: exact-SHA populated upgrade rehearsal

- Summary: Inventory and review the exact migration set, resolve schema drift, and run a hosted disposable PostgreSQL 17 rehearsal for the exact release-candidate SHA from an identified populated predecessor baseline. Capture pre/post all-model counts, content and invariant checks, a pre-migration checksummed backup, isolated restore equivalence, idempotent deployment, and a migration-specific forward-fix/rollback matrix under one evidence run ID.
- Benefits: Directly tests the release path that can damage retained data, establishes traceability between source, migrations, database state, backup, restore, and results, and produces an auditable recovery basis without touching production.
- Failure modes: The predecessor baseline may be unrepresentative or unidentified; migration files may change after review; evidence may be split across run IDs or SHAs; content corruption may escape weak invariants; a backup may exist but fail equivalence after restore; a second deploy may mutate data; or a generic rollback statement may not address migration-specific failure paths.
- Why selected or rejected: Selected because it is the highest-ranked option among those capable of passing all applicable hard gates and because it produces direct, retained evidence of upgrade safety and recovery.

### Option C — rejected: defer verification and hold release

- Summary: Keep SPF-002 open and retain a release hold without hardening or running the rehearsal.
- Benefits: Preserves safety by preventing unsupported release promotion.
- Failure modes: Produces no new data-preservation or recovery evidence, leaves known verification gaps unresolved, and provides no path to SPF-002 closure.
- Why selected or rejected: Rejected as the implementation choice because it makes no progress. It remains the mandatory release posture whenever Option B evidence is incomplete or fails.

## Hard-gate assessment

- **Recovery and data integrity:** Option A fails this gate because fresh-install evidence cannot demonstrate preservation or recoverability of predecessor data. Option B can pass only with a pre-migration checksummed backup, isolated restore equivalence, content/invariant verification, and an actionable per-migration recovery matrix.
- **Exact release candidate:** The predecessor baseline identifier, migration inventory and hashes, rehearsal execution, application/source SHA, and retained manifest must refer to the same candidate. Changed migration content invalidates the review and requires a new run.
- **Schema consistency:** The non-empty datasource/schema diff must be explained and resolved before the rehearsal is accepted. An unexplained drift result blocks closure.
- **Transactional consistency and idempotency:** The first deployment must apply the reviewed migrations successfully; a second deployment against the upgraded database must report no pending changes and must not alter verified data or invariants.
- **Auditability:** One evidence run ID must join all preflight, migration, snapshot, backup, restore, verification, and manifest artifacts. Missing, mixed, or manually reconstructed lineage blocks closure.
- **Environment fidelity:** The rehearsal must use PostgreSQL 17. PostgreSQL 16 results do not satisfy this decision.
- **Scope isolation:** The rehearsal and restore must use disposable, isolated databases and non-production data handled under approved access and sanitization controls. No production database mutation is authorized by this decision.
- **Release scope:** SPF-002 may close from this migration/data-safety evidence. SPF-009 remains open until its separate staging deployment and operational recovery evidence is accepted.

## Required safeguards

- Identify the populated predecessor baseline by version or exact source SHA, database/schema fingerprint, creation source, and sanitization status; retain enough representative relational and lifecycle data to exercise every migrated model and affected invariant.
- Generate a complete ordered inventory of all migration directories/files in scope, including content hashes and review disposition. Freeze that inventory for the rehearsal; any hash change requires renewed review and a new exact-SHA run.
- Resolve and document the current non-empty datasource/schema diff before migration execution. Do not waive unexplained drift or generate an ad hoc migration from the rehearsal database.
- Use a hosted disposable PostgreSQL 17 source database and a separate isolated PostgreSQL 17 restore target. Record database fingerprints without exposing credentials.
- Assign one evidence run ID before preflight and propagate it through the predecessor-baseline record, migration inventory, schema-drift result, pre/post verification, backup, restore, idempotency check, and final manifest.
- Capture the pre-migration state for all application models, not the current 63-model subset. Record row counts and stable content digests where safe, plus explicit business and relational invariants sufficient to detect semantic corruption that counts alone cannot reveal.
- Create the backup and its checksum before applying any migration. Record tool and PostgreSQL versions, UTC time, source fingerprint, file size, checksum, operator or hosted job identity, exact SHA, and evidence run ID.
- Deploy only the reviewed migration inventory to the populated predecessor baseline. Retain command outcome, migration journal/status, start/end times, and sanitized failure output.
- Re-run the all-model counts, stable content checks, and invariants after migration. Every expected change must map to reviewed migration intent; any unexplained deletion, mutation, orphan, scope violation, ledger/audit break, or invariant failure blocks closure.
- Run the migration deployment a second time against the upgraded database. It must report no pending migration and produce no data, schema, count, digest, or invariant change.
- Restore the pre-migration backup into the separate isolated target and verify equivalence to the captured pre-migration source using the same all-model counts, content checks, and invariants. Connectivity-only or restore-command success is insufficient.
- Maintain a per-migration forward-fix/rollback matrix covering failure point, transactional behavior, reversibility, forward-fix procedure, rollback or backup-restore path, data-loss risk, decision trigger, owner, verification step, and expected recovery time. Irreversible migrations must explicitly require restore or a reviewed forward fix; they must not claim unsupported down-migration capability.
- Fail closed: keep SPF-002 pending and the release held on missing lineage, mismatched SHA/hash/run ID, schema drift, partial model coverage, PostgreSQL-version mismatch, post-migration-only backup, restore non-equivalence, idempotency failure, unexplained delta, or failed invariant.
- Generate the retained evidence manifest only after source artifacts are final. The manifest must list paths, hashes, exact SHA, evidence run ID, environment/version metadata, conclusions, and reviewer acceptance; any later artifact change invalidates the manifest and requires regeneration and review.
- Keep rehearsal data, backups, logs, and manifests access-controlled, encrypted where applicable, sanitized of credentials and sensitive values, retained for the approved release-evidence period, and disposed of through the approved cleanup process after retention expires.

## Implementation and documentation impact

- Code / architecture: Harden the hosted migration-rehearsal workflow and supporting verification scripts so they enforce exact-SHA lineage, one evidence run ID, full-model/content/invariant verification, pre-migration backup, isolated restore equivalence, and idempotent redeployment.
- Data / schema: No business-schema change is approved by this record. The existing datasource/schema diff must be resolved through reviewed source and migration history before the rehearsal can pass.
- Workflow / permissions: Rehearsal execution and evidence access remain restricted to authorized engineering, database, QA, and release roles. This decision does not change application user permissions.
- UI / mobile: No user-interface behavior changes.
- Reporting: Retain one checksum-backed evidence manifest and its referenced artifacts as the SPF-002 closure packet.
- Knowledge base / training: No Dunong handoff is required. This is an internal release-control decision with no end-user workflow, terminology, or training impact.
- Tests / UAT: The hosted populated-upgrade rehearsal is required automated/operational release evidence. It does not replace applicable UAT or the SPF-009 staging, application rollback, smoke, monitoring, and hypercare evidence.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Resolve the datasource/schema diff and freeze the reviewed migration inventory with hashes | Database Engineering | Before the SPF-002 rehearsal | Pending |
| Identify and prepare a representative populated predecessor baseline on PostgreSQL 17 | Database Engineering / Platform Engineering | Before the SPF-002 rehearsal | Pending |
| Harden hosted evidence tooling for full-model counts, content/invariant checks, shared run ID, pre-migration backup, isolated restore equivalence, and idempotent redeployment | Engineering / Platform Engineering / QA | Before the SPF-002 rehearsal | Pending |
| Complete and review the per-migration forward-fix/rollback matrix | Database Engineering / Release Manager | Before rehearsal acceptance | Pending |
| Run the exact-SHA disposable upgrade rehearsal and retain the final checksum manifest | Platform Engineering / QA | Release-candidate verification | Pending |
| Accept or reject the SPF-002 evidence packet; close SPF-002 only on full acceptance | Decision Chair / Release Manager | After successful rehearsal review | Pending |
| Complete staging SSH/deployment, application rollback, smoke, monitoring, and hypercare evidence under SPF-009 | Platform Engineering / Release Manager | Before production release | Pending — outside SPF-002 closure |

## Evidence

- Parent Decision Chair confirmed **Option B** on 2026-07-21 after unanimous independent Round 1 recommendations from Ligaya, Mayumi, Lualhati, and Tala. No challenge round was needed because the reviewers identified no material disagreement.
- Decision scorecard conclusion: Option B ranked highest among the options capable of passing the hard gates. Option A failed the recovery/data-integrity hard gate; Option C preserved the release hold but produced no progress toward verified migration safety.
- Current-state findings supplied to the council: 107 migrations reported up to date with a non-empty datasource/schema diff; an empty predecessor baseline; snapshot coverage of 63 out of 158 models with counts only; inconsistent shared run-ID lineage; PostgreSQL 16 evidence; backup captured after migration; and restore verification limited to connectivity.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md`
- `docs/core/00-governance/DECISION_SCORECARD.md`
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` (`SPF-002`, `SPF-009`)
- `scripts/release-data-snapshot.mjs`
- `scripts/release-data-snapshot-compare.mjs`
- `scripts/release-data-snapshot-status.mjs`
- `scripts/release-data-snapshot-checklist.mjs`
- `scripts/release-backup-summary.mjs`
- `scripts/release-backup-restore-preflight.mjs`
- Successful Option B rehearsal evidence does not yet exist. All implementation and execution follow-ups above remain pending.

## Supersession

This decision is not superseded. A later decision that changes the SPF-002 evidence threshold, approved database version, or migration recovery requirements must explicitly supersede this record without rewriting historical evidence.
