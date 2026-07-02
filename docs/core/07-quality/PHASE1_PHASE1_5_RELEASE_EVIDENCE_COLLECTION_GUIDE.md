# Phase I And Phase 1.5 Release Evidence Collection Guide

**Status:** Release-manager guide; execution pending  
**Created:** 30 June 2026  
**Applies to:** Staging rehearsal, rollback rehearsal, pilot UAT, production GO / NO-GO review

## Purpose

Use this guide to collect generated release artifacts and signed evidence documents into one review folder before running the final GO / NO-GO evidence summary.

This guide does not approve release. It only standardizes where evidence is collected so the release owner, QA lead, security owner, DevOps owner, and product owner can review the same material.

## Source Documents

Complete these records before treating a release as GO-review ready:

- `PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md`
- `PHASE1_PHASE1_5_DEPLOYMENT_ROLLBACK_EVIDENCE_CHECKLIST.md`
- `PHASE1_PHASE1_5_PILOT_HYPERCARE_AND_DEFECT_RUNBOOK.md`
- `../08-knowledge-and-enablement/PHASE1_PHASE1_5_TRAINING_IMPACT_ASSESSMENT.md`

Use signed copies of those documents when final signoff happens outside the repository. Do not edit repository templates merely to make placeholders disappear.

## Evidence Folder Layout

Create one release evidence folder for the release candidate:

```text
pnpm release:evidence:init
```

To initialize a folder outside the working tree, set `RELEASE_EVIDENCE_ROOT`:

```text
RELEASE_EVIDENCE_ROOT=<collected-release-evidence> pnpm release:evidence:init
```

The command creates this layout and writes a local `COLLECTION_README.txt`:

```text
release-evidence/
  build-check/
  secret-review/
  data-snapshots/
  data-snapshot-checklist/
  data-snapshot-status/
  backups/
  backup-restore-status/
  recovery-checklist/
  blocker-digest/
  deployment-checklist/
  deployment-status/
  external-evidence-guide/
  pilot-readiness/
  uat-checklist/
  uat-status/
  pilot-uat-status/
  enablement-checklist/
  enablement-status/
  smoke/
  self-tests/
  status-suite/
  interim-review/
  staging-rollback/
    smoke/
  final-review-status/
  signed-evidence-checklist/
  signed-evidence-status/
  go-no-go/
  manifests/
  pending-evidence-checklist/
  release-metadata/
  rehearsal-command-plan/
  signed-document-templates/
  signed-documents/
```

If evidence is collected outside the working tree, keep the same folder names and set `RELEASE_EVIDENCE_ROOT` to that folder when running the summary command.

## Artifact Sources

