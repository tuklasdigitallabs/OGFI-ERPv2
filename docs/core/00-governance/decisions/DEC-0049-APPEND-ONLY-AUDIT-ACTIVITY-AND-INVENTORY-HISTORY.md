# DEC-0049 — Append-Only Audit, Activity, and Inventory History

## Metadata

- Decision ID: `DEC-0049`
- Title: Append-Only Audit, Activity, and Inventory History
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-006 audit and activity integrity (`SPF006-IMM-01`)
- Related decision brief: Parent-confirmed append-only enforcement decision after three independent High-confidence specialist reviews

## Decision

Select **Option C**, combined phased enforcement: install unconditional PostgreSQL guards that reject every `UPDATE`, `DELETE`, and `TRUNCATE` against `AuditEvent`, `ProjectActivityEvent`, and `InventoryMovement`, then separate the non-login database owner/migrator identity from the restricted runtime identity. There is no production-callable bypass through a GUC, function, trigger toggle, role assumption, or equivalent escape path.

Both phases and hosted verification are mandatory before production promotion. The runtime role receives only `SELECT` and `INSERT` on the protected tables and cannot own protected objects, alter or disable their guards, assume the owner/migrator role, or otherwise acquire bypass authority. Corrections create new audit/activity events or linked reversal inventory movements; they never rewrite or erase protected history.

## Context

The source documents describe audit records, project activity, and posted inventory movements as append-only, but an application convention alone does not protect those records from an accidental or compromised direct database write. If the application connects as a table owner or another privileged role, a defect, administrative shortcut, test cleanup, seed reset, or exposed database path can update or delete the same evidence used to reconstruct authorization, project actions, and stock history.

The protected tables serve different domains but share the same integrity requirement. `AuditEvent` records controlled system actions; `ProjectActivityEvent` preserves Phase 1.5 project history; and `InventoryMovement` is the immutable basis from which stock balances are derived. Mutation or deletion can conceal an action, break an investigation, or corrupt the inventory ledger. Production therefore needs enforcement at the database boundary plus a privilege model in which the application cannot neutralize that enforcement.

The decision is deliberately phased to make migration review and operational verification manageable. Installing guards before the role split is useful implementation progress, but it is not production-ready enforcement: a table owner or privileged runtime credential can still alter or disable database protections. Production promotion remains a **NO-GO** until both phases pass hosted verification.

## Options considered

### Option A — rejected: application-only append-only convention

- Summary: Rely on service code, ORM usage, reviews, and tests to avoid updates and deletes of protected history.
- Benefits: No database privilege or deployment changes; ordinary test cleanup and reset scripts remain simple.
- Failure modes: Direct SQL, compromised runtime credentials, an overlooked ORM path, cleanup code, or future service changes can mutate or erase history; application tests cannot make the database invariant unconditional.
- Why selected or rejected: Rejected because it fails the audit- and inventory-integrity hard gates and provides no defense beneath the application layer.

### Option B — rejected: guards without an effective owner/runtime separation

- Summary: Add database triggers or equivalent guards but keep the application runtime as table owner, migrator, superuser, or a role able to assume or modify those identities.
- Benefits: Blocks ordinary update/delete statements and can be delivered before a full privilege redesign.
- Failure modes: The runtime can alter or disable guards, change ownership, use elevated functions or role assumption, or introduce a session-controlled bypass. The apparent control can therefore disappear through the same credential it is meant to constrain.
- Why selected or rejected: Rejected as a production solution. Guard installation is the first phase of Option C, but it cannot independently satisfy the production gate.

### Option C — selected: unconditional guards plus separated database roles

