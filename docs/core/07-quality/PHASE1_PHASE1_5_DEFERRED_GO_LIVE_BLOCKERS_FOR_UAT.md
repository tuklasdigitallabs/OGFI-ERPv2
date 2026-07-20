# Phase I And Phase 1.5 Deferred Go-Live Blockers For UAT

**Status:** Deferred for actual user UAT and release rehearsal  
**Created:** 2026-07-07  
**Scope:** Phase I Core Operational Control and Phase 1.5 Projects & Implementation Tracker  
**Decision:** These items are parked for now so implementation and demo/UAT preparation can continue. They are not resolved, waived, or approved for production go-live.

## Purpose

This document records release and go-live blockers that do not prevent the ERP from running locally, being demonstrated, or continuing implementation, but must be reviewed during actual UAT with users before any production GO decision.

The blockers below are evidence, signoff, deployment-safety, and release-control gates. They prove that the ERP is safe, accepted, recoverable, and approved for production. They are not ordinary feature-availability blockers.

## Current Boundary

The ERP may continue through:

- local development
- demo review
- internal workflow testing
- sample data validation
- UAT preparation
- feature implementation

The ERP must not be represented as production release-ready until these deferred blockers are either completed with evidence or formally waived by authorized owners with documented mitigation.

## Deferred Blocker Register

| ID | Blocker area | What is missing | Required owner(s) | Required UAT/release evidence | Current disposition |
|---|---|---|---|---|---|
| DGB-001 | Release metadata | Approved `RELEASE_VERSION`, `GITHUB_RUN_ID`, `GITHUB_SHA`, and shared `RELEASE_EVIDENCE_RUN_ID` | Release Manager / Product Owner | Passing release summary preflight and generated `release-summary.txt` | Deferred to release rehearsal |
| DGB-002 | Migration/data safety | Data snapshot preflight PASS, pre-migration snapshot, post-migration snapshot, reviewed snapshot delta | DBA / Platform Engineering | Passing data snapshot status and reviewed delta evidence | Deferred to staging or pilot DB rehearsal |
| DGB-003 | Backup evidence | Real backup dump, checksum sidecar, and backup summary | DevOps Owner / DBA | Backup artifact, `.sha256`, `backup-summary.txt`, matching evidence run ID | Deferred to release rehearsal |
| DGB-004 | Restore evidence | Isolated restore verification and restore-check summary | DevOps Owner / DBA | `restore-check-summary.txt` from an approved isolated restore target | Deferred to release rehearsal |
| DGB-005 | Rollback evidence | Rollback rehearsal summary and post-rollback smoke | Release Manager / DevOps Owner / QA Lead | `rollback-summary.txt` and post-rollback smoke report | Deferred to release rehearsal |
| DGB-006 | Pilot readiness | Strict pilot readiness preflight and DB-backed pilot readiness report | QA Lead / Operations Lead | `pilot-readiness` artifact with strict release gates enabled | Deferred to actual pilot database |
| DGB-007 | UAT execution | Completed UAT evidence pack, scenario results, tester/date/device/environment, evidence references, defect dispositions, and signoff | QA Lead / Operations Owners / Product Owner | Completed UAT evidence pack and passing UAT status | Deferred to user UAT |
| DGB-008 | Signed evidence | Signed UAT evidence, deployment/rollback evidence, and training impact assessment | Product Owner / QA Lead / Release Manager / Enablement Owner | Signed files under `release-evidence/signed-documents/` or approved configured file paths | Deferred to final UAT signoff |
| DGB-009 | External security proof | MFA provider proof, IdP session invalidation proof, evidence storage/vault index, break-glass review/revocation proof | Security Owner / IT Owner | Proof files under `release-evidence/external-security/` with matching evidence run ID and PASS marker | Deferred to security review |
| DGB-010 | Training and hypercare | Training attendance, known-limit acknowledgement, support owners, hypercare cadence, daily review evidence | Enablement Owner / Operations Owner | Completed training impact assessment, hypercare/runbook evidence, passing enablement status | Deferred to user rollout preparation |
| DGB-011 | Final manifest and consistency | Final evidence manifest missing required final evidence and shared evidence-run consistency | Release Manager / Product Owner | Fresh manifest after all final evidence exists, passing final review and GO / NO-GO | Deferred until all other deferred blockers are closed |
| DGB-012 | Controlled evidence uploads and storage segregation | Complete the shared hybrid evidence model: retain structured notes/external references, add private uploads where policy requires evidence, use environment-separated S3-compatible storage with opaque tenant/company object keys, enforce source-record and restricted-project authorization, quarantine and malware scanning, checksum verification, audited downloads, archival/retention, and backup/restore proof. Text alone must not satisfy high-risk evidence requirements unless policy explicitly permits a verified external reference. | Product Owner / IT-Security Owner / DevOps Owner / Data-Privacy Owner | Approved storage provider and bucket/prefix design, cross-tenant/company/location/project denial tests, upload/scan/download/archive audit evidence, retention policy, backup/restore proof, and workspace attachment requirement matrix | Shared production-foundation blocker before workspace production certification |

## Review Trigger

Reopen this register when one of the following starts:

- formal user UAT
- staging release rehearsal
- pilot database readiness review
- owner signoff review
- production GO / NO-GO preparation

## Required Review Actions

During actual UAT and release rehearsal:

1. Assign each deferred blocker to a named owner.
2. Confirm the target environment and evidence run ID.
3. Collect real evidence artifacts.
4. Replace all `Pending`, `TBD`, and unchecked placeholders in the evidence documents.
5. Run the focused status scripts for the relevant area.
6. Regenerate the final evidence manifest after all source evidence is collected.
7. Run final review and GO / NO-GO.
8. Record the final release board decision in ERP Admin > Release Readiness.
9. Close `DGB-012` before certifying any workspace whose controlled action requires uploaded evidence.

## Non-Waiver Statement

This document is a parking register only. It does not waive controls, approve production deployment, prove UAT completion, satisfy security review, or replace owner signoff.

Any waiver during UAT must include:

- owner name and role
- business reason
- risk impact
- mitigation
- expiration or follow-up date
- explicit approval decision
- evidence reference
