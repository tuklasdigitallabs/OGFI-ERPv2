# Inventory Control Pilot — Pre-UAT Audit

**Date:** 2026-09-07  
**Source baseline:** `d8dabf2083c5debc70a47c0e76a9fe816d25d43f`  
**Status:** Audit findings and recommendations; not release authorization  
**Review:** Parent-led independent Security, Movement Integrity, Loss Controls, and QA reviews using requested `gpt-6-astra`, followed by targeted challenges  
**Scope:** DEC-0258 connected Inventory Control Pilot; DEC-0266 readiness profile; current implementation and immediate dependencies

## Recommendation

**NO-GO for operational stock-of-record use.** Continue isolated engineering diagnostics and defect reproduction. Named-user connected synthetic UAT is conditional on admission of the exact environment, cohort, approval work surface, and evidence prerequisites. Shadow operation must retain the approved manual stock record and independent reconciliation. Neither this audit nor a healthy local application admits those stages automatically.

The implementation contains substantial stock-posting and authorization safeguards. However, blind-count information can escape through adjustment drafts, receiving can omit delivered-unit classification, and configured adjustment evidence requirements are not enforced. Additional recovery and opening-cutover defects obstruct the connected control chain. Count-generated correction/recount remains deliberately gated and cannot receive acceptance credit.

These are opportunities to conceal or misclassify loss, or obstacles to reliable reconciliation. They do not establish that theft has occurred. Internally consistent ledger and balance figures do not establish physical stock accuracy.

## Method and limits

- Reviewed relevant services, callers, schemas/migrations, test cases, pilot configuration, UI projections, approved decisions, and the current pending implementation register. This is not a whole-ERP audit.
- Findings below distinguish source-traced defects, source-function reproductions, conditional exposure, and intentional release gates. No full application exploit, database race, hosted configuration, or physical store inspection was executed.
- Actual deployed users, scope grants, policy rows, selected SKU cohort, credentials, MFA, and latest hosted evidence were not inspected. Historical passing results in documentation were not credited to this baseline.
- No application, schema, configuration, live database, or production changes were made. Pre-existing untracked training PDF/templates were preserved. Audit output consists of this report and the companion [adversarial UAT checklist](INVENTORY_CONTROL_ADVERSARIAL_UAT_2026-09-07.md).
- DEC-0279 manual servings/consumption is locally implemented, default-off, and outside pilot release scoring. Its immediate stock writer uses the common posting boundary; no bypass was confirmed in that bounded check. This is not certification of that deferred module.

## Findings register

Severity reflects operational control impact, not a claim of unauthenticated remote exploitation. All line references below refer to the baseline above.

### F01 — High: adjustment drafts disclose blind-count quantities

**Precondition:** A counter also has Stock Adjustment create permission at the counted location. This exact combination exists in the synthetic inventory-requester role, although live user assignment was not verified.

**Trace:** Create/start a blind count; its creator is assigned as counter. Create a small adjustment draft for a counted SKU/lot. Creation copies the current balance into `systemQuantityBaseUom`; the adjustment detail returns and displays it as **System Qty**. CREATE alone grants the read path. With movements frozen, this exposes the expected count quantity without approval or posting. A counter can copy that quantity instead of recording missing physical stock. The dedicated count-performer-only role is not demonstrated vulnerable by this path.

**Evidence:** `scripts/fixtures/inventory-pilot.synthetic.local-only.json:67,78`; `apps/web/src/server/services/stockCounts.ts:1572,1586`; `stockAdjustments.ts:192,1052,1139,1157`; `apps/web/src/app/(app)/adjustments/[id]/page.tsx:304,328`.

**Acceptance:** Protect quantity-bearing services and existing records during protected counts, or enforce an approved incompatible-duty constraint. Test actual combined grants across adjustment creation/detail, balances, ledger, exports, and browser payloads. Hiding values only on the count page is insufficient. **Confidence: High, static end-to-end trace.**

### F02 — High: delivered units escape receiving discrepancy controls

