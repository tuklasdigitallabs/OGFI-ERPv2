# OGFI ERP — Current Pending Implementation Plan

**As of:** July 21, 2026  
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
| SPF-001 | CI and verification baseline | Secret review, release-tool self-tests, lint, typecheck, production build, unit/integration tests, access-control tests, and desktop/mobile E2E pass against the same release candidate | In progress; augmented local and hosted gates pass, but required `main` branch protection is not configured |
| SPF-002 | Migration and data-safety verification | Review all pending migrations, deploy them to a disposable environment, compare pre/post snapshots, and verify rollback considerations | Complete; exact-SHA PostgreSQL 17 rehearsal and checksum-backed evidence accepted under `DEC-0039` |
| SPF-003 | Authentication and privileged access | Confirm production identity provider or login path, privileged MFA enforcement, session invalidation, and break-glass runtime behavior | Implementation complete; production enablement remains blocked on hosted restore/locking evidence and accountable-owner policy signoff |
| SPF-004 | Authorization regression gate | Verify tenant, company, brand, location, department, project membership, restricted-project, and direct-route/API enforcement | Pending full regression evidence |
| SPF-005 | Controlled evidence uploads | Complete the hybrid evidence model described in Section 3 | Pending; production blocker `DGB-012` |
| SPF-006 | Audit and activity integrity | Verify important create, update, transition, approve, post, reverse, cancel, archive, upload, download, export, and denied actions produce the required immutable history | Pending cross-workspace verification |
| SPF-007 | Shared UX states | Standardize loading, empty, error, denied, disabled-with-reason, validation, conflict, retry, and mobile states | Pending workspace verification |
| SPF-008 | Operational list behavior | Verify server-backed search, filters, pagination, export, responsive tables/cards, and selected-record task flows | Pending workspace verification |
| SPF-009 | Deployment and recovery | Complete staging deployment, backup, isolated restore, rollback rehearsal, smoke checks, monitoring, and hypercare procedures | Pending environment execution |
| SPF-010 | Security and dependency review | Run the approved security/dependency checks and resolve release-blocking findings without exposing secrets or internal errors | Pending final release-candidate review |

### SPF-001 implementation evidence — July 21, 2026

- Confirmed `DEC-0038`: augment the baseline and keep SPF-001 open until hosted exact-SHA and branch-protection evidence are accepted.
- CI now provisions PostgreSQL 17, migrates and deterministically seeds the isolated database, typechecks E2E, builds the production artifact, runs database-backed authorization tests without skip fallback, executes desktop/mobile E2E against `next start`, and retains Playwright/release evidence on failure or success.
- Local candidate verification passed: secret review, release-tool self-test, lint, application typecheck, E2E typecheck, production build, 628 web tests across 64 files plus database/worker tests, two executed access-control integration tests, and all 14 desktop/mobile E2E tests.
- Hosted run [`29774246308`](https://github.com/tuklasdigitallabs/OGFI-ERPv2/actions/runs/29774246308) passed for exact implementation SHA `c5e3969b176e271470ca66d3bef607803cb76c3e`, including the `checks` job and CI verification artifact upload.
- Remaining closure blocker: the authenticated repository-admin check returned no classic branch protection and no repository rulesets for `main`; configure protection that requires the `CI / checks` gate before SPF-001 is marked complete.
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

## 3. Controlled Evidence Upload and Storage

Evidence capture will use a hybrid model:

- structured evidence notes;
- verified external references where policy permits them; and
- private file uploads where the workflow or risk policy requires an artifact.

Text alone must not satisfy high-risk evidence requirements unless an approved policy explicitly permits a verified external reference.

### Pending implementation

- Select and approve the production S3-compatible storage provider.
- Use separate buckets and credentials for development, staging, and production.
- Use opaque object keys segregated by tenant and company; do not place original filenames or sensitive business data in object keys.
- Store file metadata and source-record links in PostgreSQL; do not store file bytes in PostgreSQL.
- Enforce source-record authorization on upload, list, preview, download, archive, and replacement.
- Enforce location/department scope, confidential workforce access, and restricted-project membership where applicable.
- Validate configured size limits, allowed extensions, detected content type, and checksum.
- Upload into quarantine and prevent evidence use until malware scanning succeeds.
- Use private server-mediated access or short-lived signed URLs; never expose permanent public URLs.
- Audit upload, scan result, download, archive, replacement, denial, and retention actions.
- Preserve important evidence through archival/versioning rather than normal-user hard deletion.
- Implement retention, legal-hold where required, quotas, encrypted backup/replication, and restore verification.
- Provide one reusable attachment uploader/viewer for workspace adoption.
- Define the attachment requirement matrix by workflow, action, risk, value, and evidence purpose.
- Add cross-tenant, cross-company, cross-location, unauthorized-source, and restricted-project denial tests.

The current `local-private` provider remains suitable for local development and controlled demonstration only. It must not be represented as the final production storage design without the required security, scanning, retention, and recovery approvals.

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