| Evidence area                | Primary source                                                                                                                             | Required destination                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Web production build check   | `pnpm release:build-check` or the matching CI build artifact                                                                                | `build-check/build-check-*.txt`                          |
| Secret and no-queue review   | `pnpm release:secret-review` or the matching CI security artifact                                                                           | `secret-review/secret-review-*.txt`                      |
| Release summary preflight    | `pnpm release:summary-preflight` before generating `release-summary.txt`                                                                    | `release-summary-preflight-*.txt`                        |
| Data snapshot preflight      | `pnpm release:data-snapshot-preflight` before collecting migration rehearsal row counts                                                     | `data-snapshots/data-snapshot-preflight-*.txt`           |
| Pre-migration data snapshot  | `Staging Release Rehearsal` workflow or `pnpm release:data-snapshot` before migration                                                      | `data-snapshots/data-pre-migration-rehearsal-*.txt`      |
| Post-migration data snapshot | `Staging Release Rehearsal` workflow or `pnpm release:data-snapshot` after migration                                                       | `data-snapshots/data-post-migration-rehearsal-*.txt`     |
| Data snapshot delta          | `pnpm release:data-snapshot:compare-latest` for rehearsal folders, or `pnpm release:data-snapshot:compare` for explicit before/after files | `data-snapshots/data-snapshot-delta-*.txt`               |
| Data snapshot checklist      | `pnpm release:data-snapshot-checklist` to generate the DBA/platform owner migration snapshot checklist, preflight PASS expectation, migration proof fields, delta waiver controls, and manifest-integrity handoff | `data-snapshot-checklist/data-snapshot-checklist-*.txt` |
| Data snapshot status         | `pnpm release:data-snapshot-status` after snapshot or delta evidence changes                                                               | `data-snapshot-status/data-snapshot-status-*.txt`        |
| Backup/restore preflight     | `pnpm release:backup-restore-preflight` before attempting backup or restore commands                                                        | `backups/backup-restore-preflight-*.txt`                 |
| Database backup              | `Staging Release Rehearsal` workflow or `pnpm release:backup-summary` after backup artifact creation                                       | `backups/ogfi-erp-*.dump`; `backups/backup-summary.txt`  |
| Backup checksum              | `pnpm db:backup`; final review requires the generated checksum artifact                                                                    | `backups/ogfi-erp-*.dump.sha256`                         |
| Restore rehearsal            | `Staging Release Rehearsal` workflow or `pnpm release:restore-summary` after isolated restore verification; `RESTORE_DATABASE` is optional when `RESTORE_DATABASE_URL` contains the intended restore database name | `backups/restore-check-summary.txt`                      |
| Backup/restore readiness status | `pnpm release:backup-restore-status` after backup, restore, rollback, or smoke evidence changes                                         | `backup-restore-status/backup-restore-status-*.txt`      |
| Recovery evidence checklist | `pnpm release:recovery-checklist` to generate the owner-facing backup, checksum, isolated restore, rollback, and smoke evidence checklist | `recovery-checklist/recovery-evidence-checklist-*.txt`   |
| Release blocker digest     | `pnpm release:blocker-digest` after status reports are refreshed to group latest blockers by owner                                        | `blocker-digest/blocker-digest-*.txt`                    |
| Deployment evidence checklist | `pnpm release:deployment-checklist` to generate the owner-facing release candidate, environment separation, deployment, rollback, smoke, monitoring, signoff, and manifest-integrity checklist | `deployment-checklist/deployment-evidence-checklist-*.txt` |
| Deployment and rollback status | `pnpm release:deployment-status` after each deployment checklist update                                                                   | `deployment-status/deployment-status-*.txt`               |
| External evidence collection guide | `pnpm release:external-evidence` to generate the ordered collection handoff, environment context, and non-fabrication boundaries     | `external-evidence-guide/external-evidence-guide-*.txt`   |
| External evidence rehearsal command plan | `pnpm release:rehearsal-plan` to generate the command-by-command migration, backup, restore, rollback, smoke, UAT, and final-gate rehearsal path | `rehearsal-command-plan/rehearsal-command-plan-*.txt` |
| Pilot readiness preflight    | `pnpm release:pilot-readiness-preflight` before the DB-backed readiness check                                                               | `pilot-readiness/pilot-readiness-preflight-*.txt`         |
| Pilot setup readiness        | `DATABASE_URL=<pilot-or-staging-url> pnpm release:pilot-readiness`; this must prove all enumerated Phase I and Phase 1.5 permission codes exist, not just a partial seed | `pilot-readiness/pilot-readiness-*.txt`                  |
| UAT execution checklist      | `pnpm release:uat-checklist` to generate the owner-facing scope/session, scenario, evidence-reference, waiver, and signoff checklist; this is advisory and does not execute UAT | `uat-checklist/uat-execution-checklist-*.txt`            |
| UAT evidence status          | `pnpm release:uat-status` after each UAT evidence pack update                                                                               | `uat-status/uat-status-*.txt`                             |
| Pilot and UAT readiness status | `pnpm release:pilot-uat-status` after pilot setup or UAT evidence changes                                                                | `pilot-uat-status/pilot-uat-status-*.txt`                |
| Enablement evidence checklist | `pnpm release:enablement-checklist` to generate the owner-facing training, known-limit, hypercare, defect/waiver, signoff, and manifest-integrity checklist; this is advisory and does not conduct training or approve release | `enablement-checklist/enablement-checklist-*.txt`        |
| Enablement and hypercare status | `pnpm release:enablement-status` after each training assessment or hypercare runbook update                                              | `enablement-status/enablement-status-*.txt`               |
| Staging or pilot smoke       | `SMOKE_BASE_URL=<base-url> pnpm release:smoke`                                                                                             | `smoke/smoke-*.txt`                                      |
| Release helper self-test     | `pnpm release:tools:test`                                                                                                                  | `self-tests/release-tools-self-test-*.txt`               |
| Release status suite         | `pnpm release:status-suite` to refresh final-readiness advisory status reports in dependency order, then milestones and blocker digest; it does not regenerate the final evidence manifest. Use `RELEASE_REVIEW_MODE=interim pnpm release:status-suite` for local interim review without final-only GO / NO-GO gates. Use `pnpm release:status-suite:strict` for a CI-style final readiness check that exits non-zero while final-review or GO / NO-GO is blocked | `status-suite/status-suite-*.txt`                        |
| Interim local review         | `pnpm release:interim-review` to bundle local advisory evidence for technical review while final external evidence remains pending          | `interim-review/interim-review-*.txt`                    |
| Release candidate summary    | `Staging Release Rehearsal` workflow or `pnpm release:summary` with approved release metadata                                              | `release-summary.txt`                                    |
| Evidence manifest            | `pnpm release:evidence:manifest` after each evidence bundle or final collected folder is complete                                          | `manifests/release-evidence-manifest-*.txt`              |
| Pending evidence checklist   | `pnpm release:pending-evidence` to consolidate remaining external evidence work by owner with ordered execution steps                       | `pending-evidence-checklist/pending-evidence-checklist-*.txt` |
| Release metadata worksheet   | `pnpm release:metadata-worksheet` to capture current metadata gaps and owner-provided values before summary preflight                      | `release-metadata/release-metadata-worksheet-*.txt`      |
| Release metadata environment template | `pnpm release:metadata-env-template` to generate a reusable non-secret shell template for one evidence session                  | `release-metadata/release-env-template-*.txt`            |
| Release metadata session lock | `pnpm release:metadata-session-lock` after owner-approved metadata is set, to preserve one reusable command set and evidence run ID for the final collection session | `release-metadata/release-session-lock-*.txt`            |
| Final-review readiness status | `pnpm release:final-review-status` after collecting or updating final review evidence, including signed evidence documents; this reports blockers but does not approve release | `final-review-status/final-review-status-*.txt`          |
| Signed evidence templates    | `pnpm release:signed-evidence-templates` to generate owner-safe signoff templates outside the final signed document folder                  | `signed-document-templates/*-template.md`                |
| Signed evidence checklist    | `pnpm release:signed-evidence-checklist` to generate the owner-facing signed document collection, override path, evidence-run, decision-field, and manifest-integrity checklist; this is advisory and does not create or approve signed documents | `signed-evidence-checklist/signed-evidence-checklist-*.txt` |
| Signed evidence status       | `pnpm release:signed-evidence-status` after copying signed/approved evidence documents                                                     | `signed-evidence-status/signed-evidence-status-*.txt`    |
| Rollback summary             | `Staging Rollback Rehearsal` workflow or `pnpm release:rollback-summary` after approved rollback metadata is available                     | `staging-rollback/rollback-summary.txt`                  |
| Post-rollback smoke          | `Staging Rollback Rehearsal` workflow or `SMOKE_OUTPUT_DIR=release-evidence/staging-rollback/smoke pnpm release:smoke`                     | `staging-rollback/smoke/smoke-*.txt`                     |
| Signed UAT pack              | Completed UAT review copy                                                                                                                  | `signed-documents/uat-evidence-pack.md` or approved file |
| Signed deployment checklist  | Completed deployment and rollback review copy                                                                                              | `signed-documents/deployment-rollback-evidence.md`       |
| Signed training assessment   | Completed training impact review copy                                                                                                      | `signed-documents/training-impact-assessment.md`         |

