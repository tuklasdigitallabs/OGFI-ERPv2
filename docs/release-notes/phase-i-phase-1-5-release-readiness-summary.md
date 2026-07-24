# OGFI ERP Release Notes — Phase I And Phase 1.5 Readiness Summary

**Release date:** Pending UAT execution and go-live approval  
**Audience:** Branch managers, warehouse/storekeeping users, purchasing users, approvers, project users, administrators, auditors, and implementation leads  
**Affected locations / roles:** Users with scoped Phase I procurement, inventory, approval, reporting, notification, project tracker, or administration access

## What changed

- Phase I operational workflows now cover Purchase Requests, approvals, supplier quotations, Purchase Orders, receiving, inventory ledger, transfers, stock counts, wastage, stock adjustments, dashboard visibility, reports, exports, notifications, and audit history.
- Receiving supports accepted, rejected, damaged, short, and outstanding quantities, discrepancy reason/evidence reference, accepted-only inventory posting, PO status updates, and full-document receipt reversal.
- Purchase Orders support bounded issued/unreceived amendment requests for same-line quantity, unit price, line note, and expected delivery date changes with supplier notice evidence/explanation, approval, audit history, and `AMENDMENT_PENDING` receiving block.
- Transfers support request, submit, dispatch, partial/discrepancy receipt, accepted-only destination posting, receipt-event audit, and receipt reversal.
- Stock counts support blind entry, review/recount controls, frozen-count movement blocking, and reviewed count-generated Stock Adjustment records.
- Wastage and Stock Adjustments use approval-first, separate posting, source-linked ledger movements, and full-document reversal controls.
- The Operations Dashboard now shows when each response was assembled and whether each authorized, attempted source was available when checked, with times displayed in `Asia/Manila`. A partial view means a source summary was unavailable, not that its count was zero. `Source data as of` appears only where the source supplies that meaning; none of these labels claims that data is fresh, stale, or within an SLA. Open the source workspace for authoritative records and a new access check.
- The Operations Dashboard Ledger Variance signal now opens a dedicated, selected-location diagnostic profile for users with both Stock Balances and Inventory Ledger access. It compares cached balances with immutable ledger totals, provides exact ledger traces and a diagnostic CSV, and never edits balances or creates adjustments.
- Implemented Phase I procurement and inventory multi-step approval routes keep the source record pending until the final step, notify each next eligible approver, and notify the requester or responsible owner after final approval, return, or rejection. Decision-time authority checks reject stale, reassigned, revoked, or losing concurrent actions instead of overwriting the accepted decision.
- Wastage cancellation and approval are concurrency-controlled so one accepted action cannot be overwritten by the other.
- Phase 1.5 Projects & Implementation Tracker supports scoped projects, templates, members, tasks, checklists, comments, blockers, risks, milestones, project reports, notifications, calendar visibility, and safe links to ERP records.
- Tracker links remain references only; project tasks do not approve, receive, post, close, or mutate operational source records.
- Knowledge-base and quick-start training content is now available for Phase I operational users and administrators.
- Core Administration Users & Access now uses server-owned name/email and status filters with bounded URL-backed pagination. Accounts with Core Administration but without `Administer tenant-wide roles` receive an explicit restricted state before privileged records load; this preserves the existing authorization boundary.
- Core Administration now also requires active selected-company `Manage` scope for overview reads, limits organization context to the selected company, requires tenant-role authority before company creation, and verifies selected-company membership before returning user detail or scopes.
- The Roles & Permissions workspace now provides server-owned name/code and status filters, exact paginated role results, permission counts, and bounded previews. Role detail keeps the same tenant-role and selected-company Manage authorization; the onboarding role selector is explicitly a bounded convenience list.
- Audit Trail review now uses bounded server pagination and redacted detail/export projections. Actor contact/IP fields and sensitive nested values are omitted or masked; immutable audit history remains unchanged. Hosted, responsive, and disposable-PostgreSQL evidence remain pending for release approval.
- Organization Scope Locations now uses selected-company server filters, deterministic pagination, and a bounded active location catalog for onboarding. Company, Brand, and Department registries remain pending separate production contracts.
- Acceptance traceability now maps each Phase I and Phase 1.5 UAT workflow to current automated evidence, manual proof still required, and remaining release gates.
- Pilot deployment hardening now keeps Redis/worker out of the default no-queueing runtime, localhost-binds internal development service ports, runs app containers as non-root in the Docker examples, and provides repeatable PostgreSQL backup/restore-check helper commands for release evidence.
- A manual staging release rehearsal workflow now runs the release gates, uploads release evidence artifacts, and provides guarded staging deploy/rollback scripts for environments with approved SSH secrets.
- The staging release rehearsal workflow now runs a PostgreSQL backup and restore check against an isolated rehearsal database and uploads backup/restore evidence.
- A manual staging rollback rehearsal workflow now restores a named staging release, runs post-rollback smoke checks, and uploads rollback command evidence.
- Health and readiness checks now expose safe liveness, required configuration, and database connectivity status at `/health`, `/readiness`, `/api/health`, and `/api/readiness` for staging/prod monitoring without requiring Redis or queue services.
- A repeatable release smoke command now captures all health/readiness endpoints, sign-in reachability, and protected-route redirect evidence for staging or pilot URLs.
- A repeatable pilot readiness command now captures read-only database evidence for organization scope, users, role/scope assignments, approvals, master data, opening stock, and project tracker setup before transaction UAT.
- A repeatable release data snapshot command now captures source-of-truth table counts before and after migration or staging release rehearsal, and the staging rehearsal workflow uploads pre/post migration snapshot artifacts.
- A repeatable data snapshot comparison command now produces a delta report so reviewers can see created tables, missing tables, and row-count changes before release approval.
- A repeatable GO/NO-GO evidence summary command now scans required evidence documents and artifact folders for unresolved release blockers before owner signoff.
- A release evidence collection guide and `pnpm release:evidence:init` helper now standardize where workflow artifacts, generated readiness reports, backup/restore proof, rollback evidence, and signed documents must be placed before the GO/NO-GO summary is run.
- A repeatable `pnpm release:milestones` report now summarizes which release-readiness milestones have local tooling/documentation in place and which still need external UAT, deployment, rollback, backup/restore, training, or signoff evidence.
- A repeatable `pnpm release:tools:test` self-test now verifies the local release evidence helpers, milestone report, GO/NO-GO missing-evidence behavior, and smoke evidence generation without requiring staging credentials, then writes `self-tests/release-tools-self-test-*.txt` evidence.
- A repeatable `pnpm release:summary` command now writes the release candidate metadata required by GO/NO-GO review.
- A repeatable `pnpm release:backup-summary` command now writes backup artifact metadata required by GO/NO-GO review.
- A repeatable `pnpm release:restore-summary` command now writes the isolated restore-check metadata required by GO/NO-GO review.
- A repeatable `pnpm release:rollback-summary` command now writes the rollback metadata required by GO/NO-GO review.
- A repeatable `pnpm release:data-snapshot:compare-latest` command now selects the latest standard pre/post migration snapshot files and delegates to the data-snapshot comparison gate.
- A repeatable `pnpm release:evidence:manifest` command now creates SHA-256 checksum evidence for collected release artifacts.
- Staging deploy and rollback workflow artifacts now include generated evidence manifests alongside their smoke, deploy, rollback, and data-snapshot evidence.
- GO/NO-GO evidence now requires release candidate metadata in `release-summary.txt`, a release-helper self-test artifact, and an evidence manifest, in addition to UAT, deployment, rollback, backup/restore, pilot readiness, smoke, and training evidence.
- Pilot hypercare and defect intake now have a dedicated runbook covering support roles, severity, triage cadence, daily review, rollback/hold/forward-fix decisions, and communication templates.
- Separate staging and production environment templates now document environment-specific domains, databases, object storage, monitoring, and backup/restore placeholders without committing real secrets.
- CI and staging rehearsal now include an automated secret-review gate for tracked env files, private key artifacts, and high-risk secret patterns.