**Reproduction:** PO outstanding 10; delivered 10; accepted 6; rejected/damaged/short 0; no reason or evidence. The current validator accepts it. The line can be `ACCEPTED`, the report can be `POSTED`, and `discrepancyFlag` remains false while four delivered units have no recorded disposition.

**Impact:** Six units correctly enter the ledger; the four unclassified units bypass the discrepancy queue and its evidence requirement. Raw delivery/acceptance numbers remain available for investigation. This is a classification/control gap, not ledger corruption.

**Evidence:** `apps/web/src/server/services/receiving.ts:486,1741,1767,2048,2180`; `docs/phases/phase-01-procurement-inventory/workflows/receiving-transfer-workflow.md:122`; `specs/receiving-ui-spec.md:77` in the same phase folder.

**Challenge:** The dictionary permits acceptance below delivery and mentions pending inspection. That does not justify marking the unclassified quantity accepted/posted without a pending-inspection bucket or follow-up.

**Acceptance:** Every delivered unit must be classified before final posting, or remain in an explicit approved pending state. Test partial acceptance with and without the remaining outcomes. **Confidence: High; exact source validator reproduced.**

### F03 — High: adjustments ignore configured evidence-required reasons

**Trace:** The active reason-code helper returns `requiresEvidence`. Adjustment creation uses the reason identity but ignores that requirement; header/line references remain optional. Submission and posting do not enforce it. A requester can submit an evidence-required decrease without evidence and obtain ordinary approval/posting.

**Evidence:** `apps/web/src/server/services/operationalReasonCodes.ts:382-403`; `stockAdjustments.ts:65,1161,1166,1194,1267`.

**Acceptance:** Enforce the authoritative reason's requirement against qualified evidence at submission and protect the approved evidence/policy facts through posting. Test missing evidence, returned submissions, changed policy, and unavailable evidence. The approved evidence matrix must determine acceptable artifacts/references. **Confidence: High; independently corroborated static trace.**

### F04 — High: requester estimates can suppress material-loss signals

**Trace:** Wastage estimated unit cost accepts/defaults to zero and is used without independent valuation. Monetary policy selection excludes policies above that supplied total. A substantial stock loss entered at zero cost can avoid the applicable material-value/evidence policy. Adjustment value impact also uses requester inputs.

**Evidence:** `apps/web/src/server/services/wastage.ts:67,317,1389`; `stockAdjustments.ts:1159`; `apps/web/src/components/WastageLinesEditor.tsx:12`; `StockAdjustmentLinesEditor.tsx:11`.

**Qualification:** Normal approval remains mandatory. No threshold-based approval-route bypass was established; the concrete exposure is value/policy classification. Extent depends on configured monetary policies. The approved valuation method remains a business decision.

**Acceptance:** Unknown or unverified value must not silently become zero for materiality assessment. Establish approved estimate authority and review behavior; test zero, omitted, understated, and independently corrected prices. Do not introduce an unapproved accounting valuation method. **Confidence: High in source behavior; conditional policy exposure.**

### F05 — High: repeat-wastage detection depends on line order

**Trace:** Create and submit evaluate item/location history only for the first report line. Put an unrelated item first and a repeatedly wasted SKU second to omit that SKU's repeat flag. Per-document reporter flags may still apply; this does not guarantee all review is avoided.

**Evidence:** `apps/web/src/server/services/wastage.ts:343,1414,1580`; repeat-loss visibility in DEC-0021 and the wastage workflow.

**Acceptance:** Evaluate every relevant distinct item/location and retain affected identities. Reordering lines must not change the result. Also exclude the current draft from history and use the immutable reporter: the current query includes the draft and uses the submitter's user ID (`:355,360`) before adding one (`:168,174`), causing unstable or misattributed flags. **Confidence: High, static trace.**

### F06 — High: stale receipt drafts block supported reversal