## Collection Sequence

1. Run `pnpm release:evidence:init` for the release candidate review folder.
2. Run `pnpm release:tools:test` or confirm the staging rehearsal artifact includes `self-tests/release-tools-self-test-*.txt`.
3. Run `pnpm release:build-check` and `pnpm release:secret-review`, or copy the equivalent CI artifacts into `build-check/` and `secret-review/`.
4. Run `pnpm release:data-snapshot-checklist` before assigning DBA/platform migration evidence work. The checklist is advisory; it does not query a database, apply migrations, approve destructive deltas, refresh the final manifest, or approve release.
5. Run `pnpm release:data-snapshot-preflight` before data snapshot work to verify database URL, PostgreSQL client availability, and snapshot override values. A WARN result is useful setup evidence but does not replace pre/post snapshot evidence; critical migration-safety review requires a PASS preflight artifact unless an approved waiver is attached.
6. Run `pnpm release:data-snapshot-status` after preflight or snapshot evidence changes to summarize missing migration-safety evidence. A BLOCKED result is expected until explicit pre/post rehearsal snapshots and a reviewed delta are present. Data snapshot preflight and snapshot artifacts include `Evidence run ID` and a redacted `Database URL fingerprint`; pre/post snapshots must be captured in the same evidence run against the same selected rehearsal database fingerprint, and the delta must reference the selected pre/post snapshot files.
7. Run `pnpm release:backup-restore-preflight` before backup/restore work to verify database URLs and PostgreSQL client tools are available. A WARN result is useful setup evidence but does not replace backup, restore, or rollback proof.
   If PostgreSQL client tools are installed outside `PATH`, set `PSQL_BIN`, `PG_DUMP_BIN`, or `PG_RESTORE_BIN` to the full executable path before running the preflight and evidence commands.
