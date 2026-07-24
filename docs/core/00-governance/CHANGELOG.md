# OGFI ERP — Documentation Changelog

## 2026-07-24 — Goods Receipt Create Idempotency

- Added confirmed `DEC-0093`: new Goods Receipt API/form callers use a bounded durable idempotency key and canonical request hash, with tenant/company uniqueness, live replay authorization, exact actor/location/PO binding, stable mismatch conflicts, indefinite key retention, and no raw-key logging.
- Recorded the required concurrency, rollback, scope, authorization, and exact-once inventory/PO safeguards; requested Spark/GPT-5.4 reviewers were unavailable and the closest permitted GPT-5.6 fallback was used without relaxing gates.

## 2026-07-24 — Goods Receipt Reference Allocation

- Added transactional company/document-type/year sequencing for Goods Receipt public references (`DEC-0092`), replacing the concurrency-unsafe count-based allocator.
- Added user-safe feedback for invalid Receiving status/date filters and reversed date ranges.
- Added user-safe feedback for remaining Receiving discrepancy, stale-line, profile, follow-up, and search errors.
- Added a regression guard preventing these Receiving errors from falling back to generic action copy.
- Recorded the current root lint/typecheck pass and the exact disposable-database blocker for the E2E gate.
- Recorded the corrected full web regression: 1,260 passed tests across 119 files, with environment-gated suites still skipped.
- Recorded the latest production-build attempt stalling after Next.js initialization; build readiness remains unverified.
- Recorded the root test gate: database 34 passed/18 skipped, worker 1 passed, and web 1,260 passed.
- Recorded the passing release-helper self-test and the still-hanging Prisma generation gate.
- Receiving register pages now use a bounded line-count projection instead of loading all receipt lines for list display; detail and export behavior remain unchanged.

## 2026-07-24 — Branch Operations Register Pagination

- Moved the ordinary Branch Operations register to server-backed 25-row pagination with exact scoped counts, filter parity, deterministic ordering, and preserved dashboard/export separation (`DEC-0088`).

## 2026-07-24 — Food Safety Register Pagination

- Moved the ordinary Food Safety register to server-backed 25-row pagination with exact scoped counts, nested-reading and actor search parity, deterministic ordering, and preserved dashboard/export separation (`DEC-0089`).
- Food Safety detail reads now use a direct scoped record lookup instead of loading the full dashboard population.
- Food Safety list rows now carry reading counts without hydrating nested reading payloads.
- Food Safety detail now exposes read-only immutable audit activity for the selected compliance log.
- Refreshed the generated authorization-surface baseline for the Incident detail service and verified the 20-case manifest.

## 2026-07-24 — Incidents Register Pagination

- Moved the ordinary Incidents register to server-backed 25-row pagination with exact scoped counts, validated filters, deterministic ordering, and preserved dashboard/export separation (`DEC-0090`).
- Cancelled incidents no longer inflate overdue counts or display an unresolved follow-up in detail.
- Incident detail now uses a direct scoped lookup and exposes read-only immutable audit activity.

## 2026-07-24 — Maintenance Register Pagination

- Moved the ordinary Maintenance register to server-backed 25-row pagination with exact scoped counts, validated filters, deterministic ordering, and preserved dashboard/export separation (`DEC-0091`).
- Maintenance detail now exposes read-only immutable audit activity for the selected ticket.
- Maintenance actor-name search and empty-versus-no-match state handling now preserve prior register behavior.
- Maintenance completion-date defaults now honor the operational timezone and invalid requested-date filters return the existing safe validation message.
- Maintenance and Incident cancelled rows now use neutral terminal-state styling.
- Full web regression baseline passes 1,258 tests across 119 files; environment-gated PostgreSQL/browser/hosted checks remain pending.
- Closed the server-predicate UUID filter typing defect; Incident and Maintenance typecheck now pass with exact UUID source-link matching retained.
- Added runtime Incident pagination contract coverage for scoped count/page parity and actor-name search.

## 2026-07-24 — Receiving Status and Date Filters

- Added strict lifecycle-status filtering and inclusive operational receipt-date filtering to the ordinary Receiving register and matching full-result export. Filters remain scoped to the selected receiving location.

## 2026-07-24 — Receiving Register Query and Export Parity

- Added a bounded server-side GRN/PO/supplier query to the ordinary Receiving register and carried the active query/tab into full-result CSV export. Follow-up dashboard filtering remains isolated.

## 2026-07-24 — Server-Paginated Receiving Register

- Moved the ordinary Receiving register to server-side tab filtering, bounded pagination, deterministic ordering, and server tab counts; the follow-up profile remains separately paginated.

## 2026-07-24 — Server-Paginated Stock Balances

- Moved ordinary Stock Balances filtering and paging to the server with bounded pages, deterministic ordering, query-aware tab counts, and unchanged full-result export semantics.

## 2026-07-24 — DEC-0078 Initial Procurement Source Serialization

- Added transactional source claims for Purchase Request and Quotation Recommendation submission and an authoritative Purchase Order row lock for balance-closure requests. Focused procurement tests pass; disposable PostgreSQL race evidence remains an activation gate.

## 2026-07-24 — DEC-0050 Initial Procurement Notification Parity

- Aligned five legacy initial procurement submission paths with the shared direct-user/role-scoped step-ready notification contract. Focused local tests pass; PostgreSQL execution and source-serialization races remain explicit activation gates.

## 2026-07-24 — Dormant Controlled-Evidence Qualification Foundation