- Summary: First install unconditional `UPDATE`/`DELETE`/`TRUNCATE` rejection on all three protected tables. Then assign protected object ownership and migrations to a separate non-login owner/migrator path and grant the runtime only `SELECT`/`INSERT`, without ownership, alteration, trigger-disable, role-assumption, or bypass authority.
- Benefits: Enforces append-only behavior at the authoritative data boundary, reduces the impact of application compromise or defects, preserves normal event insertion, and makes corrections explicit through compensating records.
- Failure modes: Existing cleanup, seed, migration, retention, or administrative processes may fail; incorrect grants or ownership may leave a bypass; guards may omit `TRUNCATE`; migration deployment may deadlock or interrupt writes; test databases may accumulate data; and a rollback to a privileged runtime can silently restore destructive capability.
- Why selected or rejected: Selected because it is the only option reviewed that combines an unconditional data invariant with a credential model unable to remove that invariant. Its operational costs are manageable through disposable environments, additive seeds, reviewed migrations, and fail-closed promotion gates.

### Option D — rejected: defer enforcement and hold SPF-006 open

- Summary: Keep current behavior, document the gap, and postpone the database and role changes.
- Benefits: Avoids immediate migration, hosting, test-lifecycle, and deployment work.
- Failure modes: Protected history remains destructively writable and SPF-006 cannot provide production assurance.
- Why selected or rejected: Rejected as the implementation choice because it leaves a known integrity gap. It remains the mandatory release posture whenever Option C is incomplete or its evidence fails.

## Hard-gate assessment

- **Audit and material-history integrity:** Unconditional database guards preserve existing audit and project activity rows. Corrections are new events, never destructive edits.
- **Inventory-ledger integrity:** Posted `InventoryMovement` rows cannot be updated, deleted, or truncated. Corrections use new linked reversal movements, preserving the original posting and its audit chain.
- **Server and database authorization:** The restricted runtime role has only the minimum protected-table privileges required by the application. Database ownership, migrations, and runtime access use distinct identities and credentials.
- **No production bypass:** No production-callable GUC, security-definer function, role assumption, trigger toggle, session flag, or equivalent mechanism may bypass append-only enforcement. The runtime cannot own or alter protected objects or disable their guards.
- **Transactional consistency and idempotency:** Event and movement insertion remains part of the existing controlled transactions and idempotent posting paths. This decision does not authorize direct stock-balance mutation or duplicate corrective events.
- **Recovery and rollback:** Deployment requires a pre-migration backup, reviewed forward-fix plan, and restoration evidence. Once protected-table writes occur under the new model, rollback must preserve them; destructive rollback is not acceptable.
- **Environment isolation:** Automated tests and demo resets use positively identified disposable databases. Production, staging, shared, or ambiguously identified databases must never be cleared to accommodate append-only constraints.
- **Production readiness:** The guard migration, effective role separation, least-privilege grants, unavailable admin credential, and hosted positive/negative verification form one release gate. Missing or failed evidence is a **NO-GO**.

## Required safeguards