8. Run `pnpm release:recovery-checklist` and `pnpm release:backup-restore-status` after backup, restore, rollback, or post-rollback smoke evidence changes to summarize missing recovery evidence. A BLOCKED result is expected until a real backup dump, matching backup checksum, backup summary, isolated restore summary, rollback summary, and post-rollback smoke artifact are present. Backup, restore, and rollback summaries must share the same `evidence_run_id`; backup and restore summaries must reference the same backup artifact, the checksum must hash-match the dump, and database fingerprints must remain redacted.
9. Run `pnpm release:deployment-checklist` before assigning deployment and signoff evidence owners. The checklist is advisory; it does not deploy, apply migrations, create backups, restore databases, run rollback, run smoke tests, sign evidence, or approve release.
10. Run `pnpm release:metadata-worksheet` and `pnpm release:metadata-env-template` to capture the release metadata gaps and generate a reusable non-secret shell template for one approved evidence session. After owners provide approved metadata, run `pnpm release:metadata-session-lock` with the same environment values to preserve the final `RELEASE_EVIDENCE_RUN_ID` and copy-ready command sequence for all evidence owners.
11. Run `pnpm release:summary-preflight` to verify release version, run ID, commit SHA, environment, and migration-mode metadata are ready.
12. Run the staging release rehearsal workflow for the release candidate, or run `pnpm release:summary` with approved release metadata when collecting evidence manually. Set `RELEASE_EVIDENCE_RUN_ID`; final review requires one shared evidence session across release summary, pilot readiness, signed documents, manifest, final review, and GO / NO-GO artifacts.
13. Download the uploaded workflow artifact and copy the release summary, data snapshot, backup, restore, compose-render, and release metadata files into the matching evidence folders.
14. Run the staging rollback rehearsal workflow against an approved previous staging release, or run `pnpm release:rollback-summary` with approved rollback metadata when collecting rollback evidence manually.
15. Copy rollback summary and post-rollback smoke files into `staging-rollback/`.
16. Run `pnpm release:pilot-readiness-preflight`, then run pilot readiness against the pilot or staging database selected for UAT.
17. Run `pnpm release:uat-checklist` to create the owner-facing execution checklist before assigning testers. The checklist must be treated as an advisory handoff only; it does not execute UAT, create screenshots, approve waivers, or collect signoff.
18. Execute UAT scenarios and fill the UAT evidence pack with legal tester name, user ID, role, date, environment, tenant/company/branch/warehouse scope, device/browser, source record IDs, screenshots or exports with immutable artifact references, accepted result, defect or waiver status, witness/reconciliation check, and owner signoff. `Pass` / `Passed` results clear normally; `Waived` or `Deferred` require an approved disposition in the defect/waiver field. `Fail`, `Blocked`, and `Not run` do not clear UAT status. Run `pnpm release:uat-status` after each evidence update to summarize remaining incomplete scenario rows, focused evidence sheets, unresolved placeholder sections, and weak or malformed field values.
19. Run `pnpm release:pilot-uat-status` after pilot setup or UAT evidence changes. A BLOCKED result is expected until DB-backed pilot readiness passes, the UAT pack has no unresolved placeholders, and the latest passing UAT status is not older than the DB-backed pilot readiness artifact.
20. Complete deployment, rollback, backup/restore, monitoring, and hypercare evidence rows. Rows must include a real environment, date-like execution timestamp, actor, accepted result, and evidence reference; signoff rows must include an explicit release decision, not a vague review note. Run `pnpm release:deployment-status` after each checklist update to summarize remaining deployment, backup/restore, smoke, and signoff evidence gaps.
21. Run `pnpm release:external-evidence` when handing the packet to external owners. The generated guide records the evidence run ID, configured/missing environment values, ordered collection commands, required artifacts, and the boundary between local advisory evidence and proof that must come from real environments or signed human execution.
22. Run `pnpm release:rehearsal-plan` when owners need a single command-by-command execution path for migration snapshots, backup, isolated restore, rollback summary, post-rollback smoke, UAT evidence, and final gates. The command plan is advisory; it does not apply migrations, restore databases, execute UAT, or approve release.
23. Run `pnpm release:interim-review` when the team needs a local technical-review artifact before external evidence collection is complete. The report is labeled `EVIDENCE_TIER | LOCAL` and may support client walkthrough preparation, but it does not replace pilot UAT, database restore proof, rollback proof, training evidence, signed documents, final-review status, or GO / NO-GO.
24. Run `pnpm release:enablement-checklist` before assigning enablement owners. The checklist is advisory; it does not conduct training, collect attendance, sign owner approvals, close hypercare, approve waivers, or approve release.
25. Complete training attendance, known-limit acknowledgement, and follow-up owner rows. Training rows must include date-like session and signoff dates, attendees, evidence reference, and named signoff. Hypercare role rows must include explicit owners, backups, contact routes, and confirmed status; daily hypercare rows must include accepted results rather than failed or vague outcomes. Run `pnpm release:enablement-status` after each update to summarize remaining training and hypercare evidence gaps. Use the same `RELEASE_EVIDENCE_RUN_ID` for enablement status when it is part of the final evidence collection session.
26. Run `pnpm release:signed-evidence-templates` before signoff collection if owners need copy-ready signoff shells. These templates are generated under `signed-document-templates/`, not `signed-documents/`, and are not final evidence until completed and owner-approved.
27. Run `pnpm release:signed-evidence-checklist` before assigning final signoff collection. The checklist is advisory; it does not create, copy, sign, edit, approve, or replace evidence documents, and it does not approve release.
28. Copy signed evidence documents into `signed-documents/` or record their approved external paths.
29. Run `pnpm release:signed-evidence-status` after copying signed evidence documents or setting `RELEASE_*_EVIDENCE_FILE` overrides. A BLOCKED result is expected until approved documents exist, have no unresolved placeholders, include the matching `Evidence run ID`, and include non-placeholder signoff fields for `Signed by`, `Role`, `Date`, `Decision`, and `Owner`. The signoff date must include `YYYY-MM-DD` or `MM/DD/YYYY`, and the decision must be an explicit release decision such as approved, GO, conditional GO, hold, no-go, rollback, or deferred.
30. Run `pnpm release:evidence:manifest` after artifact collection changes. Workflow-generated deploy and rollback artifacts should already include their own `manifests/` folder; regenerate the final collection manifest after copying signed documents or combining artifacts.
31. Run `pnpm release:final-review-status` to summarize remaining final-review blockers, including missing signed evidence document copies, without generating signed evidence or release approval.
32. Run the GO / NO-GO evidence summary against the collected folder.