- Confirmed and implemented `DEC-0077` as a policy-empty, constant-disabled foundation: append-only policy/activation history and qualification facts, a scoped compare-and-swap pointer, database-authoritative canonical/hash/cardinality/readiness validation, commit-time evidence revalidation, least-privilege roles, and an empty closed adapter registry.
- Added no production policy, publisher, adapter, call site, endpoint, UI, report, seed, or default. `DEC-0047` remains open and legacy evidence text remains supplemental.
- Focused validation passes 8 qualifier tests and 7 database contracts; the full candidate passes lint, typecheck, production build, 1,252 web tests, 34 database tests, one worker test, the 20-case authorization manifest, 8 database-role tool tests, secret review, release-tool self-tests, and the 127-migration inventory with the new migration approved only for rehearsal. Twenty-three PostgreSQL cases are authored but cannot execute without `DISPOSABLE_DATABASE_ADMIN_URL`. Independent Architecture, Security, and QA approve only the dormant source checkpoint. PostgreSQL acceptance, hosted recovery, real integration, and activation remain NO-GO. Requested Spark/GPT-5.4 reviewers were unavailable, so GPT-5.6 specialist fallback was recorded without relaxing gates.

## 2026-07-23 — Petty Cash Immutable Step Intent And Proposal CAS

- Confirmed and implemented `DEC-0076` behind `APPROVAL_ROUTING_V1_ENABLED=false`: Petty Cash alone opts into bounded `FULL_GRAPH` preflight, transactionally reconciles locked graph/scope/source state, and appends exactly one immutable unchanged-amount intent for every acted current-step approve, return, or reject.
- Added stable six-decimal server-derived hash/idempotency context, exact Decimal proposal-version compare-and-swap, retained terminal version after proposal clearing, and locked-graph future-step skipping without a second re-lock. Intent, decision, source, audit, notification, and bounded collateral state commit atomically with no amount, payment, bank, journal, fund, ledger, disbursement, settlement, inventory, purchasing, or receiving effect.
- Fifteen disposable-PostgreSQL specifications are authored but unexecuted because the exact database command requires `DISPOSABLE_DATABASE_ADMIN_URL`. Focused tests pass 70 with 159 skipped and one unrelated TODO; the full root candidate passes 1,244 web tests, 27 database-package tests, one worker test, lint, typecheck, production build, and `git diff --check`. Architecture's three initial High findings were corrected; final Architecture, Data, QA, and Security reviews report no remaining Critical/High finding and GO only for the disabled source checkpoint, while PostgreSQL behavioral acceptance/activation remain NO-GO. Requested Spark/GPT-5.4 specialists were unavailable, so GPT-5.6 specialist fallback was used without relaxing gates. Dunong found no visible enablement behavior change while the flag remains false.

## 2026-07-23 — Canonical Prohibited-Actor And Revocation Evidence

- Corrected and implemented `DEC-0075` as feature-disabled PostgreSQL specifications: the registry-derived matrix covers 49 preflight-executable commands (17 approve, 14 return, 18 reject) and excludes only Payment Request approve. Petty Cash no-amount approve and Petty Cash/Payment return/reject remain negative authority tests, not positive policy completion.
- Added full no-write collateral snapshots and 12 deterministic revocation specifications spanning User, real AuthSession, permission-gate composition, production role/scope commands, next recipient, Expense specialized preflight, and decision-first serializations with query-aware ApprovalInstance/PID linkage.
- Focused non-PostgreSQL execution passes 60 tests with 156 PostgreSQL cases skipped and two existing policy TODOs; the full candidate passes 1,234 web tests, 27 database-package tests, one worker test, lint, typecheck, and production build. Architecture, Security, and QA report no Critical/High finding and GO only for the feature-disabled source checkpoint. Both required disposable suites fail only with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`, so behavioral acceptance and activation remain NO-GO. Dunong found no user-facing documentation or glossary change because behavior remains disabled and unchanged.

## 2026-07-23 — Shared Approval Step-Ready Notification Parity

- Confirmed and implemented `DEC-0074` behind `APPROVAL_ROUTING_V1_ENABLED=false`: all seven families using the shared current-step advance now create direct-user readiness through the shared deterministic approval/step notification helper in the canonical transaction, while role-scoped activation creates zero personal fanout.
- Preserved exact step, recipient, assigned-role, permission, and location-scope metadata through a closed non-overriding routing context. Corrected the Quotation Recommendation test mapping to its authoritative related Purchase Request entity.
- Seven-family direct/role, retry/cardinality, representative flag-off, concurrent-winner, and runtime-permitted rollback PostgreSQL specifications are implemented but locally unexecuted; the command fails only with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`. Focused 112-test validation, the unchanged-candidate 1,233-test web suite, 27 database-package tests, one worker test, root typecheck, web lint, and isolated-output production build pass. Architecture returns GO only for the feature-disabled commit; Security reports no introduced Critical/High but requires executable PostgreSQL before behavioral acceptance, and activation remains NO-GO.

## 2026-07-23 — Expense And Cash Advance Approval Source Integrity

- Confirmed and implemented `DEC-0073` behind `APPROVAL_ROUTING_V1_ENABLED=false`: normalized Expense Request and Cash Advance Request decisions now lock and revalidate the exact source/version/linkage, use locked-source evidence, budget, scope, prohibited-actor, and audit values, and apply version-aware compare-and-swap to terminal source mutations.
- Expense approval-material lines are deterministically locked and snapshot-validated. PostgreSQL source/edit, linkage, child-drift/scope, prohibited-actor, evidence, rollback, and cardinality specifications are implemented but locally unexecuted because `DISPOSABLE_DATABASE_ADMIN_URL` is unavailable.
- Web lint, typecheck, the isolated-output production build, focused tests, and the 1,233-test full non-database web suite pass. Independent Architecture, Database, and Security review returned GO only for the bounded feature-disabled source-control checkpoint; the new PostgreSQL cases remain unexecuted. Normalized-routing activation and production promotion remain NO-GO pending executable PostgreSQL, live-revocation, all-family parity, policy, cutover, exact-candidate, and hosted gates.

