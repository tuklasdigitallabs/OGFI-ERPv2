# DEC-0048 — Project Requirement Attachment Context

## Metadata

- Decision ID: `DEC-0048`
- Title: Project Requirement Attachment Context
- Status: `Confirmed`
- Date: 2026-07-21
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation — SPF-005 controlled evidence uploads; Phase 1.5 Projects & Implementation Tracker; Phase IV project requirements
- Related decision brief: Parent-confirmed corrective decision after review of the project-attachment, project-requirement, and controlled-evidence implementation

## Decision

Select **Option A**: correct the `ProjectAttachment` database contract so that it accepts only task-only, comment-only, requirement-only, and task-plus-requirement contexts. A task-plus-requirement link is valid only when `ProjectAttachment.taskId` equals the linked `ProjectRequirement.taskId`; parentless rows, comment rows mixed with either task or requirement, and mismatched task/requirement rows are rejected at the database boundary.

`Attachment` remains the binary and storage-lifecycle source of truth, `ProjectRequirement` remains the requirement-workflow source of truth, `ProjectAttachment` remains the project association and activity context, and `ControlledEvidenceAttachment` remains the source-record access and preservation companion. Creating or archiving requirement evidence must keep the controlled-evidence link, project link, and corresponding activity/audit writes atomic.

## Context

The original `ProjectAttachment` migration installed an `exactly_one_parent` check that requires exactly one of `taskId` or `commentId`. A later migration added nullable `requirementId`, and the controlled-evidence upload service now creates a project link for a project requirement with `requirementId` and the requirement's optional `taskId`. Therefore a project-wide requirement produces a requirement-only row that the original check rejects, while a task-scoped requirement produces a task-plus-requirement row that the same check also rejects.

The existing scoped foreign keys correctly bind the project attachment to its tenant, company, project, task when present, requirement when present, and shared attachment metadata. They do not by themselves prove that a simultaneously populated `taskId` is the task assigned to the linked requirement. Leaving this relationship to application validation would allow direct, future, retried, or defective write paths to create a semantically false project evidence association.

This is a relational-context correction, not a change to evidence ownership or workflow authority. A requirement can be project-wide or task-scoped. A comment attachment remains an independent comment context and cannot also claim task or requirement parentage through the project-attachment link.

## Options considered

### Option A — selected: corrective migration with fail-closed database enforcement

- Summary: Replace the obsolete parent check with an explicit allowed-context constraint, retain all existing tenant/company/project and parent foreign keys, and add database enforcement that a dual task-plus-requirement link matches `ProjectRequirement.taskId`. Preflight and validate existing data before accepting the new contract.
- Benefits: Supports both project-wide and task-scoped requirements, preserves project association and activity, rejects every ambiguous or contradictory parent combination regardless of write path, and keeps the database aligned with the implemented controlled-evidence transaction.
- Failure modes: A migration that drops the old check before proving the replacement could create an integrity window; legacy invalid rows could prevent validation; a check constraint alone cannot compare a row with `ProjectRequirement.taskId`; nullable composite-key semantics could be implemented incorrectly; or an application rollback could reintroduce writes that assume the obsolete check.
- Why selected or rejected: Selected because it is the only option that preserves the intended requirement contexts, the project activity model, and database-level integrity without changing evidence ownership.

### Option B — rejected: use `ControlledEvidenceAttachment` only

- Summary: Keep requirement evidence linked only through `ControlledEvidenceAttachment` and stop creating `ProjectAttachment` rows.
- Benefits: Avoids the conflicting project-attachment parent check and reduces the number of link rows.
- Failure modes: Removes the canonical project association used for project-authorized reads and project activity, splits requirement evidence from the established project attachment lifecycle, and makes the controlled-evidence companion incorrectly carry project-context responsibility.
- Why selected or rejected: Rejected because `ControlledEvidenceAttachment` owns source-record access and preservation context; it does not replace `ProjectAttachment` as the project association.

### Option C — rejected: require every evidence requirement to have a task

- Summary: Permit only task-plus-requirement evidence and require `ProjectRequirement.taskId` for any requirement that accepts an attachment.
- Benefits: Produces one uniform attachment context and avoids requirement-only links.
- Failure modes: Invalidates legitimate project-wide requirements, silently changes requirement workflow semantics, and forces artificial task creation solely to satisfy storage linkage.
- Why selected or rejected: Rejected because project-wide requirements are valid and the attachment model must support them rather than narrowing the business model.

### Option D — rejected: defer the correction

- Summary: Leave the existing schema and service behavior unchanged until a later evidence or project release.
- Benefits: No immediate migration work.
- Failure modes: Valid upload intents continue to fail at runtime; service and database contracts remain contradictory; future workarounds may bypass activity or integrity controls; and task/requirement mismatches remain insufficiently protected.
- Why selected or rejected: Rejected because the known conflict is on an active controlled-evidence path and deferral does not pass the data-integrity or fail-closed gates.