## Pilot Scope And Threshold Inputs

Before running `pnpm release:pilot-readiness`, confirm the pilot scope selected in `PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md` and decide whether the default readiness thresholds match that pilot. Threshold overrides must be recorded by the release or QA owner before the command is run.

Pilot readiness preflight and DB-backed readiness artifacts include `Evidence run ID`, a redacted `Database URL fingerprint`, and a `Threshold snapshot`. Use `RELEASE_EVIDENCE_RUN_ID` when coordinating one evidence collection session across preflight, DB-backed readiness, UAT status, and final review artifacts. The fingerprint is intentionally non-secret and is used only to confirm that evidence was produced against the same selected pilot or staging database scope. A WARN preflight result is setup evidence only; final GO / NO-GO review requires a PASS pilot readiness preflight artifact unless an approved waiver is attached.

| Input group | Default expectation | Override owner |
| ----------- | ------------------- | -------------- |
| Organization scope | At least one company, brand, branch location, warehouse location, and two inventory locations | Product Owner / Operations Owner |
| User coverage | Requester, approver, purchasing, receiver, dispatcher, inventory reviewer, project roles, restricted user, auditor, and administrator coverage | Security Owner / QA Lead |
| Approval setup | Active rules and steps for purchasing, receiving-related control, wastage, stock adjustment, count review, and project decisions | Controls Owner |
| Master data | Suppliers, items, UOMs, supplier-item links, categories, conversions, and stock records sufficient for UAT scripts | Purchasing / Inventory Owner |
| Project setup | Templates, normal and restricted projects, members, tasks, blockers, milestones, risks, and source-record links | Project Owner |