## 2026-07-23 — Food Cost Overview And Notification Safe Fallback

- Confirmed `DEC-0071`: while the three `DEC-0062` definitions remain open, Overview publishes no Food Cost values, exceptions, availability failures, or source-health assertions and makes no Food Cost analytical read.
- Stopped new Food Cost exception reminder generation from Restaurant Operations scans without deleting or rewriting existing notification history. Authorized users retain neutral navigation to the independently scoped Food Cost Analysis workspace; existing reminders carry definition-under-review context.

## 2026-07-23 — Closed Ledger Variance Reconciliation Drilldown

- Confirmed and implemented `DEC-0070`: Ledger Variance now opens a dedicated, read-only reconciliation profile requiring both balance-view and ledger-view authority.
- Replaced the all-record application-memory comparison with one selected-location PostgreSQL full-key-union query shared by dashboard count/candidates, 25-row search/pages, exact ledger traces, and the audited diagnostic CSV.
- Kept the immutable ledger authoritative and added explicit trust warnings and user guidance; the profile cannot edit balances, create Stock Adjustments, post, approve, or reverse inventory.
- Hardened exact traces after independent review: both permissions are enforced at the page and service, movement history uses exact-total 50-row pages, resolved keys are labeled without hiding history, generated authorization evidence records the permission conjunction, and route controls now meet the 44px target with loading and retryable error states.

## 2026-07-23 — Closed Receiving Follow-up Drilldown

- Confirmed and implemented `DEC-0069`: the misleading `Receiving Variance` dashboard label is now `Receiving Follow-up` with a finite, selected-location lifecycle predicate.
- Added one read-only, searchable, server-paginated profile whose count, candidates, pages, inclusion reasons, and CSV export share the same source-owned authorization boundary.
- Kept create, post, reverse, discrepancy resolution, Purchase Order effects, and inventory authority on independently authorized source workflows, and aligned dashboard/Receiving specifications, glossary, and user guidance.

## 2026-07-23 — Assigned Stock Count My Tasks And Inventory Serialization

- Confirmed and implemented `DEC-0068`: My Tasks enrolls exactly one assigned first-pass Stock Count Start, Enter, or Submit obligation with fixed high/no-due ordering; recount, review, cancellation, variance generation, empty snapshots, and future starts remain excluded.
- Enforced assigned-counter destination parity, actor/state-aware blind redaction, complete review lineage, zero-snapshot rollback, post-lock live authority, and transactionally serialized count actions.
- Added one tenant/company-scoped, deduplicated, sorted Inventory Location lock contract shared by count freeze transitions and every receiving, transfer, wastage, and adjustment posting/reversal path. Real PostgreSQL contention, browser, and hosted gates remain pending before Workspace 1 or Stock Counts may be called production-ready.

## 2026-07-23 — Incident My Tasks And V2 Ordering

- Confirmed and implemented `DEC-0066`: My Tasks now uses a v2 priority/due/age/source cursor and enrolls bounded, role-pooled Incident resolution with severity-aware independent-review controls.
- High/critical resolve and cancel now fail closed when reporter lineage is missing; the Incident detail UI mirrors the actor rule, and direct detail reads preauthorize exact null-aware brand/location scope before returning narrative or evidence.
- Kept cancellation and ordinary correction out of the shared queue, documented the dated-before-undated ordering tradeoff, and updated the workflow, glossary, and My Tasks user guidance.

## 2026-07-23 — Food Safety My Tasks Enrollment

- Confirmed and implemented `DEC-0065`: `My Tasks` now enrolls independently reviewable Food Safety logs and role-pooled returned-log correction through a scoped, read-only, count/page-parity adapter. Final close remains deferred pending final-signoff/self-action policy.
- Hardened direct Food Safety review and Return-for-Correction so missing recorder lineage fails closed before mutation, and aligned the visible Return control with `restaurant.food_safety.correct`.
- Updated My Tasks copy, glossary, user guidance, and the Food Safety workflow; focused coverage now asserts the minimal projection and Food Safety cursor boundary.

## 2026-07-23 — Branch Operations My Tasks Enrollment

- Confirmed and implemented `DEC-0064`: `My Tasks` now enrolls independently reviewable Branch Operations checklists and role-pooled returned-checklist correction work through one scoped, read-only, count/page-parity adapter. Final close remains deferred pending its self-action/final-signoff policy.
- Hardened direct review and Return-for-Correction so missing opener or latest-submitter lineage fails closed before mutation, and aligned the visible Return control with `restaurant.branch_operations.correct`.
- Updated My Tasks copy, glossary, user guidance, and the Branch Operations workflow to distinguish personal work from role-pooled work and preserve source-record reauthorization.

## 2026-07-23 — Action-First Overview Checkpoint