## Hard-gate assessment

- **Tenant, company, and project isolation:** Preserve the existing scoped foreign keys from `ProjectAttachment` to `Project`, `ProjectTask`, `ProjectRequirement`, and `Attachment`. No parent identifier is trusted without its enforced organizational scope.
- **Server-enforced authorization:** Existing project and controlled-evidence services must continue to authorize the source requirement and project before writing or reading either link. The database constraints supplement rather than replace service authorization.
- **Audit integrity:** A requirement-evidence operation must write the controlled-evidence link, project link, project activity, and applicable audit event in one transaction. No partial association may be reported as successful.
- **Transactional consistency and idempotency:** Retried upload intents must not create duplicate active associations or activity. Existing idempotency and uniqueness controls remain required, with new requirement-context uniqueness added if the corrective implementation identifies a duplicate path.
- **Relational integrity:** The database must reject all parentless rows, all comment-plus-task or comment-plus-requirement rows, and every task-plus-requirement row whose task differs from `ProjectRequirement.taskId`. Application-only comparison is insufficient.
- **Evidence preservation:** `Attachment` continues to own immutable binary identity and storage state. `ControlledEvidenceAttachment` continues to carry source-record and preservation controls. Archiving a project link does not hard-delete bytes or bypass retention or legal hold.
- **Phase scope:** The correction changes only the project attachment relationship contract. It does not add a document-management system, change requirement status semantics, or allow evidence to approve or mutate a controlled ERP source record.
- **Recovery:** Use a forward-fix migration. Do not down-migrate by deleting valid requirement links or restoring the obsolete check. A schema-compatible application rollback or maintenance mode must keep invalid writes fail closed while a reviewed forward fix is applied.

## Required safeguards

- Express the allowed contexts as an explicit database truth table:
  - task-only: `taskId` populated; `commentId` and `requirementId` null;
  - comment-only: `commentId` populated; `taskId` and `requirementId` null;
  - requirement-only: `requirementId` populated; `taskId` and `commentId` null;
  - task-plus-requirement: `taskId` and `requirementId` populated; `commentId` null, with the linked requirement assigned to that same task.
- Reject every other combination, including all-null, comment-plus-task, comment-plus-requirement, all three parents, and a requirement linked to a different task.
- Retain the existing tenant, company, project, task, requirement, and attachment foreign keys. Do not weaken scoped relations or replace them with unscoped identifiers.
- Enforce task/requirement agreement in PostgreSQL through a reviewed relational constraint, such as a scoped composite foreign key to an eligible unique `ProjectRequirement` identity that includes `taskId`, or an equivalently fail-closed constraint trigger. A row check alone is not sufficient because it cannot inspect the requirement row.
- Run preflight queries for every allowed and rejected context, orphan, cross-scope association, duplicate active link, and task/requirement mismatch. Abort without modifying data if any unexplained invalid row exists.
- Install and validate the replacement constraint and task/requirement agreement enforcement in the same reviewed migration transaction. Avoid any committed interval in which neither the old nor replacement integrity rule is enforced.
- Preserve valid existing task-only and comment-only rows without rewriting their identity, actors, timestamps, status, or activity history. Do not silently coerce an invalid row into a different parent context.
- Keep creation of `Attachment`, `ControlledEvidenceAttachment`, `ProjectAttachment`, upload intent, project activity, and applicable audit metadata within the existing transaction boundary. Keep companion project-link archive and project activity within the controlled-evidence archive transaction.
- Continue to re-authorize downloads and lifecycle actions against the controlled source record and project visibility. Possession of an attachment, project-link, or requirement identifier is never authority.
- Add positive tests for all four allowed contexts and negative tests for every rejected combination, cross-scope parents, a project-wide requirement paired with a task, and a task-scoped requirement paired with the wrong task. Exercise direct database writes as well as service paths.
- Verify transaction rollback for failures after each dual-link/activity write boundary, idempotent retry behavior, archive/legal-hold preservation, and schema drift after migration.
- Treat rollback as forward-fix. If deployment must retreat, use a schema-compatible prior application build or maintenance mode; do not remove the new constraints or delete valid requirement associations merely to recreate the obsolete parent check.

## Implementation and documentation impact