Valid override variables are the `PILOT_MIN_*` values checked by `scripts/pilot-readiness-preflight.mjs` and `scripts/pilot-readiness-check.mjs`. A lower threshold is allowed only when the pilot scope intentionally excludes a scenario and the exclusion is recorded as an approved waiver or deferral in the UAT evidence pack.

## GO / NO-GO Summary Command

To see advisory milestone progress before final review, run:

```text
pnpm release:milestones
```

This milestone report separates local release tooling and documentation readiness from external UAT, staging, rollback, backup/restore, training, and signed evidence that still must be collected.

Milestone progress is marker-based, not filename-based. Generated evidence artifacts such as smoke reports, data snapshots, backup and restore summaries, rollback summaries, pilot readiness reports, focused status reports, signed-evidence status, and release summaries must include the same PASS and metadata markers expected by final review. A placeholder, WARN-only, partial, or copied file with the right name still remains pending until the required markers are present.

## Blocker Triage Commands

When the milestone report is still pending, run the focused status commands below before assigning follow-up work. Each report includes `OWNER` or `BLOCKER` lines with severity, responsible owner group, and the specific evidence needed. These reports do not create evidence or approve release; they only make the handoff actionable.

```text
pnpm release:status-suite
pnpm release:status-suite:strict
RELEASE_REVIEW_MODE=interim pnpm release:status-suite
pnpm release:interim-review
pnpm release:blocker-digest
pnpm release:metadata-worksheet
pnpm release:metadata-env-template
pnpm release:metadata-session-lock
pnpm release:data-snapshot-checklist
pnpm release:data-snapshot-status
pnpm release:backup-restore-status
pnpm release:recovery-checklist
pnpm release:deployment-checklist
pnpm release:deployment-status
pnpm release:uat-checklist
pnpm release:enablement-checklist
pnpm release:external-evidence
pnpm release:rehearsal-plan
pnpm release:signed-evidence-templates
pnpm release:signed-evidence-checklist
pnpm release:pilot-uat-status
pnpm release:enablement-status
pnpm release:signed-evidence-status
pnpm release:final-review-status
pnpm release:pending-evidence
```

Use `pnpm release:pending-evidence` as the owner handoff checklist when coordinating the remaining gates. It includes ordered `STEPS` and an `EVIDENCE SESSION` reminder for data snapshots, backup/restore/rollback, pilot/UAT, enablement, and final GO / NO-GO collection so owners do not skip the shared `RELEASE_EVIDENCE_RUN_ID`, summary artifacts, post-rollback smoke, signed documents, or the final manifest refresh.
Use `pnpm release:interim-review` when local generated artifacts need to support an interim technical review before signed external evidence exists. A `RESULT | CONDITIONAL GO` from this command means the local interim packet was refreshed; final review and release approval still require real external evidence and signed owner documents.
Use `pnpm release:rehearsal-plan` when DBA, DevOps, QA, and release owners need one ordered rehearsal path. It includes placeholders for approved migration execution and isolated restore/rollback work, fingerprints database URLs instead of printing secrets, and repeats that the plan is not evidence by itself.
Use `pnpm release:blocker-digest` after focused reports are refreshed to group actionable owner handoff lines. The digest includes source artifact timestamps/evidence-run metadata, an `Evidence Session Metadata Warnings` section, a `Priority Next Actions` section, final-review and GO / NO-GO per-item blockers, plus their owner blocker counts in `Summary Owner Counts`, so release owners can assign the exact remaining action instead of relying on summary totals alone.