- Added confirmed `DEC-0053`, selecting a bounded, scope-authorized dashboard read contract with closed server-generated drilldowns, per-source degradation requirements, and target-service reauthorization. The earlier Phase I KPI-first wording was aligned with the core action-first dashboard standard.
- Implemented the first Overview checkpoint: `Today’s work` now precedes KPI content after scope/freshness context, approval and exception previews expose deterministic priority metadata, the shell notification control opens the Notification Center, the decorative search affordance was removed, and dashboard loading/retry-error states are present.
- Hardened the next read-model slice: Purchase Requests, Receiving, Transfers, Stock Counts, Wastage, and Stock Adjustments each use an owner-service-authorized, selected-scope count plus a bounded eight-candidate dashboard query instead of full workspace-list materialization. Transfer disputes are prioritized before the cap. The authorization manifest declares the new read exports and focused behavior coverage verifies scoped predicates, narrow projections, caps, denials, and transfer priority.
- Added the Purchase Order dashboard read: it preserves source authorization and selected-location scope while using a count/commitment aggregate, the narrow fulfillment values required for existing open/received exposure parity, and an eight-item overdue preview. It no longer loads supplier, approval, audit, issue-history, UOM, or workspace-line DTOs just to render the overview.
- Added confirmed `DEC-0054`: while normalized approval routing is feature-disabled, Overview deliberately renders an explicit Approval Inbox handoff instead of calling the legacy unbounded approval list, displaying a false zero, or duplicating 18-family eligibility controls. Approval routing and the source action path remain unchanged.
- Isolated dashboard source failures with `Promise.allSettled`: unaffected authorized sources continue rendering, while the UI shows only a generic refresh warning and links users back to authoritative workspaces. No error reason or source-record metadata is exposed.
- Kept Workspace 1 and production promotion open: remaining source families require bounded dashboard-specific queries and every source still needs isolated degradation, drilldown filter contracts, complete action-queue navigation, mobile-shell rework, visual browser evidence, and the shared hosted release gates.
- Updated dashboard user guidance and glossary for the scoped, read-only `Today’s work` view. No controlled source action, scope grant, approval authority, or AWS integration was introduced.

## 2026-07-22 — Approval Integrity Locking and Typed Financial Intent

- Added confirmed `DEC-0052`, requiring a PostgreSQL partial unique index for one pending approval instance per tenant/company/source tuple and manual audited reconciliation when migration preflight finds duplicates.
- Completed the feature-disabled Budget Revision lifecycle checkpoint: normalized review activation, cancellation, approve, and reject now converge on deterministic authority → approval graph → source locks; genuine all-WAITING pre-review cancellation, stale-action fencing, exact eligibility-anchor revalidation, flag-off regression, and 22/22 disposable PostgreSQL cancellation cases are recorded. The decision/cancellation race evidence is first-step only; terminal-decision races remain an activation gate. Normalized routing remains disabled.
- Converged Approval Inbox and source-workspace decisions on one typed transaction-bound canonical dispatcher with approval/step locking, live actor authority revalidation, and scoped source compare-and-set transitions. Exact source-row/version locking remains an activation blocker for the families recorded in the implementation plan.
- Confirmed typed petty-cash current proposal/version storage plus immutable one-row-per-step intent history, while keeping all later-step amount-change behavior disabled until Finance and Operations approve reduction, increase/restoration, reason, and acknowledgment rules.
- Required deterministic AP invoice row locks and exact `NUMERIC` payment-capacity recomputation across active requests, without claiming AP settlement. The exact `PAYMENT_READY`, match, exception, status, outstanding-amount, and active-request matrix remains open.
- Kept `APPROVAL_ROUTING_V1_ENABLED=false` until reviewed migrations, all-family PostgreSQL evidence, policy confirmations, `DEC-0047` proof, and Database/Security/QA/Release reviews pass.
- Added the feature-disabled implementation checkpoint for one pending approval instance per scoped source, typed Petty Cash proposal/intent schema, strict family commands, shared terminal/cancellation primitives, live family-permission detail checks, specialized atomic source outcomes, the corrected PO `AMENDMENT_PENDING` constraint, and atomic Budget first-step due-date activation.
- Reconciled `DEC-0051` with the later `DEC-0052` Petty Cash policy hold. The request workspace exposes no approval amount override, and both routing modes reject an explicit amount differing from the current proposal until Finance and Operations confirm the rules. Canonical Payment Request approval likewise fails closed pending its eligibility matrix; the flag-off path retains its established approval behavior.
- Extended the Hostinger-only role contract to the immutable `PettyCashApprovalStepIntent` table: runtime receives only `SELECT` and `INSERT`, destructive operations are denied, both trigger functions are body-attested, and both exact `ENABLE ALWAYS` trigger names/types/function OIDs are verified. No AWS service was introduced.
- Recorded fresh PostgreSQL 17 disposable evidence across all 126 migrations: 17/17 append-only tests and 175/175 executable approval tests pass, with normalized Petty Cash and Payment Request approve retained as two explicit policy TODOs. Supplemental approval text now remains explicitly named audit context, cannot satisfy Expense, Cash Advance, or Petty Cash source-evidence gates, and cannot overwrite source evidence on approve, return, or reject. An executable flag-off Payment Request case proves the legacy source, approval step/instance, audit, and outcome notification commit together, while the same fixture remains unchanged when normalized approval fails closed. Normalized-routing activation remains **NO-GO** pending the runtime Petty Cash intent writer/version CAS, Budget pre-review cancellation and lock-order races, controlled attachment qualification, exact source-row locking, all-family parity, hosted recovery evidence, and final release acceptance.
- Standardized authentication mutation locking as `User` then `AuthSession` then `MfaAuthenticator`, aligned recovery/enrollment paths, made controlled-evidence denials authorize before metadata or binary work, and updated cross-domain authorization fixtures to assert bounded DEC-0050 denial buckets rather than obsolete per-denial audit events.
- Restricted throttle-control retries to three attempts for reviewed transient `P2034`, `P2028`, `40001`, and `40P01` conditions while explicitly excluding the generation-conflict compare-and-set result. Expanded the PostgreSQL PAUSE/reservation probe to 25 races.
- Added a bounded 10-second acquisition/execution budget for standalone denial recording/finalization after the 24-way exact-count case reproducibly exceeded Prisma's two-second acquisition default. The concurrency test now awaits every outcome before assertion; focused denial evidence passes 7/7. Hostinger saturation and unrelated-query starvation evidence remains a production gate. No AWS service was introduced.
- The final post-correction unchanged-tree gate passed lint, typecheck, production build, 1,052 web unit/contract tests, all 126 migrations, 25 throttle-control races, runtime rollback, 17/17 append-only checks, deterministic seed, eight adversarial role-contract cases, 159/159 database-backed authorization cases, and 175/175 executable approval cases with the two normalized-policy TODOs retained. Release-tool self-tests, secret review, migration inventory, and `git diff --check` also pass. Independent Database, Security, and QA review returned GO to commit and push only with normalized routing disabled and found no remaining commit blocker. The authorization manifest correctly fails closed with `AUTHORIZATION_TEST_ATTESTATION_INVALID:e2e` because production-mode E2E has not been regenerated for the exact candidate; this remains a production-release blocker while the feature-disabled source checkpoint proceeds. Stabilized the evidence-broker capacity regression by calibrating its test watermark after the first reservation is held and guaranteeing gated-writer cleanup; production storage behavior was unchanged.