- Code / architecture: Keep the existing controlled-evidence service boundary and atomic transaction. Align service validation and stable error handling with the four accepted contexts and database rejection behavior; no new storage owner or privileged direct write path is authorized.
- Data / schema: Add one reviewed corrective Prisma migration that replaces `ProjectAttachment_exactly_one_parent_chk` and enforces task/requirement equality at the database boundary while preserving existing scoped foreign keys. Update the Prisma relation/index definitions only as required to represent that enforcement.
- Workflow / permissions: No requirement status, evidence approval, membership, or source-record authorization rule changes. Evidence availability still cannot submit, approve, waive, cancel, or otherwise decide a requirement.
- UI / mobile: No new visible workflow is approved. Existing requirement upload surfaces should stop receiving database-constraint failures for valid project-wide and task-scoped evidence and should continue to present user-safe failures for rejected or stale contexts.
- Reporting: No report definition changes. Existing project attachment/activity counts must remain consistent after the corrective migration.
- Knowledge base / training: Dunong should assess whether user-facing requirement-evidence guidance needs clarification after the correction is implemented and verified. No new user policy or navigation is established by this record.
- Tests / UAT: Add migration, schema, service, authorization, idempotency, transaction-rollback, preservation, and four-context truth-table coverage. UAT must include project-wide and task-scoped requirement evidence on desktop and mobile where those surfaces are released.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the corrective migration with preflight, allowed-context check, and database-enforced task/requirement agreement | Database Engineering | Before SPF-005 acceptance | Implemented; exact-SHA rehearsal pending |
| Align service validation and stable errors; preserve atomic controlled/project links and activity | Backend Engineering | With the corrective migration | Existing atomic service path verified; broader failure-injection evidence pending |
| Add direct-database and service truth-table, scope, mismatch, idempotency, rollback, and preservation tests | QA / Database Engineering / Backend Engineering | Before migration acceptance | Database contract and 19-scenario authorization suite pass; exact-SHA negative-fixture rehearsal pending |
| Update the Phase 1.5 data extension and ERP data dictionary from “exactly one task/comment parent” to the confirmed four-context contract | Mithi | After implementation behavior is verified | Complete |
| Assess and update requirement-evidence help content if released behavior or troubleshooting changes | Dunong | After implementation and UAT acceptance | Guidance and glossary updated; UAT acceptance pending |

## Evidence

- The parent Decision Chair confirmed Option A and the four-context truth table on 2026-07-21, including rejection of Options B, C, and D and the required forward-fix rollback posture.
- `packages/database/prisma/migrations/20260701070000_project_attachment_links/migration.sql` creates `ProjectAttachment_exactly_one_parent_chk`, which accepts exactly one of `taskId` and `commentId` and predates requirement attachment contexts.
- `packages/database/prisma/migrations/20260711110000_expansion_project_requirements/migration.sql` adds nullable `ProjectAttachment.requirementId` and the scoped requirement foreign key without replacing the original parent check.
- `packages/database/prisma/migrations/20260721120000_reconcile_schema_drift/migration.sql` strengthens the requirement link to a tenant/company/project-scoped restrictive foreign key but does not enforce equality between `ProjectAttachment.taskId` and `ProjectRequirement.taskId`.
- `packages/database/prisma/schema.prisma` defines nullable `ProjectAttachment.taskId`, `commentId`, and `requirementId`; scoped task and requirement relations; nullable `ProjectRequirement.taskId`; and separate `Attachment` and `ControlledEvidenceAttachment` relations.
- `apps/web/src/server/services/evidenceUploads.ts` creates `ControlledEvidenceAttachment`, then creates `ProjectAttachment` with the requirement ID and optional requirement task ID, and records project activity within the same database transaction.
- `apps/web/src/server/services/attachments.ts` archives the active project companion link and creates project activity within the controlled-evidence archive transaction without deleting the binary attachment.
- `docs/core/03-data/ERP_DATA_DICTIONARY.md` identifies requirements as having project-scoped attachment associations and shared private attachment storage.
- `docs/phases/phase-01-5-projects-implementation/PROJECTS_IMPLEMENTATION_PRODUCT_SPEC.md` establishes project evidence, auditable activity, restricted project access, and source-record separation as Phase 1.5 controls.
- `docs/phases/phase-01-5-projects-implementation/data/PROJECTS_IMPLEMENTATION_DATA_EXTENSIONS.md` still describes the earlier task/comment “exactly one parent” contract and therefore requires a follow-up consistency update after implementation verification.
- `DEC-0046-CONTROLLED-EVIDENCE-ON-HOSTINGER-VPS.md` establishes PostgreSQL source-record authority, atomic/idempotent evidence lifecycle controls, private binary storage, legal-hold preservation, and fail-closed behavior.

## Supersession

This decision is not superseded. It narrows and corrects the `ProjectAttachment` context contract without superseding `DEC-0046` or changing the evidence-storage architecture. A later decision that changes valid project attachment parents, project-requirement scope, or evidence ownership must explicitly supersede this record.
