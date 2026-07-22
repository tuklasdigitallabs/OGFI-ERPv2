# OGFI ERP — Current Pending Implementation Plan

**As of:** July 22, 2026
**Status:** Active implementation register  
**Scope:** Production-readiness implementation remaining outside formal user UAT execution and final owner signoff

## 1. Purpose

This document is the working register for implementation that remains before OGFI ERP workspaces may be certified as production-ready. It separates shared platform work from workspace-specific completion and distinguishes required production controls from intentionally deferred future scope.

The delivery approach is:

1. Stabilize and verify the shared production foundation.
2. Complete one workspace at a time in dependency order.
3. Apply the full workspace completion gate before moving to the next workspace.
4. Stabilize Phase I and Phase 1.5 before certifying later phases for production.

Formal UAT execution, evidence collection with real users, owner signoff, and the final GO / NO-GO decision remain separate release activities.

## 2. Shared Production Foundation

These items must be completed once at platform level. A workspace must not be certified when it depends on an incomplete shared control.

| ID | Pending implementation | Required outcome | Status |
|---|---|---|---|
| SPF-001 | CI and verification baseline | Secret review, release-tool self-tests, lint, typecheck, production build, unit/integration tests, access-control tests, and production-mode authenticated desktop/mobile E2E pass against the same release candidate | In progress; branch protection and production-authenticated `next start` E2E remain pending |
| SPF-002 | Migration and data-safety verification | Review all pending migrations, deploy them to a disposable environment, compare pre/post snapshots, and verify rollback considerations | Complete; corrective migration `20260721200000_project_requirement_attachment_context` independently reviewed and exact-SHA PostgreSQL 17 predecessor rehearsal, fail-closed negative checks, idempotent redeploy, and schema-drift check pass |
| SPF-003 | Authentication and privileged access | Confirm production identity provider or login path, privileged MFA enforcement, session invalidation, and break-glass runtime behavior | Implementation complete; production enablement remains blocked on hosted restore/locking evidence and accountable-owner policy signoff |
| SPF-004 | Authorization regression gate | Verify tenant, company, brand, location, department, project membership, restricted-project, and direct-route/API enforcement | Complete; exact-SHA hosted production build, database authorization, manifest, and isolated development-fixture desktop/mobile E2E accepted under `DEC-0044` |
| SPF-005 | Controlled evidence uploads | Complete the hybrid evidence model described in Section 3 | In progress: the same-VPS broker, private scanning, upload/download, quarantine, quota/lease, retention-register, recovery-tooling, deployment-overlay, and authorization-test foundations are implemented; migration review, hosted verification, policy values, backup/key custody, paired restore, and production activation remain open |
| SPF-006 | Audit and activity integrity | Verify important create, update, transition, approve, post, reverse, cancel, archive, upload, download, export, and denied actions produce the required immutable history; bound or aggregate repeated denied-event writes so enumeration attempts cannot amplify audit storage without limit | In progress; local DEC-0049 append-only/role separation and DEC-0050 bounded denial, atomic authentication admission, bounded role-scoped approval routing, 18-type backfill descriptors, normalized inbox SQL, and monitoring checkpoints are independently accepted with normalized routing disabled. Hosted exact-release/restore/load/alert proof, 18-type detail/action and feature-gated page activation evidence, remaining request/reversal and audit-semantic gaps, broader behavioral races, and the cross-workspace audit matrix remain pending |
| SPF-007 | Shared UX states | Standardize loading, empty, error, denied, disabled-with-reason, validation, conflict, retry, and mobile states | Pending workspace verification |
| SPF-008 | Operational list behavior | Verify server-backed search, filters, pagination, export, responsive tables/cards, and selected-record task flows | Pending workspace verification |
| SPF-009 | Deployment and recovery | Complete staging deployment, production-mode authenticated desktop/mobile E2E, backup, isolated restore, rollback rehearsal, smoke checks, monitoring, and hypercare procedures | Pending environment execution and production-authenticated `next start` E2E |
| SPF-010 | Security and dependency review | Run the approved security/dependency checks and resolve release-blocking findings without exposing secrets or internal errors | Pending final release-candidate review |

### SPF-001 implementation evidence — July 21, 2026