## 2026-07-22 — Canonical Approval Decision Parity and Atomic Source Effects

- Added confirmed `DEC-0051`, selecting strict typed per-family approval commands over shared transaction-bound primitives, with canonical normalized routing as the sole decision authority when enabled.
- Required final source effects, source audit, terminal approval outcome, notifications, and idempotent domain effects to commit atomically on the final step only. Generic action/remarks dispatch is not sufficient evidence of family parity.
- Recorded the typed target for preserving authorized petty-cash proposals, then explicitly deferred to the later `DEC-0052` policy hold: request-approval amount changes are blocked in both routing modes until Finance and Operations confirm the rules. Expense evidence references and idempotent final commitments, fresh payment-request invoice eligibility checks, and the distinct Budget Revision commitment-fit stage with `WAITING` steps until atomic `start_review` activation remain part of the target parity contract.
- Confirmed that legacy/free-text evidence references remain supplemental and audited, not verified attachments. The `DEC-0047` qualification and explicit-selection policy remains open.
- Kept `APPROVAL_ROUTING_V1_ENABLED=false` and normalized-routing activation at **NO-GO** until the exact-release behavioral PostgreSQL matrix and Security/QA/Release gates pass. This is a confirmed target design, not an implementation-complete claim.
- Preserved open policy gaps for multi-step petty-cash reductions, expense commitment consumption/release, payment status/match coherence, and controlled attachment selection.

## 2026-07-22 — Bounded Denial Audit and Role-Scoped Approval Decision

- Added confirmed `DEC-0050`, selecting a durable PostgreSQL denial bucket with bounded server-derived dimensions, exact atomic counts, one immutable first event, and one immutable final summary only when a completed window contains more than one denial.
- Confirmed a configurable 15-minute default window with validated 5-to-60-minute bounds, no initial interim checkpoints, and one idempotent finalization path shared by a Hostinger systemd timer and lazy rollover. Recording failure never permits the denied operation, and actual workflow actions remain individually audited.
- Confirmed the active `ApprovalInstanceStep` as the authoritative role-assigned work item. Dynamic inbox eligibility uses live authority, scope, effective dates, and no-self-approval; role activation creates zero per-user notifications, direct-user assignment creates at most one idempotent notification, and activation requires at least one eligible non-prohibited approver without locking the full population.
- Implemented the feature-disabled local checkpoint: bounded immutable denial evidence, atomic signed authentication reservations, database-fenced throttle-key rotation, bounded Argon2 work, aggregate-only monitoring, Hostinger systemd/Caddy controls, role-scoped routing/backfill, and a server-paginated Approval Inbox. The decision introduces no AWS service or new queue.
- Recorded fresh PostgreSQL 17 evidence across all 122 migrations and the denial, authentication-throttle, authentication, approval-backfill, append-only, and route-authorization suites. Database and Security review returned GO for the local checkpoint; QA returned CONDITIONAL GO while normalized routing remains disabled.
- Added executable PostgreSQL breadth for all 18 approval document mappings and representative normalized-inbox SQL coverage for direct/role assignment, notification-independent role visibility, `ANY`/`ALL` scope, prohibited actors, live revocation, pagination/counts, and due cutoffs. Extended the fresh-database matrix to 13/13 with authorized detail hydration for every type plus public page-service disabled, incomplete-cutover, ready-company parity, and cross-tenant blocker-isolation behavior. Independent Database/QA review approved this feature-disabled evidence slice after root typecheck passed.
- Split approval action runtime readiness from exhaustive operator cutover inspection so workflow transactions use their supplied Prisma client and do not self-block on the backfill coordinator. Moved the steady-state guard before mutation, added a deterministic locked/revalidated next-role anchor to the shared action engine, and proved a distinct-actor two-step transition plus terminal concurrency/revocation cases in a fresh combined 23/23 PostgreSQL matrix. Normalized routing remains disabled; independent review keeps activation at NO-GO until the ten specialized handlers and Finance Close adopt the same canonical preflight and the all-18 action matrix passes.
- Extended the canonical normalized decision preflight across the ten specialized finance/workforce handlers and Finance Close, with deterministic approval/step locks, live session and actor revalidation, scoped compare-and-set writes, source-state conflict detection, and serialized Finance Close lock/reopen requests. Public Finance Close lock/reopen service entrypoints now request approval instead of mutating the accounting period directly.
- Added migration `20260722200000_approval_routing_step_order_guard` at hash `792c04eee347c96cc5a1d4c2e9422ee1ccbabd5f659b6baf51d787af2ef2773b`: normalized v1 step order is protected by an `ENABLE ALWAYS` SQLSTATE `55000` trigger, and company-wide runtime readiness has a tenant/company/status index. A fresh 123-migration database passed the combined 25/25 approval-routing suite, including direct step-order mutation denial with an unchanged row.
- Kept activation at **NO-GO** after independent Security and Correctness review found live source-workspace actions that can bypass the canonical approval instance, unchecked terminal future-step cleanup, and missing executable action breadth across all 18 families. The disabled checkpoint is accepted for commit; those blockers are the next implementation slice.
- Kept normalized routing, SPF-006, and Hostinger activation at **NO-GO** pending focused negative sources/scopes, action-time revocation and exactly-once concurrency, activation retry semantics, pagination/provenance depth, usable browser action destinations, production-mode browser evidence, remaining audit/race gaps, exact-release hosted credential/restore/load/alert evidence, calibrated thresholds, image provenance, and final release acceptance.