**Reproduction:** For PO 10, create A for 6/short 4 and B for 4/short 6 with required discrepancy information. Post A. B fails the live short-quantity check and stays DRAFT. Reversing A is then blocked because B is open. No supported draft-edit/cancel service closes this loop.

**Evidence:** `apps/web/src/server/services/receiving.ts:2022,2029,2420`; `apps/web/src/app/(app)/receiving/[id]/page.tsx:329`. Existing database test `apps/web/tests/authorizationReceivingSerializationDatabase.integration.test.ts:933-966` encounters the stale draft and directly changes it to CANCELLED before continuing reversal. That is fixture repair, not product recovery.

**Acceptance:** Preserve stale-state rejection and add an authorized, audited draft cancellation/revision path under the same PO lock. The complete recovery test must use supported services with no direct database repair. **Confidence: High; code and existing test corroboration, no DB rerun.**

### F07 — High: valid decimal opening values conflict with database guards

**Reproduction:** Quantity 3 × cost 0.10 becomes JavaScript `0.30000000000000004` in canonical JSON. The database stores six decimal places and compares those facts exactly with the JSON. Separately, 1.234567 × 1.23 produces 1.51851741, which cannot fit the six-decimal value column while satisfying the unrounded product equality.

**Evidence:** `apps/web/src/server/services/openingInventoryCutovers.ts:552-568`; `packages/database/prisma/migrations/20260731110000_opening_inventory_cutover_foundation/migration.sql:193,204,669`. Existing integration examples use integer costs/quantities.

**Impact:** Preparation should fail closed; no silent stock corruption is claimed. The immutable opening cutover is nevertheless unavailable for valid inputs.

**Acceptance:** Adopt consistent approved decimal precision/rounding across calculations, canonicalization, storage, and database invariants. Run fractional-cost/quantity and exact-retry database cases. **Confidence: High in arithmetic/schema conflict; source arithmetic reproduced, database rejection not executed.**

### F08 — High, conditional on selected stock: transfers cannot allocate lot/expiry buckets

**Trace:** Transfer creation accepts item/quantity/notes and leaves lot/expiry empty; no preparation/edit path supplies them. Dispatch passes empty values to the stock writer, which rejects tracked items or cannot find stock held only in a named bucket.

**Evidence:** `apps/web/src/server/services/transfers.ts:58,1684,2464`; `inventory.ts:611`; `inventoryPilotConfiguration.ts:1071,1101`; `inventoryPilotApprovalPolicy.ts:584`.

**Qualification:** Selected-item admission does not exclude tracked items. Actual selected SKUs were not inspected. Posting remains safely blocked; this is an operational coverage gap, not duplication.

**Acceptance:** Prove an ordinary UI/service-created transfer can select and preserve source lot/expiry through dispatch, receipt, and reversal. Any temporary cohort restriction requires explicit owner agreement and does not repair the missing workflow. **Confidence: High in code path; cohort applicability unverified.**

### F09 — Medium: VIEW-only location scopes permit source mutations

**Precondition:** Role grants create/submit permissions, with OPERATE at A and VIEW at B. Context allows selecting B without distinguishing the access level; wastage/adjustment create/submit check permission and selected location but not operational access level.

**Evidence:** `apps/web/src/server/services/context.ts:210,244,393`; `stockAdjustments.ts:1166,1267`; `apps/web/src/app/(app)/adjustments/page.tsx:47`; `adjustments/[id]/page.tsx:33`.

**Impact:** Source documents and approval queues can be changed at a view-only location. Final stock posting correctly requires operational scope (`inventoryActionAuthority.ts:100`); direct unauthorized stock posting is not established.

**Acceptance:** Apply live operational-scope checks to source mutations and test mixed grants, direct actions, and mid-action revocation. **Confidence: Medium–High; static trace.**

### F10 — Medium: wastage submission drops reason-only evidence policy

Creation passes `controlledReasonCode.requiresEvidence`; submission omits it when reevaluating policy. Its default is false, and submission replaces the stored evidence flags. With no independent category/policy requirement, a required reason becomes reported as not required. Existing reference text remains; deletion of already-saved evidence was not demonstrated.