The status suite intentionally does not run `pnpm release:evidence:manifest`. Run the suite while triaging blockers, finish or copy the real source evidence and signed documents, then run `pnpm release:evidence:manifest` as the final collection step before rerunning `pnpm release:final-review-status` and `pnpm release:go-no-go`.
When `RELEASE_REVIEW_MODE=interim` is set, the status suite skips signed-evidence status, final-review, and GO / NO-GO checks and runs `pnpm release:interim-review` instead. This is useful for local technical review and client walkthrough preparation, but it is not release approval.
Within the suite, final-review and GO / NO-GO run before the pending-evidence checklist and milestone report, and blocker digest runs last. This keeps the latest checklist, milestone, and digest artifacts pointed at the latest readiness summaries.
Generated advisory summary folders are ignored for manifest freshness so final-review, GO / NO-GO, milestones, blocker digest, external evidence guide, rehearsal command plan, and status-suite reports can be rerun after the manifest. Focused readiness status folders used as final evidence, including data snapshot, backup/restore, deployment, UAT, Pilot/UAT, enablement, and signed-evidence status, are not ignored; changing those after manifest generation requires a fresh `pnpm release:evidence:manifest`.
The generated manifest includes a `Freshness Notes` section listing the generated report directories ignored by the freshness check.

Use the latest generated artifact from each status folder during release triage:

| Status report | Primary owner to review latest blocker lines |
| ------------- | -------------------------------------------- |
| `data-snapshot-status/` | DBA / Platform Engineering |
| `data-snapshot-checklist/` | DBA / Platform Engineering / Release Manager |
| `backup-restore-status/` | DevOps Owner / Release Manager |
| `recovery-checklist/` | DevOps Owner / DBA / QA Lead |
| `blocker-digest/` | Release Manager and all evidence owners |
| `deployment-checklist/` | Release Manager / DevOps Owner |
| `deployment-status/` | Release Manager / DevOps Owner / QA Lead |
| `external-evidence-guide/` | Release Manager |
| `rehearsal-command-plan/` | Release Manager / DBA / DevOps Owner / QA Lead |
| `uat-checklist/` | QA Lead / Operations Lead |
| `pilot-uat-status/` | QA Lead / Operations Lead |
| `enablement-checklist/` | Enablement Owner / Operations Owner |
| `enablement-status/` | Enablement Owner / Operations Owner |
| `signed-evidence-status/` | QA Lead, DevOps Owner, Enablement Owner, Product Owner |
| `final-review-status/` | Release Manager / Product Owner |
| `signed-evidence-checklist/` | Release Manager / Product Owner |
| `pending-evidence-checklist/` | Release Manager and all evidence owners |
| `status-suite/` | Release Manager |
| `interim-review/` | Release Manager / QA Lead |
| `release-metadata/` | Release Manager; blocker digest reads the latest `release-session-lock-*.txt` when metadata still needs approval |
| `go-no-go/` | Release Manager / Product Owner |

To see final-review blockers before running the authoritative GO / NO-GO report, run:

```text
pnpm release:final-review-status
```

This status report is advisory. It must remain blocked until real release metadata, staging evidence, rollback proof, signed evidence documents, and a fresh manifest are present.

To check only the signed evidence documents before regenerating the final manifest, run:

```text
pnpm release:signed-evidence-templates
pnpm release:signed-evidence-checklist
pnpm release:signed-evidence-status
```

The template command creates copy-ready shells in `signed-document-templates/`; do not move them into `signed-documents/` until each owner has completed the source evidence references and approved the decision. The signed-evidence status report does not sign or approve documents. It verifies that the configured UAT, deployment/rollback, and training evidence files exist, no longer contain unresolved placeholders, and include a minimal signoff block. The signoff block may use `Field: value` lines or simple two-column Markdown table rows, but each signed document must provide non-placeholder values for `Evidence run ID`, `Signed by`, `Role`, `Date`, `Decision`, and `Owner`. `Date` must be date-like and `Decision` must be an explicit release decision, not a vague review note. When `RELEASE_EVIDENCE_RUN_ID` is set, the signed document `Evidence run ID` must match it.

To verify the local release evidence helper scripts before collecting real artifacts, run:

```text
pnpm release:tools:test
```