## What you need to do

- Complete the UAT evidence pack before go-live approval.
- Review the acceptance traceability matrix before UAT so testers know which automated checks exist and which manual evidence must still be captured.
- Train pilot branch, warehouse/storekeeper, purchasing, approver, project, and administrator users using the linked quick-start modules.
- Confirm role, permission, approval, branch/warehouse, project, and export scope assignments before UAT.
- Run `pnpm release:pilot-readiness` against the pilot or staging database and attach the generated evidence file to the UAT setup gate.
- Run `pnpm release:data-snapshot` before and after pilot or production migration/release rehearsal and attach both artifacts to the deployment evidence checklist. The manual staging rehearsal workflow captures pre/post snapshots automatically, and guarded staging deploy collects remote snapshots when `psql` is available.
- Run `pnpm release:data-snapshot:compare-latest` for standard rehearsal folders or `pnpm release:data-snapshot:compare` for manual before/after snapshot pairs, then review unexpected deltas before release approval. Missing-after or unmatched table deltas fail by default and require approved destructive-migration evidence to override.
- Run the `Staging Rollback Rehearsal` workflow against a previous staging release and attach the rollback evidence artifact before final GO approval.
- Review the staging rehearsal backup/restore artifact and rerun equivalent backup/restore proof against the real pilot or production release environment before final GO approval.
- Run `pnpm release:evidence:init` and follow `docs/core/07-quality/PHASE1_PHASE1_5_RELEASE_EVIDENCE_COLLECTION_GUIDE.md` when collecting downloaded workflow artifacts, signed evidence, and external-security proof references into the final review folder.
- Run `pnpm release:summary` with approved release metadata when evidence is collected manually outside the staging rehearsal workflow.
- Run `pnpm release:backup-summary` after backup creation when backup evidence is collected manually outside the staging rehearsal workflow.
- Run `pnpm release:restore-summary` after isolated restore verification when backup/restore evidence is collected manually outside the staging rehearsal workflow.
- Run `pnpm release:rollback-summary` with approved rollback metadata when rollback evidence is collected manually outside the staging rollback workflow.
- Run `pnpm release:evidence:manifest` after collecting workflow artifacts, signed evidence documents, or external-security proof references.
- Run `pnpm release:milestones` for an advisory progress view before final GO/NO-GO review.
- Run `pnpm release:tools:test` after release helper changes or before a release rehearsal to verify the local helper behavior and attach the generated `self-tests/release-tools-self-test-*.txt` artifact.
- Run `pnpm release:go-no-go` against the collected evidence folder before signoff. If signed evidence documents are copied outside the source tree, set `RELEASE_UAT_EVIDENCE_FILE`, `RELEASE_DEPLOYMENT_EVIDENCE_FILE`, and `RELEASE_TRAINING_EVIDENCE_FILE` to those files. External-security proof references must still be present under `external-security/` with the matching evidence run ID. Treat a clean report as review-ready, not as automatic approval.
- Confirm pilot support contacts, defect intake route, daily triage cadence, and rollback decision owner before go-live approval.
- Capture evidence references during receiving discrepancies, transfer discrepancies, wastage, and stock adjustments.
- Use dashboard cards and notifications to open source records; do not treat them as source records.
- If the dashboard reports a partial response, review the unavailable source workspaces before concluding that no work or exception exists. Treat `Dashboard assembled` and `Checked` as observation times, not freshness or SLA evidence.
- Investigate Ledger Variance through its exact ledger trace. Escalate a confirmed cache mismatch; do not use a Stock Adjustment to conceal a technical cache-to-ledger difference.