**Evidence:** `apps/web/src/server/services/wastage.ts:146,1420,1576,1642`.

**Acceptance:** Preserve or revalidate every policy dimension across submission/resubmission, including reason-only and changed-policy cases. **Confidence: High; evaluator behavior reproduced and call-site omission traced.**

### F11 — High admission risk: readiness population counts can produce misleading PASS

The readiness script counts users/roles/scopes/rules globally rather than binding them to the exact named cohort. Relevant assignment counts omit start dates. Opening checks accept populated balances/movements and lack ledger-sum comparison. Strict release checks default off, but successful output still says the pilot is ready for UAT evidence capture. Even strict mode does not fix cohort binding.

**Evidence:** `scripts/pilot-readiness-check.mjs:87,278-310,338-352,411,445,530-534`; `scripts/pilot-readiness-profile.test.mjs:8`.

**Acceptance:** Treat the existing output as a population diagnostic until admission binds to the exact cohort/revision, effective named actors, authentication, eligible family routes, and reconciled opening stock. Adversarially test unrelated tenants, future assignments, absent credentials, stale configuration, and mismatched balances. This is not a transactional authorization bypass. **Confidence: High, static query trace.**

## Intentional gates and assurance limitations

1. **Count correction/recount: blocked, not accepted.** `stockCounts.ts:4166` unconditionally disables variance adjustment generation. Recovery evidence qualification remains fail-closed (`:1696`); the visible recovery panel has no working admission action (`StockCountRecoveryPanel.tsx:291`). P1-UAT-011 cannot pass. Preserve these gates until approved evidence/segregation and lineage tests pass. Disabled attempt-authoritative reads (`stockCounts.ts:679`) also require successor parity verification before activation; this audit does not label the intentionally disabled projection a reachable exploit.
2. **Reference-only evidence is not verified photography.** `wastage.ts:181` accepts any nonempty reference; controlled attachment source support omits these loss documents (`attachments.ts:30`). DEC-0015 explicitly adopted evidence references, so this is a known assurance limitation, not an instruction to require uploads for every case. The current open-decision evidence boundary requires verified references or files as policy specifies. Qualify the action-specific custody/review process before high-risk operational use.
3. **Draft count history is incomplete for investigation.** Saved entries overwrite prior numeric observations (`stockCounts.ts:2248`); the audit event records a line count rather than before/after numbers (`:2329`). Submitted protection is stronger. Retaining earlier saved observations is a recommended forensic safeguard requiring explicit design review, not a newly invented requirement to record every keystroke.
4. **Unexpected physical stock needs an exception path.** Count snapshots derive from existing balance rows (`stockCounts.ts:1986`) and entry uses those lines. Prove a controlled add-on for unexpected items/lots or document an independent exception sheet during shadow testing; otherwise surplus/mislocated stock can go unrecorded.
5. **Local baseline health is not UAT admission.** DEC-0276 explicitly retains admission blockers. Local Compose uses development/local auth (`infra/docker/compose.local-uat.yaml:32`); the baseline emits `uatAdmitted:false` (`scripts/local-uat-baseline.mjs:727`). The pending plan at `:2987,2995` still requires hardened approval UAT, a new candidate/baseline, evidence policy, and named actors. Its historical cohort counts were not rerun.
6. **Browser evidence is incomplete.** Production-authenticated config covers auth/setup/bounded worklist (`apps/web/production-authenticated.playwright.config.ts:28`). Responsive inventory tests largely open forms using demo auth; source-text assertions do not prove blind data is absent from HTML/RSC/network/export. No full named-role connected physical-control journey was executed here.
7. **Ledger consistency is not theft detection.** Dashboard reconciliation explicitly compares cache and ledger (`dashboard.ts:783-786`); count variance remains disabled (`:688`). Posted losses can remain internally consistent. Review source documents, physical observations, repeat patterns, evidence, and counterparties independently. Ordinary consumption is not fully covered by the pilot; never classify all unexplained variance as theft or hide normal consumption in adjustments.