- Guard all three protected tables against `UPDATE`, `DELETE`, and `TRUNCATE` without conditions. Test each operation independently because row-level triggers alone do not necessarily cover `TRUNCATE`.
- Create a non-login owner identity for protected objects and use a separately controlled migrator/deployment identity when DDL is required. Do not expose either credential to the running application.
- Grant the application runtime only the required schema access plus `SELECT` and `INSERT` on protected tables and required sequence access where applicable. Explicitly revoke ownership, `UPDATE`, `DELETE`, `TRUNCATE`, `TRIGGER`, object-alteration, database-creation, role-creation, replication, superuser, and role-assumption capabilities.
- Verify effective privileges and role memberships from the hosted runtime connection, not only by inspecting migration text. A grant graph or ownership check that exposes a transitive elevation path blocks promotion.
- Do not implement a bypass GUC, environment switch, special function, security-definer mutation path, session-user exception, trigger-disable API, or broadly callable maintenance role. Exceptional repair requires a separately authorized, time-bounded administrative procedure outside the production application credential and must preserve or replace the audit chain under a confirmed incident/recovery decision.
- Preserve existing rows during migration. Run preflight checks for protected-table counts, object ownership, grants, dependencies, active mutation paths, seed/reset behavior, and migration lock risk before installing the controls.
- Make ordinary seed operations additive and idempotent. They may insert missing baseline data but must not clear protected history or depend on rewriting it.
- Make test execution own the full lifecycle of a uniquely named disposable database. The application-under-test receives only the runtime credential; administrative setup and teardown credentials remain outside the application process. Cleanup drops the positively identified disposable database rather than deleting protected rows.
- Permit demo reset only by rebuilding a positively identified disposable demo database. Abort on a missing, malformed, shared, staging, or production identity marker; do not fall back to table truncation or row deletion.
- Express corrections as compensating records: new `AuditEvent` or `ProjectActivityEvent` rows explain the correction, and inventory corrections use authorized linked reversal movements plus any required replacement posting. Preserve actor, reason, source reference, timestamps, idempotency linkage, and original record references.
- Keep balance caches derived from immutable movements. A reversal must update movement and balance effects atomically and exactly once through the authorized domain service.
- Retain and review sanitized hosted evidence showing the exact application/source SHA, migration hash, PostgreSQL version, protected object ownership, effective runtime grants and memberships, positive inserts, rejected update/delete/truncate attempts, denied alteration/trigger-disable/role-assumption attempts, correction/reversal behavior, additive seed repeatability, disposable-test lifecycle, backup/restore, and second-deploy idempotency.
- Fail closed on any unexpected protected-row delta, owner or grant drift, runtime access to an administrative credential, callable bypass, incomplete operation coverage, destructive reset path, failed restore, schema drift, or mismatch between reviewed and deployed artifacts.

## Migration and rollback

1. Inventory current ownership, role memberships, grants, functions, triggers, seed/reset scripts, tests, and application paths touching the protected tables. Capture row counts and stable integrity checks before change.
2. In a reviewed transactional migration where supported, install unconditional guards for `UPDATE`, `DELETE`, and `TRUNCATE` on `AuditEvent`, `ProjectActivityEvent`, and `InventoryMovement`. Preserve all rows; do not rewrite history to make the migration pass.
3. Create or reconcile the non-login owner, controlled migrator, and restricted runtime roles. Transfer protected-object ownership away from the runtime, revoke inherited or transitive elevation, and apply least-privilege runtime grants.
4. Rework ordinary seed and automated-test lifecycle behavior before relying on the new enforcement. Test teardown and authorized demo reset rebuild only uniquely and positively identified disposable databases.
5. Rehearse the exact migration and role configuration against a populated disposable PostgreSQL environment, including a pre-migration backup, protected-data equivalence, rejected destructive operations, positive inserts, role-escalation negatives, idempotent redeploy, and isolated restore.
6. Promote only after the hosted runtime connection proves the complete guard-and-role posture. Guard-only or role-only deployment evidence does not satisfy the production gate.

Before any production writes under the new posture, rollback may restore the verified pre-migration backup if the complete deployment is abandoned. After new protected rows exist, do not roll back by dropping guards, regranting destructive runtime privileges, deleting rows, or reverting the database to a state that loses history. Use a schema-compatible application rollback while retaining the controls, or apply a reviewed forward fix through the controlled migrator. If database restore is unavoidable, reconcile and preserve every protected event and movement created after the backup before service resumes; otherwise remain in maintenance mode and treat recovery as a separately authorized incident decision.

## Implementation and documentation impact