## 2026-07-22 — DEC-0049 Append-Only History Implementation Checkpoint

- Recorded the local implementation of unconditional PostgreSQL `UPDATE`, `DELETE`, and `TRUNCATE` guards for `AuditEvent`, `ProjectActivityEvent`, and `InventoryMovement`, while preserving normal reads and append-only inserts.
- Recorded additive/idempotent seed behavior, positively identified disposable demo/database-test lifecycles, and removal of protected-history cleanup assumptions.
- Recorded the Hostinger-only owner/migrator/runtime role boundary, controlled migration and verification tools, root-owned credential-file pattern, post-restore ownership/grant reconciliation, and runtime mutation/escalation denials. No AWS integration was introduced.
- Recorded independent `APPROVED_FOR_REHEARSAL` review of the exact append-only migration hash, PostgreSQL 17.10 guard evidence at 17/17, disposable lifecycle at 11/11, database-role tools at 8/8, and eight fail-closed adversarial drift/repair cases with zero leftover per-run roles. Controlled and adversarial identities are bound before mutation, cross-run substitutions are rejected, and the PostgreSQL 17.10 mismatch-rejection rehearsal left zero adversarial roles. Independent review returned GO for the local checkpoint, and the full lint, typecheck, test, build, release-tool, secret-review, migration-review, and diff gates are clean.
- Kept SPF-006 open and Hostinger production activation at **NO-GO**. Exact hosted lifecycle/reset execution, root-owned credential and systemd isolation, private database networking, populated protected-history/report/export equivalence, isolated restore and role reconciliation, measured RPO/RTO, and final Security/QA/DevOps/Release acceptance remain required.

## 2026-07-21 — Controlled Evidence Implementation Foundation

- Recorded the implemented SPF-005 foundation: isolated AES-256-GCM evidence broker, private ClamAV streaming, authorized streamed upload/download, quarantine and exact-version release, PostgreSQL idempotency/quota/upload-lease/rate-limit controls, legal-hold backend and admin retention register, recovery staging/verification tools, Hostinger deployment overlay, and authorization coverage.
- Bound the controlled-evidence migrations at `17:00`, `18:00`, and `19:00` to their computed SHA-256 values. Independent database re-review moved the exact hashes to `APPROVED_FOR_REHEARSAL`; populated-predecessor, quiescence, redeploy, drift, report/export, and isolated-restore evidence remain required before production approval.
- Kept SPF-005 open. Real Hostinger values, independent encrypted backup and key escrow, approved retention/legal-hold/disposition policy, paired restore proof, hosted failure/isolation tests, and final release acceptance remain production activation blockers.
- Confirmed that AWS is not part of the current integration; external object storage remains a future migration option only after a documented trigger and new material decision.
- Hardened the foundation with MIME-to-extension enforcement at upload and clean-release boundaries, a process-lifetime evidence-root broker lock, preservation-aware archive states, bounded embedded evidence lists with a server-paginated register, normalized retention pagination, and accessible uploader focus/keyboard behavior.
- Completed the controlled-evidence glossary, administrator/support guides, training module, and controlled-rollout release note.
- Recorded `DEC-0047` as an open finance-policy gate: free text cannot qualify as high-risk evidence, but finance-owner approval is still required for the exact artifact/purpose/count/value matrix, outage handling, and explicit attachment-selection attestation. The mapped Phase 3 finance actions remain non-production.

## 2026-07-21 — Controlled Evidence Same-VPS Decision Supersession

- Added `DEC-0046`, superseding `DEC-0045` and confirming a dedicated internal minimal storage broker plus private ClamAV on the same Hostinger VPS for the initial controlled-evidence implementation.
- Required broker-exclusive access to the absolute private evidence mount and versioned AES-256-GCM key, application-proxied streaming, opaque immutable keys/versions, PostgreSQL authorization/idempotency/quota/quarantine/CAS/audit authority, private `INSTREAM` scanning, and bounded systemd reconciliation without detached post-response work, Redis, or a queue.
- Recorded that same-VPS filesystem storage is not WORM/Object Lock and retains root-compromise and same-disk-loss risks; required application retention/legal hold plus provider-managed or independently recoverable encrypted backup and paired restore proof.
- Kept VPS capacity/utilization, evidence quotas/high-water thresholds, encryption-key custody/recovery, Hostinger backup entitlement/location/encryption, RPO/RTO, retention/legal-hold policy, pinned ClamAV resources/signature freshness, and hosted restore proof open as production activation gates. SPF-005 is not production-ready.
- Deferred external storage until capacity, multi-host, stronger RPO/RTO, legal WORM, or tenant-scale triggers require a new decision and copy-verify-cutover migration.