## Safeguards positively identified

- Production/staging reject demo authentication; sensitive stock actions revalidate live session, role/scope, and MFA inside transactions.
- Approval routing excludes source actors and checks eligible scope. Separate approval and posting are retained.
- Ordered inventory-location locks, count-freeze checks, source-state serialization, deterministic posting/reversal keys, immutable movements, and database-maintained nonnegative balances are present.
- Receiving/transfer reversals preserve source lineage; opening stock has a database-enforced cutover fence.
- Controlled evidence, for supported sources, validates exact clean, available immutable versions and scope. Transfer receipt routes check Origin and document identity.

These are code-review observations, not substitutes for exact-candidate race, authorization, and recovery execution.

## Validation actually performed

| Check | Result |
|---|---|
| Direct execution of extracted current source functions/arithmetic | Four reproductions verified: receiving under-classification; omission of reason evidence input; arbitrary evidence reference satisfaction; opening JSON/decimal precision mismatch. No DB calls. |
| `node scripts/pilot-readiness-profile.test.mjs` | **2/2 passed**. Source/contract coverage only; does not disprove F11. |
| `node scripts/disposable-postgres-lifecycle.test.mjs` | **17/17 passed**. Runner safety contracts only; no database was provisioned. |
| Focused Vitest: inventory, receiving, transfers, wastage, stockCounts, stockCountsWorkflow, reports, dashboard | **Blocked before collection: 8 failed suites, zero tests executed.** Missing Linux Argon2 binding and Windows-generated Prisma query engine. Earlier startup also lacked Linux Rollup. These are environment failures, not asserted product-test failures. |
| Security review's six focused suites | Initial startup blocked by missing Linux Rollup; no tests executed. |
| Database authorization/races, migration execution, browser UAT, hosted restore/rollback | **Not run.** Docker unavailable through this WSL integration; no live DB substituted. |
| Lint/typecheck/build | Not run; no application changes. |

A SHA-256-verified Node 22.20.0 runtime and matching Rollup/esbuild binaries were placed only under `/tmp` to attempt verification without changing repository dependencies. The remaining native/generated-client mismatch was reported rather than altering the working installation or weakening test setup. Temporary reproduction script: `/tmp/ogfi-inventory-audit-repro.cjs`; logs: `/tmp/ogfi-inventory-audit-{unit,profile,lifecycle}.log`.

## Remediation order and decision boundaries

1. **Engineering/Security:** Close F01–F03, preserve evidence policy at submit (F10), and enforce source mutation scope (F09). Prove direct-action denials with real role combinations.
2. **Engineering/Inventory:** Repair supported receipt recovery (F06), decimal cutover (F07), and selected-SKU lot transfer coverage (F08). Do not use database edits as operator recovery.
3. **Operations/Inventory/Accounting with Engineering:** Confirm cost authority/evidence handling and repair repeat evaluation (F04–F05). Complete already-open count recovery/segregation/evidence decisions; no protective flag should be enabled merely to make UAT run.
4. **QA/Release:** Correct admission diagnostics (F11), qualify named-user isolated UAT, and execute the companion checklist on one exact candidate. Retain blocked/not-run status where a surface or prerequisite is unavailable.
5. **Operations/Release:** Consider shadow and operational promotion only after connected UAT, independent physical reconciliation, hosted recovery evidence, and authorized human signoff. No release percentage or majority preference overrides the hard gates.

Alternatives considered: unconditional human UAT now lacks proven admission; waiting for every ERP module expands scope unnecessarily; operational promotion fails current hard gates. The selected recommendation preserves useful bounded testing while withholding acceptance and stock-of-record authority. No new business policy or formal release decision is made by this report.

Enablement impact: before operational admission, update and verify role-based guidance for blind counting, evidence verification, receiving recovery, repeat-loss review, lot transfers, count/recount limitations, and shadow/manual reconciliation. Existing training must not present blocked controls as working acceptance paths.