- Code / architecture: Database access is split among non-login owner, controlled migrator, and restricted runtime identities. Application runtime configuration must contain only the restricted credential and no callable append-only bypass.
- Data / schema: Add reviewed database enforcement for the three protected tables without changing their business meaning or deleting existing data. Record migrations, role/grant changes, lock considerations, forward-fix strategy, and schema/data verification in the migration safety documentation when implemented.
- Workflow / permissions: Existing application permissions remain necessary but do not grant protected-history mutation. Authorized corrections use normal domain services to append events or reversal movements.
- UI / mobile: No new UI is approved. Existing reversal/correction surfaces must continue to explain the original and compensating record where applicable; this record does not authorize a generic edit-history action.
- Reporting: Reports and exports continue to read preserved history. Verification must detect missing, rewritten, or duplicate protected records and confirm reversal-aware inventory reporting.
- Knowledge base / training: Dunong should assess whether administrator, QA, or operational troubleshooting material mentions destructive resets or editing posted history. No end-user workflow or business policy changes are created by this record.
- Tests / UAT: Add database-contract, effective-privilege, hosted deployment, test-lifecycle, seed-idempotency, correction, reversal, backup/restore, and negative bypass coverage. Production promotion requires the hosted evidence described above, not local or mocked results alone.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and review unconditional protected-table guards with preservation preflight and migration recovery notes | Database Engineering | Before SPF006-IMM-01 hosted verification | Pending |
| Implement the non-login owner, controlled migrator, and restricted runtime role split; remove transitive elevation paths | Database Engineering / Platform Engineering / Security | Before production promotion | Pending |
| Convert ordinary seed behavior to additive/idempotent operations and disposable demo reset to positive-identity database rebuild | Backend Engineering / Database Engineering | Before hosted verification | Pending |
| Give automated tests a unique disposable-database lifecycle with administrative credentials unavailable to the application-under-test | QA / Platform Engineering / Database Engineering | Before hosted verification | Pending |
| Run exact-SHA hosted positive, destructive-operation, privilege-escalation, correction/reversal, seed, test-lifecycle, backup/restore, drift, and idempotent-redeploy verification | QA / Security / Platform Engineering | Release-candidate verification | Pending |
| Accept or reject the complete evidence packet; keep production at NO-GO until both enforcement phases pass | Decision Chair / Release Manager | Before production promotion | Pending |
| Assess user-facing and operator enablement content for obsolete destructive-reset or posted-history-edit guidance | Dunong | After implementation behavior is verified | Pending |

## Evidence

- The parent Decision Chair confirmed the combined phased-enforcement option for `SPF006-IMM-01` on 2026-07-21.
- Three independent specialist reviews each recommended the combined guard-and-role solution with **High confidence**. Their shared conclusion was that trigger/guard enforcement without effective owner separation is bypassable, while role separation without unconditional mutation guards leaves correctness dependent on grants and application behavior. No review identified a credible production-safe bypass requirement.
- The independent reviews identified the same production blockers: runtime ownership or migrator/admin credential exposure, incomplete `TRUNCATE` protection, production-callable bypasses, destructive test/seed/reset assumptions, and absence of hosted effective-privilege verification. The confirmed safeguards and NO-GO gate directly address those failure modes.
- `AGENTS.md` requires important records to use cancellation, reversal, archival, or deactivation; derives inventory balances from an immutable movement ledger; and requires role separation, transactional posting, idempotency, audit history, and recovery safeguards.
- `docs/core/00-governance/SUBAGENT_DELIBERATION_PROTOCOL.md` treats audit completeness, immutable inventory history, server authorization, transactional consistency, and recoverability as hard gates.
- `docs/core/00-governance/DECISION_SCORECARD.md` provides the control-first evaluation framework used for confirmed material decisions.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` identifies SPF-006 as the production-foundation workstream for immutable audit and activity history.
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md` declares `audit_events` append-only.
- `docs/core/03-data/DATABASE_SCHEMA.md` establishes append-only audit records as a schema principle.
- `docs/phases/phase-01-5-projects-implementation/data/WORK_MANAGEMENT_DATA_MODEL_EXTENSION.md` declares project activity events append-only.
- `docs/core/00-governance/decisions/DEC-0009-QUANTITY-INVENTORY-LEDGER-FOUNDATION-FIRST.md` establishes append-only posted inventory movements and linked opposite movements for reversal.

## Supersession

This decision is not superseded. A later decision that changes the protected-table set, append-only correction semantics, production database-role boundary, or SPF-006 promotion evidence must explicitly supersede this record; it must not silently introduce a production-callable bypass.