The self-test uses a temporary evidence folder and local HTTP smoke-test server. It does not replace staging smoke, pilot readiness, backup/restore, rollback, UAT, training, or owner signoff evidence.

The GO / NO-GO summary requires `build-check/build-check-*.txt`, `secret-review/secret-review-*.txt`, `release-summary-preflight-*.txt`, `release-summary.txt`, and `self-tests/release-tools-self-test-*.txt` in the collected evidence folder. A local self-test artifact proves only the helper scripts; it does not prove the deployed environment. `release-summary.txt` and the final evidence manifest include `evidence_run_id` so reviewers can see which evidence collection session produced the final package.
The release summary preflight must be `PASS` for final review; a `WARN` result is setup evidence only and means release-candidate metadata is still incomplete.

The GO / NO-GO summary directly checks the signed UAT, deployment/rollback, and training evidence documents, then also requires `manifests/release-evidence-manifest-*.txt`. The manifest records SHA-256 checksums for collected evidence files so reviewers can detect missing or changed artifacts during handoff.
Generate the manifest after collecting build, security, snapshot preflight, migration, backup, restore, pilot-readiness, smoke, rollback, signed-document evidence, and the latest passing focused status reports. Final review and GO / NO-GO require passing `data-snapshot-status`, `backup-restore-status`, `uat-status`, `pilot-uat-status`, `enablement-status`, and `signed-evidence-status` artifacts. They also verify that release summary, migration snapshots, backup/restore, rollback, pilot readiness, UAT status, and enablement status share one non-placeholder `RELEASE_EVIDENCE_RUN_ID`; a missing, placeholder, stale, or mixed-session evidence package will keep the final report at NO-GO. When `RELEASE_EVIDENCE_RUN_ID` is set for the final command, every required artifact must match that exact approved value.
If the GO / NO-GO summary reports that the manifest is missing `release-summary.txt`, generate the release summary first, then rerun `pnpm release:evidence:manifest` so the manifest includes the release-candidate metadata file.

When signed documents are stored in the evidence folder:

```text
RELEASE_EVIDENCE_ROOT=release-evidence \
RELEASE_UAT_EVIDENCE_FILE=release-evidence/signed-documents/uat-evidence-pack.md \
RELEASE_DEPLOYMENT_EVIDENCE_FILE=release-evidence/signed-documents/deployment-rollback-evidence.md \
RELEASE_TRAINING_EVIDENCE_FILE=release-evidence/signed-documents/training-impact-assessment.md \
pnpm release:go-no-go
```

When signed documents stay in their repository template locations, run:

```text
pnpm release:go-no-go
```

The command checks for unresolved placeholders and required success markers inside generated artifacts. A passing report means the evidence pack is review-ready, not automatically approved.

## Review Rules

- Do not mark GO while any required UAT, deployment, rollback, backup/restore, training, security, or inventory/source-record evidence is missing.
- Do not waive tenant, company, brand, location, warehouse, project, approval, audit, source-record boundary, or inventory-ledger controls.
- Do not treat dashboard, report, tracker, or notification evidence as a replacement for source-record proof.
- Do not use local workstation smoke evidence as production or pilot proof.
- Do not store secrets, private keys, database URLs, or raw credential output in evidence artifacts.
- Record every blocker, critical defect, waiver, deferred item, and known limit in the UAT pack or hypercare runbook before signoff.

## Handoff Checklist

| Checkpoint                                  | Required result before final review                                           | Owner                           |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| Release candidate identified                | Version, run ID, commit SHA, migration state, and environment recorded        | Release Manager                 |
| Generated artifacts collected               | Snapshot, backup, restore, smoke, pilot readiness, and rollback files copied  | Release Manager / DevOps Owner  |
| UAT evidence completed                      | All scenarios pass or have approved waiver/deferral                           | QA Lead                         |
| Security and scope evidence completed       | Direct URL, export, cross-scope, and restricted-project denial proof attached | Security Owner                  |
| Inventory and source-record proof completed | Ledger, reversal, duplicate prevention, and tracker boundary proof attached   | Inventory Owner / Project Owner |
| Training evidence completed                 | Attendance, material coverage, known limits, and follow-up owners recorded    | Enablement Owner                |
| GO / NO-GO summary generated                | Report shows GO review ready or all failures are dispositioned                | Release Manager / Product Owner |