## 2026-07-21 — Superseded Controlled Evidence Storage and Malware-Scanning Decision

- Added `DEC-0045`, which originally confirmed AWS S3 with GuardDuty Malware Protection and is now superseded by `DEC-0046`.
- Confirmed one private, protected bucket per environment, opaque quarantine keys, immutable exact object versions, dual GuardDuty-tag/PostgreSQL release state, non-authoritative EventBridge callback processing, and bounded database-backed reconciliation without Redis or a queue.
- Required S3 Versioning, SSE-KMS, Object Lock Governance, and cross-account replication/backup; prohibited Object Lock Compliance mode without explicit Legal approval and prohibited production `local-private` fallback or a malware-scan waiver.
- Kept account/Region/residency, ownership, budget, retention/legal hold, quota, RPO/RTO, incident/recovery ownership, and hosted staging/restore evidence open as production activation gates.

## 2026-07-21 — Authorization and Production-Authenticated E2E Gate Decision

- Added `DEC-0044`, allowing SPF-004 to close from exact-SHA production-build, database authorization, manifest, and isolated development-fixture desktop/mobile E2E evidence.
- Retained authenticated production-mode `next start` E2E as an explicit SPF-001/SPF-009 production-release blocker requiring ephemeral password/MFA fixtures and a loopback HTTPS proxy.
- Rejected production demo-authentication bypass and prohibited weakening trusted-origin, secure-cookie, session, MFA, or live-authorization validation for automation.

## 2026-07-21 — Tenant Role Administration Authorization Decision

- Added `DEC-0043` confirming that `UserRoleAssignment` remains tenant-global while all direct role administration requires `core.tenant_role_administer`.
- Required active/effective selected-company membership for target-user role actions without treating the resulting role assignment as company-bound.
- Confirmed the permission for `CONFIGURED_ADMIN` and `CONFIGURED_SUPER_USER`, retained existing sensitive-role safeguards, and deferred a company-bound role-assignment schema to a future material decision.
- Clarified that controlled approval is required to grant a sensitive role but must not prevent an authorized administrator from revoking that active assignment with audit and session invalidation.
- Kept SPF-004 pending implementation and executable authorization evidence.

## 2026-06-29 — Stock Adjustment Foundation Decision

- Added `DEC-0019` confirming the Phase I Stock Adjustment foundation as non-posting `StockAdjustment` and `StockAdjustmentLine` records only.
- Updated the data dictionary, wastage/adjustment workflow, and UI specification to state that stock adjustments in this slice do not integrate approvals, post ledger movements, update balances, create opening balances, post count variance, allow backdating, or support reversal.
- Added a Dunong handoff gap for future end-user stock-adjustment documentation and release-note assessment.

## 2026-06-25 — Version 5 Full Documentation Consolidation and Agent Working Style

- Consolidated the complete ERP documentation foundation into a single current working package.
- Integrated the root `AGENTS.md` working-style rules for targeted context reading, minimal-change discipline, quiet shell/tool usage, concise completion reports, medium reasoning by default, and fresh-session guidance for stale context.
- Added `AGENT_WORKING_STYLE_AND_TOKEN_EFFICIENCY_STANDARD.md` as the documented governance mirror of the root agent rules.
- Updated the documentation map, document control, root README, and documentation-agent instructions to reference the V5 behavior standard.
- Confirmed that token efficiency cannot bypass ERP audit, approval, inventory, authorization, testing, security, documentation, or material-decision controls.

## 2026-06-25 — Knowledge Base, Enablement, and Dunong Subagent Added

- Added Dunong as the Knowledge Base and Enablement Writer subagent.
- Established a separate user-facing documentation system for knowledge-base articles, FAQs, troubleshooting, training content, and end-user release summaries.
- Clarified ownership boundaries between Mithi’s source-of-truth internal documentation and Dunong’s user-facing enablement documentation.
- Added standards, templates, backlog, article categories, and a gap log to prevent user documentation from inventing business policy.
- Updated the subagent operating model, role directory, root AGENTS.md, document control, and documentation map.

## 2026-06-25 — Initial Complete Documentation Structure

- Established the cross-phase documentation foundation.
- Organized Phase I purchasing and inventory documentation into a canonical phase folder.
- Added planned documentation frameworks for Phases II–V.
- Added templates for future workflows, UI specifications, data extensions, reports, acceptance criteria, and UAT scenarios.
- Confirmed the Modern SaaS visual direction with restaurant-grade operational controls.

## Change Log Rule

Add a dated entry whenever an approved decision changes product scope, business workflow, data model, permissions, security controls, technical architecture, UI standards, or a release gate.

- 2026-07-24: Confirmed `DEC-0094` for phased Receiving register refinements. Phase A adds server-owned supplier and Purchase Order filters with one normalized predicate shared by rows, counts, pagination, and ordinary CSV export; item, receiver, and accepted-value controls remain deferred pending relation, option-loading, currency/null-cost, and query-plan evidence.