- Confirmed `DEC-0038`: augment the baseline and keep SPF-001 open until hosted exact-SHA and branch-protection evidence are accepted.
- Confirmed `DEC-0044`: development-mode fixture browser E2E may support SPF-004 closure, but SPF-001 remains open until authenticated production-mode `next start` desktop/mobile E2E passes with ephemeral password/MFA fixtures and a loopback HTTPS proxy.
- CI provisions PostgreSQL 17, migrates and deterministically seeds the isolated database, typechecks E2E, builds the production artifact, runs database-backed authorization tests without skip fallback, and retains Playwright/release evidence on failure or success. Its current browser runner is explicitly development-mode fixture evidence, not production-authenticated runtime evidence.
- Local candidate verification passed: secret review, release-tool self-test, lint, application typecheck, E2E typecheck, production build, 628 web tests across 64 files plus database/worker tests, two executed access-control integration tests, and all 14 desktop/mobile E2E tests.
- Hosted run [`29774246308`](https://github.com/tuklasdigitallabs/OGFI-ERPv2/actions/runs/29774246308) passed for exact implementation SHA `c5e3969b176e271470ca66d3bef607803cb76c3e`, including the `checks` job and CI verification artifact upload.
- Remaining closure blockers: configure protection that requires the `CI / checks` gate, provision secret-safe ephemeral local-auth password/MFA fixtures, and pass hosted desktop/mobile E2E through loopback HTTPS against production-mode `next start`. Demo authentication and weakened origin/cookie/session checks are prohibited.
- Knowledge-base and glossary assessment: no update required for this slice because it changes internal engineering verification only and introduces no end-user term or workflow behavior.

### SPF-002 implementation evidence — July 21, 2026

- Confirmed `DEC-0039`: SPF-002 requires an exact-SHA populated predecessor upgrade rehearsal on disposable PostgreSQL 17 databases, with complete migration review, data preservation, recovery, idempotency, and schema-drift evidence.
- Reconciled the Prisma schema and migration history through reviewed migration `20260721120000_reconcile_schema_drift`; the hosted datasource-to-schema comparison reports zero drift.
- Inventoried all 108 migrations. Fifty-five migrations requiring explicit review are bound to exact SHA-256 hashes and marked `APPROVED_FOR_REHEARSAL`; none remain pending. The migration safety register records transaction behavior, failure point, reversibility, recovery trigger, owner, verification, and expected recovery time.
- Hosted run [`29784132306`](https://github.com/tuklasdigitallabs/OGFI-ERPv2/actions/runs/29784132306) passed for exact candidate SHA `623927ac36949362822edf9e0737454087543c59`, using successful predecessor CI run `29774246308` at SHA `c5e3969b176e271470ca66d3bef607803cb76c3e` and `deploy_to_staging=false`.
- Evidence run `gh-29784132306-1` proves: a populated predecessor baseline; pre-migration checksummed backup; atomic rollback on an intentional cross-company scope violation; successful first deploy; no-pending idempotent second deploy with identical migration journals and zero data delta; zero schema drift; 14 business/scope invariants before, after, and after restore; and exact row-count/content-digest equivalence across all 158 Prisma application tables after isolated restore.
- Artifact `ogfi-release-evidence-spf002-rehearsal-623927a` (`8477937081`) contains 31 checksum-indexed evidence files. The backup checksum and final manifest checksum were independently reverified after download.
- The same hosted candidate also passed secret review, release-tool self-tests, lint, application and E2E typechecks, production build, database/worker/UI tests, 626 web tests, access-control integration tests, and desktop/mobile Playwright E2E.
- Boundary retained: SPF-002 closure does not close SPF-009; staging deployment, application rollback, smoke checks, monitoring, and hypercare remain pending.
- Knowledge-base and glossary assessment: no update required because this phase changes internal engineering, migration, and recovery controls only; it introduces no end-user workflow, navigation, permission, or product term.

### SPF-003 implementation evidence — July 21, 2026

- Confirmed `DEC-0040`: production authentication uses tenant-qualified local username/password credentials, runtime TOTP, opaque revocable PostgreSQL sessions, controlled activation/recovery, and a one-time first-administrator bootstrap. Demo authentication fails closed in production.
- Added Argon2id password verification, account/source throttling, MFA challenge and recovery-code controls, idle and absolute session expiry, assurance rotation, administrator/user revocation, privilege-epoch invalidation, same-origin mutation protection, secure SMTP delivery, encryption-key rotation, and hash-only activation/recovery token storage.
- Authentication administration is tenant/company scoped. Active role and scope assignments are time bounded, scope types are explicit, and sensitive target mutations transactionally revalidate current company scope before changing credentials, MFA, recovery, or sessions.
- All authentication numeric controls fail startup or utility execution when malformed or outside conservative bounds. Production configuration requires secure cookie, key, SMTP TLS, and HTTPS settings.
- Migration `20260721150000_production_application_authentication` is bound to SHA-256 `b0eb3415d510b832997e9c504d02562f6edc5c78f2b3d84af7a6c0093f86be14` and independently approved for rehearsal. The populated predecessor rehearsal preserved 10 tenants, 100 companies, and 5,000 users with zero drift; 10 database-backed authentication integrity/race tests pass.
- Added the sign-in, activation, MFA challenge, account-security/session-management, activation-delivery, and controlled recovery surfaces. Shared modal triggers now remain disabled until hydration, preventing lost first-click actions on desktop and mobile.
- Local candidate verification passed: secret review, release-tool self-test, migration inventory with zero pending dispositions, lint, typecheck, production build, 643 web tests, database/worker tests, 10 authentication database tests, two access-control database tests, and all 14 desktop/mobile Playwright tests on a fresh migrated and seeded PostgreSQL database.
- Independent Database review approved the exact migration for rehearsal. Independent Security re-review found no remaining code-level production blocker.
- Remaining production-GO gates are external and are not represented as complete: hosted production-like migration locking and backup/restore/RTO/RPO evidence, accountable-owner confirmation of the open authentication policies in `DEC-0040`, role-based UAT, and final Security/QA/DevOps/Release approval.
- Knowledge-base and glossary updated for tenant login code, activation, MFA, recovery codes, challenge locks, sessions, session invalidation, first-administrator bootstrap, and administrator support workflows.

### SPF-004 implementation evidence — July 21, 2026

- Confirmed `DEC-0041`, `DEC-0042`, `DEC-0043`, and `DEC-0044`: executable database-backed boundary coverage is required for high-risk authorization surfaces; workforce access is location-primary; tenant-global role administration requires explicit `core.tenant_role_administer` plus selected-company target eligibility; and SPF-004 may close from exact-SHA production-build, database/manifest, and isolated development-fixture desktop/mobile E2E evidence.
- The regenerated authorization baseline contains 964 protected pages, server actions, service entrypoints, route handlers, and evidence downloads. It classifies 745 high-risk surfaces, including 442 high-risk service entrypoints registered as `COVERED`; every high-risk service, action, route, and evidence download binds to a verified executable boundary case, with zero missing, stale, duplicate, invalid, uncovered, or unbound registry entries.
- Manifest discovery fails closed for unknown server-action files and app routes, direct or dynamic database/service import escape paths, unresolved imported or re-exported service delegation, callback/alias escape paths, transitive synchronous database writers, baseline drift, skipped or missing registered tests, and empty no-mutation controls.
- Live PostgreSQL regression coverage verifies tenant/company/brand/location/department/project boundaries, restricted-project membership, live permission and scope revocation, authoritative workforce record locations, finance/evidence brand and department scope, self-approval segregation, invalid state transitions, route denial without export bytes, confidential workforce redaction, cross-tenant permission-detail filtering, non-enumerating evidence denials, private evidence authorization, and denied-action no-mutation behavior.
- Role administration now uses `core.tenant_role_administer`, grants it only to configured administrator/super-user roles by default, requires active/effective selected-company membership for target users, preserves MFA and no-self-action controls, invalidates active assignees after permission changes, serializes concurrent direct grants and sensitive permission promotion, freezes role permission changes while a sensitive-role request is pending, reloads role permissions under lock during approval, and compare-and-swaps sensitive-role review. Sensitive roles require controlled approval for grants but remain revocable by an authorized independent administrator. Company-bound role-assignment schema work remains explicitly deferred.
- Migration `20260721160000_tenant_role_administration_permission` is atomic, conflict-preflighted, checksum-bound in the migration safety register, and locally rehearsed on PostgreSQL 17. Positive deployment, target-only grants, idempotent redeploy, and atomic reserved-UUID/mismatched-metadata failure fixtures passed. Hosted migration/restore evidence remains pending.
- The final local authorization candidate attestation passed 666 unit tests (10 database-authentication cases intentionally skipped there and executed under their dedicated gate), 6 access-control cases, 8 adapter cases, 33 admin/platform cases, 11 finance cases, 18 procurement/inventory cases, 15 projects/operations cases, 10 workforce cases, 2 protected-route cases, and 11 controlled-evidence cases. All 14 serial desktop/mobile E2E cases passed on the post-remediation candidate in 8 minutes 18 seconds. The regenerated manifest records 964 authorization surfaces, including 745 high-risk surfaces and complete 442/442 high-risk service coverage, on disposable PostgreSQL database `ogfi_authz_spf004_final_20260721_09`, run ID `local-spf004-authz-final-20260721-09`, and source HEAD `9853a1b6dfc80945d689cb0b70842ee0065c1d2b`. The same blank candidate applied all 110 migrations, seeded successfully, and reported no pending migrations on redeploy. Independent review additionally identified and drove remediation of tenant-global session-invalidation visibility, expired/future company-admin assignment acceptance, and concurrent provider double completion; database coverage proves company-only isolation, live tenant-role authority, non-enumerating denial, and exactly-once completion/audit behavior. Post-remediation secret review, release-tool self-test, migration review, lint, application and E2E typechecks, production build, authorization manifest checks, and independent Security/Evidence re-reviews all passed; the hosted clean exact-SHA closure is recorded below.
- Hosted runs `29824012949` and `29825094297` for implementation SHAs `020c334fa692d2e8a2957df5e7705918fb90a02e` and `d2a9981a1cb59a56d1ab6e31abdd3238e98e0f21` passed migration, seed, secret, release-tool, lint, typecheck, build, package-test, and authorization steps, then failed after 60 and 120 seconds respectively while attempting to start production-mode E2E; manifest generation was consequently skipped. Exact CI-mode reproduction proved that `next start` correctly fails closed without the required production authentication configuration and that the existing browser fixtures intentionally use development-only demo authentication. Under `DEC-0044`, the isolated fixture runner now uses `next dev`; its complete desktop/mobile suite passed 14/14 locally with `CI=true` in 7.3 minutes.
- Hosted run `29827747809` for SHA `9097981f4d601bc231a3a6d59be4716c04329fdc` passed the production build, complete database-backed authorization suite, and all 14 desktop/mobile E2E cases in 6.6 minutes. Its final manifest step correctly rejected a dirty CI worktree because Next.js rewrote the tracked generated `apps/web/next-env.d.ts` route-type reference from the production build directory to the isolated E2E directory. CI now restores only that known framework-generated file after E2E; the manifest's clean-worktree assertion remains responsible for rejecting every other tracked or untracked mutation.
- Hosted run [`29829530328`](https://github.com/tuklasdigitallabs/OGFI-ERPv2/actions/runs/29829530328) passed the complete SPF-004 gate for exact SHA `60690ddd41c12fa31dbdeb3fdec6ebfc8a90f170`: migration/seed, secret and release-tool checks, lint, application and E2E typechecks, production build, package tests, database-backed authorization, 14/14 desktop/mobile development-fixture E2E cases, clean-worktree authorization manifest, and artifact upload. Artifact `ci-verification-29829530328-60690ddd41c12fa31dbdeb3fdec6ebfc8a90f170` (`8495001647`) is retained for 90 days with digest `sha256:493b4a7fa295682ee1357acb897985272fd000251192f9b8ddf6196026aefb64`.
- Production-mode authenticated `next start` E2E is not waived: `DEC-0044` assigns that unresolved gate to SPF-001 and SPF-009. It requires ephemeral tenant-qualified password/MFA fixtures and loopback HTTPS and may not be satisfied by production demo auth or weakened trusted-origin, secure-cookie, session, or authorization checks.
- Knowledge-base, glossary, Core Administration helper text, roles/permissions, security/audit model, data dictionary, decision index, and changelog were aligned with the implemented behavior.
- SPF-004 is complete. Its closure does not close SPF-001 or SPF-009 and does not authorize production release; production-authenticated `next start` E2E, branch protection, deployment, recovery, and final release evidence remain under their assigned gates.

## 3. Controlled Evidence Upload and Storage

Evidence capture will use a hybrid model:

- structured evidence notes;
- verified external references where policy permits them; and
- private file uploads where the workflow or risk policy requires an artifact.

Text alone must not satisfy high-risk evidence requirements unless an approved policy explicitly permits a verified external reference.

### Implemented foundation and pending activation

- The `DEC-0046` dedicated internal minimal storage broker is implemented for the same Hostinger VPS topology. Only the broker is configured to own the validated absolute private evidence bind mount and versioned AES-256-GCM key; hosted proof of that isolation remains required.
- Use separate mounts, encryption keys/versions, broker identities, scanner boundaries, credentials, and environment configuration for development, staging, and production.
- Use server-generated opaque non-repeating keys; keep tenant/company/source scope in PostgreSQL and do not encode original filenames or sensitive business data in storage keys.
- Store file metadata and source-record links in PostgreSQL; do not store file bytes in PostgreSQL.
- Enforce source-record authorization on upload, list, preview, download, archive, and replacement.
- Enforce location/department scope, confidential workforce access, and restricted-project membership where applicable.
- Validate configured size limits, allowed extensions, detected content type, and checksum.
- Upload into quarantine and prevent evidence use until malware scanning succeeds.
- Bounded upload and download streams are proxied through the authorized application and internal broker; filesystem paths, broker/scanner access, and permanent public URLs are not exposed.
- Audit upload, scan result, download, archive, replacement, denial, and retention actions.
- Preserve important evidence through archival/versioning rather than normal-user hard deletion.
- Application retention/legal-hold services and an administrative retention register, company quota reservations, upload leases/rate limits, disk high-water controls, and an evidence-root single-broker process lock are implemented. Recovery creation, isolated staging, and verification tools exist, but an independently recoverable encrypted backup, key escrow/custody, and hosted paired database/evidence restore proof remain activation blockers. Do not represent same-VPS filesystem storage as WORM or Object Lock.
- Provide one reusable attachment uploader/viewer for workspace adoption.
- Define the attachment requirement matrix by workflow, action, risk, value, and evidence purpose.
- Add cross-tenant, cross-company, cross-location, unauthorized-source, and restricted-project denial tests.

Direct web-mounted `local-private` storage remains suitable for local development and controlled demonstration only. The production design is the isolated broker contract in `DEC-0046`; confirmation of that architecture does not satisfy its implementation or activation gates.

### SPF-005 decision status — July 21, 2026

- `DEC-0046` supersedes `DEC-0045` and confirms a dedicated internal minimal broker on the same Hostinger VPS. Only the broker owns the absolute private evidence mount and versioned AES-256-GCM key; web, Caddy, and ClamAV have no evidence mount. The application proxies bounded streams, and the server issues opaque immutable keys/versions.
- PostgreSQL is authoritative for source-record authorization, idempotency, quota, quarantine, exact-version compare-and-set availability, retention/legal hold, and audit. ClamAV scans private streams through `INSTREAM`; only a conclusive `CLEAN` result for the exact version and accepted signature freshness becomes available. A bounded systemd timer handles reconciliation without detached post-response work, Redis, or a queue.
- Same-VPS filesystem storage is not WORM/Object Lock and retains root-compromise and same-disk-loss risks. SPF-005 is not production-ready. Activation remains blocked on actual VPS size/utilization and headroom, evidence quota/high-water values, encryption-key custody/recovery, Hostinger daily-backup entitlement/location/encryption/retention/restore granularity, approved RPO/RTO, retention/legal-hold policy, pinned ClamAV image/resources/signature freshness, implementation verification, and hosted paired database/evidence restore proof.
- External object storage is deferred until capacity, multi-host deployment, stronger RPO/RTO, legal WORM, or tenant scale triggers a new material decision and controlled copy-verify-cutover migration.

### SPF-005 implementation evidence — July 21, 2026

- Implemented the isolated encrypted broker and provider-neutral storage boundary, private ClamAV `INSTREAM` adapter, streamed application upload/download routes, opaque immutable key/version handling, quarantine-by-default lifecycle, and exact-version clean-release checks.
- Implemented PostgreSQL-backed idempotency, company quota reservation/consumption, upload leases, request-rate limits, bounded scan reconciliation, compare-and-set availability, legal-hold backend controls, preservation-aware workspace states, server-paginated evidence history, and the restricted administrative retention register. Authorization coverage includes upload/download, source-scope denial, legal-hold, retention-register, and non-enumerating evidence cases. Filename/MIME matching is enforced both when the upload intent is issued and before an exact version becomes available; active-script and spreadsheet extensions cannot pass as plain text.
- Added the Hostinger deployment overlay, systemd reconciliation and recovery-stage/verification units, configuration/readiness contracts, and recovery create/verify tooling. These are implementation artifacts, not proof that the real Hostinger environment, independent backup destination, encryption-key custody, or paired restore meets approved objectives.
- `DEC-0048` corrects a discovered project-requirement evidence mismatch: a project attachment may be task-only, comment-only, requirement-only, or task plus its matching task-bound requirement. The corrective migration validates predecessor rows, replaces the obsolete task/comment-only check, prevents duplicate active requirement links, and enforces task/requirement agreement in both write directions. This keeps project-level requirements usable without artificial tasks and preserves the atomic controlled-evidence/project-activity design.
- Migrations `20260721170000_controlled_evidence_storage_contract`, `20260721180000_evidence_legal_hold_controls`, `20260721190000_controlled_evidence_policy_alignment`, and `20260721200000_project_requirement_attachment_context` are checksum-bound and independently database-reviewed as `APPROVED_FOR_REHEARSAL`, not production `APPROVED`. They require the recorded writer quiescence, exact-SHA populated-predecessor migration/redeploy checks, schema-drift and report/export comparison, and isolated restore equivalence before release use.
- Current local candidate verification passes: web lint and typecheck, production build, 761 web unit/contract tests, 20 authorization-manifest tests, 15 database package tests, all 19 controlled-evidence database authorization scenarios, eight Hostinger-isolation contract tests, seven evidence-recovery contract tests, release-tool self-tests, secret review, migration inventory covering 114 migrations with zero pending dispositions, and `git diff --check`. The database authorization suite now proves confidential workforce evidence is unavailable through generic `workforce.view`, denied downloads create one denial audit event, and a taskless project requirement creates the correctly scoped project link. Hosted authorization/E2E and paired restore gates remain separate evidence and are not implied by these local results.
- Exact candidate `3bf902bdf03c77dfdfd6c70d982c30e55726b5e3` passed the PostgreSQL 17 corrective-migration rehearsal after the populated predecessor run: the existing matched task/requirement link was preserved; task mismatch, parentless context, and later requirement-task drift were rejected; a second deploy reported no pending migration; Prisma reported no schema difference; and the checksum-bound migration-review artifact passed in release mode. Hosted authorization/E2E and paired restore gates remain separate evidence and are not implied by this local rehearsal.
- SPF-005 remains open and must not be described as production-ready or complete. External activation is blocked on real Hostinger capacity/configuration values, independently recoverable encrypted off-VPS backup and key escrow, approved retention/legal-hold/disposition policy, paired PostgreSQL/evidence/key restore proof, hosted isolation/scanner/failure tests, and final Security/QA/DevOps/Release acceptance. `DEC-0047` also remains open for the exact finance evidence matrix and explicit attachment-selection/attestation workflow; mapped high-risk finance actions remain non-production and legacy text is supplemental only.
- Dunong’s controlled-evidence handoff is complete for the implemented foundation: the glossary, upload/support guide, legal-hold administration guide, training module, release note, and indexes cover controlled evidence, quarantine/scan wait, rejection, quota/rate denial, legal hold, retention, download, recovery/support, and the absence of any current AWS integration. These documents continue to label hosted activation and the finance evidence matrix as pending.

### SPF-006 implementation checkpoint — July 22, 2026

- The current approval-engine checkpoint uses one transaction, scoped row locks, live authority revalidation, and compare-and-set transitions. Intermediate approval keeps the source record `PENDING_APPROVAL`, advances only the actionable step, resolves the next currently eligible approvers, and writes the next-step in-app notification atomically. Final approve, return, or reject writes one retry-safe outcome notification for the requester or responsible owner in the terminal-decision transaction. This bounded behavior does not enable broad external fanout.
- The same checkpoint adds canonical user-lock ordering, post-lock authority/MFA revalidation, same-transaction MFA denial auditing, and explicit concurrency-conflict mapping for sensitive Core Administration permission mutations; cancellation locking and compare-and-set protection for pending wastage and Stock Adjustment approvals; and consistent Purchase Order/line/receipt locking for receipt creation, posting, reversal, and remaining-balance closure. Receiving rejects stale shortage/discrepancy snapshots and revalidates live authority and quantities so concurrent actions fail without overwriting, over-receiving, reopening a closed PO, or mutating the ledger.
- Disposable PostgreSQL evidence passes 35/35 admin/platform cases and 31/31 procurement/inventory cases. It covers multi-step advance, direct and role-assigned next-recipient segregation, recipient and authority revocation while lock-blocked, atomic final-outcome notification, approve-versus-reject/cancel races, stale receipt discrepancies, receipt post/reversal versus balance closure, administrative actor/MFA revocation, and duplicate cancellation. Full lint, typecheck, production build, release-tool self-test, secret review, migration review, 823 web tests, 27 database-package tests, and the worker test pass. Independent Security and QA re-reviews returned GO for this explicitly in-progress checkpoint and NO-GO for SPF-006 completion or production promotion.
- The DEC-0049 database control is implemented locally at migration hash `52cccdce8596f9d1b287bc771c219ccf82cbe8b5c43f438ce407ba08bd671efa`. One unconditional `ENABLE ALWAYS` statement trigger rejects `UPDATE`, `DELETE`, and `TRUNCATE` on each of `AuditEvent`, `ProjectActivityEvent`, and `InventoryMovement` with SQLSTATE `55000`; ordinary `SELECT` and `INSERT` remain available. Corrections continue through new audit/activity events or authorized linked inventory reversal movements. The migration contains no row rewrite or backfill.
- Seed and test lifecycle code no longer clears protected history. Ordinary seeding is additive and idempotent, demo reset rebuilds only a loopback, positively marked disposable demo database, and database integration execution owns a uniquely named and marked disposable database. Administrative setup credentials and marker secrets are scrubbed before the application-under-test receives its per-run runtime credential.
- The Hostinger-only database role contract is implemented as packaging-neutral PostgreSQL SQL, controlled migration/verification tools, and systemd credential templates. Staging and production separate a non-login owner, controlled migrator, and membership-free runtime role. The runtime is limited to `SELECT` and `INSERT` on the three protected tables and cannot own protected objects, read `_prisma_migrations`, create schemas/databases, disable guards, alter the guard function, assume the owner/migrator role, or receive an administrative/migrator URL through the application environment. This implementation does not select between a private Hostinger host service and a dedicated private container.
- Local PostgreSQL 17.10 guard evidence preserves identical non-empty pre/post snapshots for all three protected tables, keeps inventory movement and balance-cache totals equal, passes 17/17 real-database mutation/positive-path checks, proves a forced lock timeout leaves no partial guard objects, and reports no pending redeploy or Prisma schema drift. The exact migration is independently reviewed at hash `52cccdce8596f9d1b287bc771c219ccf82cbe8b5c43f438ce407ba08bd671efa` and is `APPROVED_FOR_REHEARSAL`, not production `APPROVED`.
- The disposable lifecycle passes 11/11 local contract tests and the database-role tools pass 8/8. Controlled and adversarial identities are bound to the expected per-run database before mutation, and cross-run identity or role substitutions are rejected. All eight adversarial role/ownership/grant/function/trigger drift cases failed closed, were repaired by the controlled reconciliation path, and left zero per-run database roles after teardown; the PostgreSQL 17.10 mismatch-rejection rehearsal likewise left zero adversarial roles. Independent database/security review returned GO for the local DEC-0049 checkpoint. The complete candidate also passes 27 database tests, 823 web tests, one worker test, lint, typecheck, production build, release-tool self-tests, secret review, migration review in release mode, and `git diff --check`.
- Requested deliberation-model fallback could not be followed literally because `GPT-5.3-Codex-Spark` and the exact `gpt-5.4` identifiers were unavailable in the active toolset. The closest permitted inherited specialist roles were used. This process fallback does not weaken or waive any hard gate.
- DEC-0050 now bounds repeated denied writes into tenant-qualified 5/15/60-minute buckets with exact first/final immutable evidence, fixed closed dimensions, one-way finalization, bounded redacted persistence-failure logging, and PostgreSQL deletion/tamper guards. Authentication admission now uses fixed-cardinality PostgreSQL windows, a database-authoritative ACTIVE/PAUSED key-policy generation, domain-separated signed one-time reservations, canonical locks, success-audit coupling, a bounded Argon2 work gate, exact-source Caddy limits, and aggregate-only monitoring. Fresh PostgreSQL 17 evidence applies all 122 migrations and passes denial 7/7, throttle 9/9, authentication 14/14, approval backfill 3/3, append-only 17/17, route authorization 3/3, and an actual replication-role approval immutability probe.
- The normalized Approval Inbox implementation is server-paginated, resolves direct and active-role eligibility from live permission/scope/resource state, excludes prohibited actors and self-approval, bounds next-recipient notifications to one eligible actor, and removes passive Returned/Audit tabs. It remains behind `APPROVAL_ROUTING_V1_ENABLED=false`. A fresh database with all 122 migrations and deterministic seed passes a serial combined 13/13 PostgreSQL matrix: all 18 registry types dry-run without writes, apply exact permission/due/scope/prohibited-actor descriptors, rerun idempotently, retain exactly one backfill audit, and hydrate authorized details with the expected kind, reference, location/company wording, requester, and status. Representative inbox cases prove direct/role assignment, notification-independent role visibility, `ANY` and multi-location `ALL`, prohibited actors, live permission/role/assignment/effective-date/scope revocation, exact pagination/count, and inclusive due cutoff. The public page service fails closed when disabled, rejects incomplete current-company routing, matches the lower-level eligible page after readiness, and ignores an unrelated tenant's blocker. The shared-database files run serially because the production coordinator lock intentionally excludes concurrent backfill workers; the lock behavior itself remains directly tested. Targeted lint, root typecheck, and 37/37 routing unit tests pass. Independent Database and QA review returned GO to commit this feature-disabled evidence slice after the helper-generated ID type contract was corrected.
- Knowledge-base and glossary assessment: no update is required for this test-only slice because normalized routing remains disabled and no user-facing term, navigation, or implemented workflow behavior changed.
- Local candidate gates pass: lint, typecheck, production build, 928 web tests, 27 database-package tests, one worker test, 20/20 authorization-manifest tests, eight edge/trusted-proxy contracts, release-tool self-test, secret review, migration review for 122 migrations, and `git diff --check`. Independent Database and Security re-reviews returned GO for this feature-disabled local checkpoint; QA returned CONDITIONAL GO for the same in-progress checkpoint and NO-GO for normalized-routing activation or production promotion.
- SPF-006 remains open and Hostinger production activation is **NO-GO**. The exact hosted release must execute the disposable lifecycle and demo-reset safety contract, prove owner/migrator/runtime effective privileges and escalation denials from the real credentials, validate root-owned systemd credential and health-token isolation plus private database/network publication, preserve populated protected-table and report/export evidence through migration, prove idempotent redeploy and role reconciliation after an isolated restore, measure restore and recovery against approved RPO/RTO, calibrate Argon2/edge/pressure thresholds under staged hostile load, prove alert delivery/acknowledgement/escalation and Caddy image provenance/SBOM/scan/signature, and receive Security/QA/DevOps/Release acceptance. Approval activation still requires focused invalid/missing/foreign/deactivated source and scope cases, action-time revocation and exactly-once approve/reject/return concurrency, activation notification/audit retry behavior, remaining pagination/due guards and provenance/source no-mutation assertions, usable action destinations, and production-mode desktop/mobile browser evidence. Remaining request/reversal and audit-semantic gaps, broader service-to-service races, the receiving reference allocator gap, and the cross-workspace audit/action matrix also remain required before SPF-006 completion.

## 4. Workspace Completion Sequence

After the shared baseline is stable, complete workspaces in this dependency order:

| Order | Workspace | Key completion focus | Status |
|---:|---|---|---|
| 1 | Overview and application shell | Default landing, navigation, scope context, role-aware summaries, responsive behavior, and safe drilldowns | Pending production-readiness review |
| 2 | Administration | Companies, brands, locations, users, roles, scopes, policies, approval rules, security controls, and audit access | Pending production-readiness review |
| 3 | Master data | Suppliers, items, categories, units, locations, eligibility/deactivation, duplicate controls, and scoped access | Pending production-readiness review |
| 4 | Approval engine and inbox | Configurable routes, thresholds, pending steps, no self-approval, return/reject, escalation visibility, and audit | Pending production-readiness review |
| 5 | Purchase Requests | Create/edit lines, warehouse-first replenishment decision, submission, approval, correction/cancellation, evidence, and exports | Pending production-readiness review |
| 6 | Quotations | Quote capture, comparison, minimum quote policy, recommendation, exception justification, approval, and evidence | Pending production-readiness review |
| 7 | Purchase Orders | Controlled conversion, issuance, approval, cancellation, outstanding quantities, supplier/location scope, and exports | Pending production-readiness review |
| 8 | Receiving | Ordered/delivered/accepted/rejected/damaged/short/outstanding quantities, discrepancies, partial receipts, posting, reversal, evidence, and PO integrity | Pending production-readiness review |
| 9 | Inventory and immutable ledger | Exact-once movements, derived balances, location scope, lot/expiry behavior, drilldown, reconciliation, and exports | Pending production-readiness review |
| 10 | Transfers | Request, approval where required, dispatch, receipt confirmation, discrepancies, idempotency, reversal policy, and no duplicate stock | Pending production-readiness review |
| 11 | Stock Counts | Freeze/snapshot rules, entries, review, variance, generated adjustment, concurrency, and audit | Pending production-readiness review |
| 12 | Wastage | Reason, evidence policy, approval, posting, reversal, immutable movement, and reporting | Pending production-readiness review |
| 13 | Stock Adjustments | Reason/evidence, approval, separate posting, full reversal, concurrency, and audit | Pending production-readiness review |
| 14 | Reports, exports, notifications, and audit | Scope-safe filters, source links, trust notices, export metadata/audit, in-app notification behavior, and pagination | Pending production-readiness review |
| 15 | Projects & Implementation Tracker | Visibility, membership, tasks, blockers, evidence, requirements, milestones, risks, linked-record redaction, activity, and mobile completion | Pending production-readiness review |

## 5. Workspace Completion Gate

Every workspace must satisfy all applicable items before it is marked complete:

- All visible tabs, panels, actions, and navigation destinations work or clearly explain their intentional read-only/disabled state.
- Create, edit, submit, approve, post, receive, dispatch, complete, cancel, archive, reverse, export, and configuration actions work where the UI implies them.
- Server-side tenant and scope authorization is enforced; UI hiding is not treated as security.
- Valid transitions succeed and invalid transitions are rejected with stable, user-safe errors.
- Financial and inventory segregation-of-duties rules, including no self-approval, are enforced.
- Retried posting actions are idempotent and concurrency-sensitive actions detect stale versions.
- Important changes preserve audit/activity history and do not hard-delete controlled records.
- Required reasons, evidence, attachments, and independent review are policy-driven and enforced.
- Lists provide the required search, filters, pagination, export, and mobile presentation.
- Empty, loading, error, denied, returned, rejected, conflict, and retry states are usable.
- Desktop, tablet, and mobile task flows are verified.
- Relevant unit, integration, access-control, and focused E2E tests pass.
- Workflow, permission, data, UI, knowledge-base, release-note, and training documentation impacts are assessed and updated where behavior changed.

## 6. Phase I and Phase 1.5 Deferred Controlled Transitions

The following remain pending implementation or require a separate confirmed release slice. They must not be represented as available merely because adjacent foundations exist:

- full post-receiving PO amendment for supplier, location, lines, substitutions, and payment terms;
- partial receiving-line reversal;
- transfer dispatch reversal and automated replacement/financial settlement;
- backdated operational corrections outside approved controlled paths;
- opening-balance and inventory cutover execution after the final cutover policy is confirmed;
- automated notification scheduling and external email/chat/SMS delivery;
- time-limited attachment links where direct signed URLs are adopted;
- formal PDF summaries where required;
- broader task dependency enforcement, drag/drop concurrency, and automation beyond the approved Phase 1.5 boundary.

## 7. Later-Phase Boundaries

### Phase 2 — Restaurant Operations and Food Cost

Pending production work includes full regression, mobile operational verification, trusted sales/POS source validation, attachment adoption, training impact, and resolution of any formula or workflow defects found during the workspace pass. Recursive sub-recipe flattening and bulk mutation remain deferred unless separately approved.

### Phase 3 — Finance and Workforce

The current implementation is a controlled foundation. Production implementation remains pending for supplier-credit application, AP settlement, payment execution, bank effects/integration, official accounting consequences, cash-advance and petty-cash settlement, budget hard-block rollout/backfill, broader reconciliation exceptions, production close resolution, full workforce transfer approval, and production document retention.

Phase 3 must not be presented as the official accounting book of record until these controls and the required finance-owner validations are complete.

### Phase 4 — Expansion Projects

The workspace foundation remains subject to the shared attachment/storage, authorization, release-evidence, and workspace completion gates. Contractor portals, public links, advanced Gantt calculations, workload balancing, and custom automation builders remain intentionally out of scope unless separately approved.

## 8. Production Configuration Still Required

- Approval thresholds and authorized approvers
- Emergency-purchase ceiling and post-review deadline
- Evidence and attachment requirements by workflow, action, value, and risk
- Lot/expiry-controlled categories
- Stock-count frequency by location/category
- Opening inventory date and valuation method
- Supplier accreditation and blocked-supplier rules
- Retention, privacy, backup, and restore ownership
- Production evidence-storage provider, limits, scanning, and recovery policy
- Monitoring, incident response, and hypercare ownership

## 9. Related Registers and Source Documents

- `docs/core/07-quality/PHASE1_PHASE1_5_DEFERRED_GO_LIVE_BLOCKERS_FOR_UAT.md`
- `docs/core/07-quality/PHASE2_DEFERRED_GO_LIVE_BLOCKERS_FOR_UAT.md`
- `docs/core/07-quality/PHASE3_DEFERRED_GO_LIVE_BLOCKERS_FOR_UAT.md`
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- `docs/core/04-design/UI_UX_WORKSPACE_AUDIT.md`
- `docs/core/05-technical/DEPLOYMENT_AND_ENVIRONMENT.md`
- `docs/core/07-quality/TEST_STRATEGY_AND_UAT_PLAN.md`

## 10. Maintenance Rule

Update this register only when implementation state, release scope, a confirmed production control, or a material blocker changes. Do not mark an item complete based only on data display, backend scaffolding, local demonstration, or unverified tests. Link completion evidence to the relevant workspace, test run, migration, release artifact, or decision record.