## Post-audit remediation appendix — DEC-0282 (2026-09-07)

The findings and method above describe the original audit baseline and are preserved. Subsequent user-authorized implementation follows [DEC-0282](../00-governance/decisions/DEC-0282-BOUNDED-INVENTORY-AUDIT-REMEDIATION.md). This appendix is engineering evidence, not named-role UAT or deployment authorization.

Implemented changes target F01/F02/F03/F05/F06/F07/F08/F09/F10: protected quantity read boundaries, complete delivered outcomes, configured loss-reference coverage, all-item repeat evaluation, stale DRAFT receipt cancellation, canonical decimal opening values, draft-pinned lot custody, and live loss-action scope. Targeted engineering verification passed as recorded below; browser UAT and operational admission remain pending. Reference presence does not satisfy controlled-evidence qualification. F04 remains OPEN despite unknown/unverified estimate labels. F11 admission diagnostics are not certified by this remediation.

| Verification | Current evidence/status |
|---|---|
| Receiving serialization PostgreSQL | 1 passed, parent-reported |
| Tracked transfer lifecycle PostgreSQL | 1 passed, parent-reported |
| Append-only database checks | 17 passed, parent-reported |
| Opening seed repeatability | 1 passed, parent-reported |
| Quantity-read PostgreSQL | 3 passed, parent-reported |
| Posting/evidence/race PostgreSQL | 21 passed, parent-reported |
| Create/submit evidence and operational scope PostgreSQL | 3 passed, including the eight-scenario applicable-line creation/submission matrix and both loss-family live VIEW denials |
| Focused source/unit suites | F01 16 passed; movement 129 passed with later 65-case rerun; initial loss 46 passed. Overlapping runs are not additive coverage. |
| Corrected mixed-line reference fallback | Passed in the real PostgreSQL creation/submission matrix; blank header no longer suppresses a valid applicable-line reference |
| Full opening-cutover PostgreSQL | 15 passed, including three fractional products, freeze races, activation, replay and atomic rollback. Initial five failures came from the temporary server using Asia/Singapore; all passed after enforcing the documented UTC database-session contract. Authentication checks were unchanged. |
| Corrected unit regressions | 62 passed (action feedback 17, adjustment 21, quantity guard 16, links 8); overlaps prior runs |
| Final lint, typecheck and corrected regressions | Focused lint passed after unused-local correction; web TypeScript passed after location-binding correction; final boundary suite 53 passed (inventory 33, loss 3, bounded approval review 12, export errors 5). Mixed-line PostgreSQL rerun passed. |
| Named-role browser, desktop/tablet/mobile UAT and physical reconciliation | Not run in this pass |

Operational stock-of-record remains NO-GO. Recount recovery, Count Variance posting, settlement finality, qualified evidence policy and exact candidate/cohort admission retain their existing gates. The companion adversarial UAT checklist remains an execution plan; engineering tests do not mark its user journeys Passed. Dunong updated nine existing help articles, the KB gap register, and the local-build release note for changed cancellation, protected reads, evidence-reference coverage, valuation/repeat context and lot custody; ten release-note links and whitespace checks passed. Training impact is recorded as operator rehearsal priorities; those rehearsals have not been executed.

Verification environment: tests ran against isolated PostgreSQL 17.11 with matching temporary Linux Node/Prisma native tools. The migration ledger verified 154 exact migrations and rejected checksum drift. No production database was used. Deployment admission must independently verify UTC for runtime/broker/executor sessions; existing bootstrap does not itself prove that setting. Final successful workflow database suites total 44 cases (receiving 1, tracked transfer 1, quantity reads 3, loss creation/submission/scope 3, loss posting/races 21, opening 15), plus 17 append-only history cases and seed repeatability. Unit runs overlap and are not added together.

Cleanup verified: no databases remained beyond postgres/template0/template1; the temporary PostgreSQL server was stopped after verification. Production data and configuration were not changed.