## Important notes

- Food Cost summaries are temporarily withheld from Overview, and Restaurant Operations scans create no new Food Cost exception reminders, while business-date alignment, missing movement valuation, and `AWAITING_ACTUALS` semantics remain under `DEC-0062` review. Authorized users can still open Food Cost Analysis as the source workspace. Older Food Cost notifications remain historical and must be verified against current source evidence.

- This release note is a readiness summary. It is not a go-live signoff.
- These approval-integrity changes do not by themselves complete SPF-006 or establish production readiness; the remaining audit-integrity and release gates still apply.
- UAT execution, defect disposition, deployment rehearsal, rollback evidence, backup/restore evidence, external-security proof references, and final release approval remain required before GO.
- Latest local release-candidate verification on 30 June 2026 passed lint, typecheck, production build, the standard app test suite at 32 files / 274 tests, the named access-control integration gate (`pnpm test:access-control`) at 1 file / 2 tests, and the Playwright desktop/mobile e2e smoke at 10 tests. These checks must still be rerun in CI/staging for final release approval.
- CI now includes production build and Playwright e2e gates; the manual staging release rehearsal workflow must still be executed for the release candidate, and staging deployment, backup/restore, rollback drill, smoke-test artifacts, and signed GO/NO-GO evidence still need environment execution.
- No queueing functionality is included in the Phase I or Phase 1.5 scope.
- Binary upload/download for all operational attachments remains a deferred shared attachment-service hardening item. Current operational evidence guidance uses evidence references where implemented.
- Full post-receiving PO amendment and supplier/location/line-add/delete/substitution/payment-term amendment, backdated operational correction, partial receiving-line reversal, transfer dispatch reversal, automated replacement/finance settlement, automated notification scheduler, email delivery, time-limited download links, and formal PDF summaries remain deferred controlled transitions. Transfer discrepancy closure is available as a non-posting audited settlement action.
- Project tracker records coordinate work only. Purchasing, inventory, receiving, approval, finance, and audit source records remain in their proper modules.

## Learn more

- `docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md`
- `docs/core/07-quality/PHASE1_PHASE1_5_ACCEPTANCE_TRACEABILITY_MATRIX.md`
- `docs/core/07-quality/PHASE1_PHASE1_5_RELEASE_EVIDENCE_COLLECTION_GUIDE.md`
- `docs/core/07-quality/PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md`
- `docs/knowledge-base/PHASE1_KNOWLEDGE_BASE_BACKLOG.md`
- `docs/training/phase-i-branch-manager-quick-start.md`
- `docs/training/phase-i-warehouse-storekeeper-quick-start.md`
- `docs/training/phase-i-purchasing-quick-start.md`
- `docs/training/phase-i-administrator-setup-guide.md`
- `docs/training/phase-1-5-project-tracker-quick-start.md`
- `docs/knowledge-base/projects/README.md`

## Support

Raise UAT defects, training gaps, permission issues, or release blockers through the assigned ERP implementation owner and the Phase 1.5 project tracker.