- 2026-07-24: Extended the ordinary Receiving register’s server-owned query/export contract with strict status allow-list and received-date range filters. Counts, tab views, and CSV export share the active query/status/date scope; the legacy Posted tab remains non-DRAFT for compatibility. The initial operational date timezone is `Asia/Manila`; item, receiver, and value selectors remain pending.
- 2026-07-24: Added server-backed pagination to the ordinary Inventory Ledger with scoped counts, deterministic occurred-time/ID ordering, and filter-preserving page links. Exact reconciliation traces and full filtered CSV export remain separate controlled paths.
- 2026-07-24: Added server-backed pagination to the ordinary Wastage register with selected-scope counts and deterministic creation-time/ID ordering. The closed dashboard exception profile remains a separate read-only contract.
- 2026-07-24: Bound signed My Tasks cursors to the explicit `my-tasks-registry-v2` adapter contract version. Future predicate, enrollment, ordering, or projection changes must bump the version so stale cursors fail closed.
- 2026-07-24: Added server-backed pagination to the ordinary Stock Counts register with scoped counts, deterministic ordering, and preserved blind-count/redaction behavior. Export remains a separately authorized full report.
- 2026-07-24: Added server-backed pagination to the ordinary Transfers register. All, Draft, Dispatch, Receive, and Completed tabs now use server predicates and scoped counts; the dashboard follow-up profile remains separate.
- 2026-07-24: Added server-backed pagination to the ordinary Stock Adjustments register with scoped counts and deterministic ordering; the dashboard exception profile remains separate.
- 2026-07-24: Added server-backed pagination to the ordinary Purchase Requests register with scoped counts and filter-preserving navigation; the Open PR dashboard profile remains separate.
- 2026-07-24: Added server-backed pagination to the ordinary Purchase Orders register with scoped counts and filter-preserving navigation; the Open PO dashboard profile remains separate.

## 2026-06-25 — V3 subagent deliberation and decision governance

- Added parent-led structured deliberation protocol for material decisions.
- Added decision brief, scorecard, decision record template, and confirmed-decision registry.
- Updated root instructions, Codex operating model, role directory, starter prompts, and all subagent profiles.
- Clarified QA, security, code-audit, technical documentation, and knowledge-base ownership boundaries.
- Removed presentation-only nickname fields from custom subagent definitions.

---

## Version 4 — Projects & Implementation Tracker

**Date:** June 25, 2026

- Added Phase 1.5 — Projects & Implementation Tracker as an ERP-native, Trello-like coordination module.
- Added product specification, workflows, data extensions, UI specifications, build backlog, technical plan, reporting specification, UAT plan, and decision register.
- Updated the product brief, phase plan, module map, roles and permissions, security/audit model, approval boundary, data dictionary, database schema guidance, UI standard, notification rules, reporting rules, test strategy, governance decision log, root AGENTS.md, documentation map, subagent prompts, and knowledge-base backlog.
- Confirmed that task cards may link to controlled ERP records but may not mutate their approval, inventory, financial, or source workflow state.
## 2026-07-23 — Maintenance My Tasks And Correction Authority

- Confirmed and implemented `DEC-0067`: My Tasks now enrolls bounded, role-pooled Maintenance completion with native priority and due dates, exact nullable-brand scope, and independent high-risk completion controls.
- Made Maintenance correction consistently require `restaurant.maintenance.correct`, and hardened high-risk completion/cancellation plus scoped dashboard, detail, history, and source-Incident reads.
- Updated Maintenance workflow, UAT, glossary, and dashboard guidance; Workspace 1 remains open for its remaining browser, database, backlog, and hosted gates.

## 2026-07-23 — Dashboard Source Observation And Deadline Contract

- Confirmed and implemented `DEC-0072`: Overview now reports assembly and per-attempt source-check times without claiming business freshness, completeness, or real-time consistency.
- Replaced eager shared source mutation with lazy authorized descriptors, immutable result patches, and a configurable 2.5-second technical deadline capped at 3 seconds.
- Added explicit partial-result provenance and nullable cross-source totals, replaced the unbounded Inventory Balance dashboard read with a bounded aggregate, and aligned dashboard UI, environment, glossary, help, and release guidance.
- Workspace 1 remains open for authenticated responsive-browser, staging fault-injection/performance, production-build, database, and hosted gates.

## 2026-07-24 — Authorization Gate And Inventory Scope Hardening

- Hardened inventory posting preflight and transfer locking against tenant/company leakage, unordered related-location results, and duplicate-retry authorization bypasses; corrected scoped dashboard UUID casting and reconciliation lot-key grouping for PostgreSQL.
- Corrected disposable PostgreSQL Docker transport for non-default loopback ports and aligned the role-contract verifier with PostgreSQL ACL behavior.
- Normalized empty brand context handling for maintenance dashboard reads while preserving explicit nullable-brand scope semantics. Disposable PostgreSQL authorization evidence now covers authentication, procurement/inventory, projects/operations, access-control, adapters, admin/platform, finance, workforce, and protected routes; hosted production gates remain open.

## 2026-07-24 — Goods Receipt Create Idempotency Foundation

- Implemented the confirmed `DEC-0093` additive Goods Receipt idempotency contract: durable tenant/company-scoped keys, canonical request hashes, strict actor/location/PO replay binding, safe conflict behavior, and automatic UI key rotation when the selected PO changes.
- Focused receiving tests, lint, typecheck, and disposable migration deployment pass. After restoring the native Prisma Client, the seeded disposable lifecycle also passed seed repeatability and the receiving serialization integration, including idempotency replay/conflict and authority/closure races; hosted, browser, and final release gates remain open.

## 2026-07-24 — Receiving Register Filter Phase A

- Implemented `DEC-0094` Supplier and Purchase Order filters through one scoped server predicate shared by page rows, tab counts, pagination, and ordinary CSV export; bounded receipt-derived options and responsive filter controls are documented.
- Item, receiver, and accepted-value filters remain deferred pending relation/query-plan, historical-option, cost-visibility, currency, and null-cost decisions. Focused tests pass; disposable filter execution, browser, production-build, and hosted gates remain open.
