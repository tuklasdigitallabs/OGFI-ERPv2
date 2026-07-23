# DEC-0071 — Food Cost Overview and Notification Suppression

## Metadata

- Decision ID: `DEC-0071`
- Title: Food Cost Overview and Notification Suppression
- Status: `Confirmed and implemented — external production gates pending`
- Date: 2026-07-23
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Shared Production Foundation, Phase I Overview, and Phase II Food Cost notifications
- Related decision brief: Parent-confirmed Food Cost trust-boundary deliberation, 2026-07-23; governed by open `DEC-0062`

## Decision

While `DEC-0062` remains open, the Overview must not call the Food Cost analytical service or publish any Food Cost metric, exception count, candidate, unavailable-source state, source-health state, or data-availability claim derived from that analysis. It may retain an authorized, neutral navigation entry to the authoritative `/recipes/analysis` workspace, but that entry must carry no availability badge or implied analytical result.

New `FOOD_COST_EXCEPTION` collection and emission must stop, including recipe-only scan eligibility. Existing Food Cost notification rows remain immutable and listable under their existing authorization boundary, with a non-mutating legacy-definition warning; this decision does not delete, rewrite, resolve, suppress from history, or reclassify them.

## Context

Open `DEC-0062` records three unresolved correctness problems in the current Food Cost analytical result: its default business date can mix evidence from different dates, missing inventory-movement valuation can be represented as trusted zero, and `AWAITING_ACTUALS` does not yet match the approved reporting meaning. An Overview call to that analytical result propagates these defects into summary metrics, exception candidates, trust/source-health copy, and inferred availability. Emitting notifications from the same result then turns an unconfirmed reporting definition into durable operational work.

The dedicated `/recipes/analysis` workspace remains the authoritative source-level surface and retains its own trust notices. Removing Overview-derived claims therefore does not hide or replace the source workspace. Existing notification rows are historical records and must remain available without mutation, even though their former generating definition is no longer approved for new emission.

## Options considered

### Option A — selected: suppress derived Overview results and new notification generation

- Summary: Remove the Overview analytical call and every derived Food Cost metric, exception, candidate, unavailable, source-health, and availability claim; stop new `FOOD_COST_EXCEPTION` collection/emission and recipe-only scan eligibility; preserve historical notifications with a legacy-definition warning; and retain only authorized neutral navigation to `/recipes/analysis`.
- Benefits: Prevents unresolved date, valuation, and status semantics from being presented as trusted operational facts or converted into new durable reminders; preserves immutable history and an authorized route to source evidence; and can be reversed after the analytical contract is corrected and parity-proven.
- Failure modes: Residual code may still invoke analysis, infer availability, or emit reminders; neutral navigation may accidentally retain a badge or trust claim; historical notifications may be hidden, mutated, or mistaken for current-definition alerts; or broad scan eligibility may continue recipe-only Food Cost work.
- Why selected: It is the only option that passes reporting-truth, audit-history, least-claim, reversibility, and production-safety gates while `DEC-0062` remains open.

### Option B — rejected: retain metrics with a warning

- Summary: Continue showing Food Cost values and exceptions on Overview, but label them provisional or untrusted.
- Benefits: Preserves current dashboard visibility and avoids removing summary content.
- Failure modes: Numeric metrics and exception candidates remain actionable-looking even when warned; mixed-date evidence, missing valuation, and incorrect status semantics still produce misleading results; and operators may rely on the number rather than the caveat.
- Why selected or rejected: Rejected because a warning cannot make a knowingly unresolved analytical definition fit for operational summary or notification generation.

### Option C — rejected: replace values with unavailable or placeholder states

- Summary: Keep a Food Cost Overview card or source-health row but display unavailable, not connected, pending, or similar placeholder copy.
- Benefits: Maintains a stable dashboard layout and signals that Food Cost exists elsewhere.
- Failure modes: An unavailable or source-health claim is itself derived state and may falsely imply a connectivity or data-presence conclusion; it can be mistaken for a current analytical assessment; and a badge still gives the suppressed source special status on Overview.
- Why selected or rejected: Rejected because the safe posture is absence of analytical claims, not a different unsupported claim. Neutral authorized navigation is sufficient.

### Option D / defer — rejected: leave current behavior unchanged until `DEC-0062` closes

- Summary: Postpone all changes and continue the current Overview call and reminder generation.
- Benefits: Avoids immediate implementation and preserves existing behavior.
- Failure modes: Known definition defects continue to publish potentially misleading metrics and create new durable notifications, increasing remediation and user-trust risk.
- Why selected or rejected: Rejected because deferral does not preserve reporting truth or prevent new incorrect operational artifacts.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** The retained source-workspace link grants no scope and must render only when the current session is authorized for the destination. `/recipes/analysis` continues to enforce its own current tenant, company, selected-location, and permission boundaries.
- **Server-enforced authorization:** Removing the Overview call and scan eligibility cannot broaden access. Post-implementation security review found that historical notification list/count/read/archive had enforced tenant plus recipient but not the selected company/current scope. The accepted remediation applies one live exact-company and null-or-selected-location predicate plus an active effective company-or-location assignment to all four operations; company-less rows and forged or revoked contexts fail closed. Direct analytical navigation continues to reauthorize independently; link visibility alone is never authority.
- **Approval and segregation:** No approval route, financial authority, inventory authority, or segregation rule changes. The suppression prevents unresolved derived information from being treated as operational work.
- **Immutable inventory ledger and audit trail:** No source sales, recipe, valuation, inventory movement, or notification-history row may be edited or deleted by this change. Historical notification records remain listable and unchanged.
- **Transactional consistency and idempotency:** Stopping new Food Cost collection prevents the scan from creating new reminder candidates under an unconfirmed definition. Existing notification idempotency keys and rows remain intact; no migration, replay, or compensating mutation is authorized.
- **Phase scope and recovery:** The change is limited to Overview-derived Food Cost claims and Food Cost notification generation. It does not remove the Phase II analytical workspace or alter its source records. Reactivation is a controlled code/configuration change only after the stated evidence gates pass.

## Required safeguards

- Remove the Food Cost analytical call from Overview assembly, not merely its rendered cards. Overview must not fetch or retain an unused Food Cost result.
- Remove all derived Food Cost Overview metrics, exception counts, candidate rows, unavailable-source entries, source-health entries, trust summaries, and availability indicators.
- If authorized navigation to `/recipes/analysis` remains, present it as a neutral source-workspace link only. Do not show a live, unavailable, connected, pending, import-source, data-availability, count, tone, or badge claim.
- Stop new `FOOD_COST_EXCEPTION` collection and emission. Remove Food Cost analysis from notification scan inputs and ensure recipes alone cannot make a restaurant-operations notification scan eligible.
- Do not delete, update, resolve, reclassify, or hide existing `FOOD_COST_EXCEPTION` rows. Keep them listable under current scope and permission rules and display a non-mutating warning that they were generated using a legacy definition that is not used for new reminders.
- Ensure the legacy warning does not imply that a historical reminder is currently valid, invalid, resolved, or recalculated. The source row and its original timestamps, severity, deep link, source key, and audit history remain unchanged.
- Keep `/recipes/analysis` authoritative and preserve its existing source/trust notices, current authorization, scoped filters, exports, and direct behavior. This decision does not certify its analytical definitions as corrected.
- Reactivation requires a confirmed exact business-date contract that prevents posted sales/import and ledger evidence from mixing dates.
- Reactivation requires missing or incomplete valuation to remain explicitly pending or `null`, never coerced to trusted zero.
- Reactivation requires corrected and approved status semantics, including the meaning and label formerly represented by `AWAITING_ACTUALS`.
- Before reactivation, prove bounded-query behavior and exact parity across analytical source results, Overview metrics/candidates, notification eligibility/emission, filters, and any related export or availability claim.
- Test absence of Overview analytical calls and derived identifiers, neutral authorized navigation without a badge, no scan collection/emission, recipe-only scan ineligibility, immutable/listable historical notifications, warning copy, scope/permission denial, and unchanged source-workspace access.

## Implementation and documentation impact

- Code / architecture: Remove Food Cost analysis from the Overview source bundle and projection. Remove it from restaurant-operations notification collection and scan-eligibility logic while leaving the authoritative recipe-analysis service and route intact.
- Data / schema: No schema, migration, backfill, deletion, reclassification, or notification-row update is authorized.
- Workflow / permissions: No permission or workflow-state change. Existing notification and recipe-analysis authorization remains authoritative. New Food Cost reminder creation stops.
- UI / mobile: Remove every Food Cost analytical summary, exception/candidate, unavailable, source-health, and availability surface from Overview at all responsive widths. Retain only an authorized neutral link if implemented. Historical notification lists show a non-mutating legacy-definition warning.
- Reporting: `DEC-0062` remains open. The source analysis is not promoted to an Overview reporting definition, and this decision makes no claim that its metrics are production-correct.
- Knowledge base / training: **Dunong handoff required after verified implementation.** User-facing guidance and release notes must explain that Overview no longer summarizes Food Cost or creates new Food Cost exception reminders, the analytical workspace remains available to authorized users with its trust notices, and old reminder rows remain historical and unchanged.
- Tests / UAT: Focused dashboard, notification scan, authorization, historical-list, warning-state, and responsive-surface tests must cover every safeguard. Authenticated-browser and hosted verification remain production-readiness gates.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Remove the Overview analytical call and every derived Food Cost claim; retain only authorized neutral navigation without an availability badge | Backend + Frontend Engineering | Before the checkpoint is enabled | Implemented and unit-verified |
| Stop new Food Cost notification collection/emission and recipe-only scan eligibility while preserving historical rows unchanged | Backend Engineering | Before the checkpoint is enabled | Implemented; PostgreSQL execution pending |
| Add the non-mutating legacy-definition warning to historical Food Cost notification presentation | Frontend Engineering | Before the checkpoint is enabled | Implemented and unit-verified |
| Independently verify absence of derived claims/emission, authorization boundaries, historical immutability/listability, and source-workspace continuity | Reporting + Workflow + Security + QA | Before checkpoint completion | QA GO and Security GO; no Critical/High finding |
| Confirm exact business date, null/pending valuation, and corrected status semantics under `DEC-0062` | Product + Reporting + Inventory Governance | Before any reactivation | Open under `DEC-0062` |
| Prove bounded and parity-tested analytical, Overview, notification, filter, and export behavior | Database + Reporting + QA | Before any reactivation | Pending corrected definition |
| Verify responsive navigation/warnings and hosted deployment, rollback, observability, backup, and recovery behavior | QA + DevOps + Release | Before production release | Pending browser and hosted gates |
| Assess user help, release-note, and training impact | Dunong | After verified implementation | Knowledge base, glossary, and release note aligned; no training workflow change |

Post-implementation evidence now satisfies the source implementation and documentation actions above. The disposable-PostgreSQL and authenticated-browser rows remain pending execution and are not represented as completed production gates.

## Evidence

- Parent-confirmed conclusion, 2026-07-23: while `DEC-0062` is open, remove the Food Cost analytical call and all derived Overview data, unavailable, and source-health claims; stop new `FOOD_COST_EXCEPTION` collection/emission and recipe-only scan eligibility; preserve historical notification rows immutable and listable with a non-mutating legacy-definition warning; retain only authorized neutral navigation to `/recipes/analysis` with no availability badge; and require corrected date, valuation, status, boundedness, and parity evidence before reactivation.
- Independent reporting, workflow, and UX first-round analyses and challenge review unanimously supported suppression. The council identified warned metrics, placeholders, and deferral as unable to resolve the reporting-truth or durable-notification risk.
- Requested Code Spark and exact GPT-5.4/GPT-5.4-mini models were unavailable in the active toolset. The Decision Chair used the closest permitted GPT-5.6 reporting, workflow, and UX role specialists. This fallback did not relax any hard gate, safeguard, or evidence requirement.
- `docs/core/00-governance/OPEN_DECISIONS_AND_ASSUMPTIONS.md`: `DEC-0062` records the mixed default-date evidence, missing valuation represented as zero, and `AWAITING_ACTUALS` semantic mismatch; its safe fallback is no Overview Food Cost summary.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md`: Workspace 1 remains in progress and identifies Food Cost source correction as an open production-readiness gate.
- `apps/web/src/server/services/dashboard.ts`: Overview no longer reads or derives Food Cost analytical signals.
- `apps/web/src/server/services/restaurantOpsNotifications.ts`: Restaurant Operations scans no longer collect or emit new Food Cost reminders.
- `apps/web/src/app/(app)/dashboard/page.tsx`: authorized users retain only neutral `/recipes/analysis` source navigation.
- Post-implementation independent QA and Security review, 2026-07-23: initial review rejected source-text-only notification evidence and the pre-existing tenant-only notification history boundary. Remediation added the live company/location visibility predicate and an executable PostgreSQL matrix for cross-scope denial, legacy-row immutability, and authorized idempotent non-Food-Cost scans. Final QA and Security re-reviews returned GO with no remaining Critical/High finding. The complete non-database suite passed 1,216 tests, the authorization manifest passed 20/20, and typecheck and lint passed. Local PostgreSQL execution remains pending because `DISPOSABLE_DATABASE_ADMIN_URL` is unavailable; the latest production-build rerun stalled during Next.js compilation and was terminated without a pass/fail result, while the preceding checkpoint build had passed.
- `AGENTS.md` sections 4-10 and 13: scope isolation, server authorization, immutable records, reporting integrity, visible-surface completion, testing, documentation, and decision hard gates.

## Pending production-readiness evidence

This record confirms the suppression contract; it does not prove the implementation, Workspace 1, or Phase II production-ready. Keep these gates open until evidence is accepted:

- disposable-PostgreSQL execution of the implemented proof that Overview makes no Food Cost analytical call or derived claim, new scans cannot collect or emit `FOOD_COST_EXCEPTION`, recipes alone cannot trigger scanning, and historical Food Cost notifications remain unchanged and listable with accurate warning copy;
- authenticated responsive-browser proof that Overview has no residual metric, candidate, unavailable, source-health, or availability badge; authorized neutral source navigation works; denied users receive no link or data; and historical notifications render safely at desktop, tablet, and mobile widths;
- hosted deployment, rollback, observability, audit-history, backup, and recovery verification; and
- before any reactivation, confirmed `DEC-0062` definitions plus representative PostgreSQL boundedness and source-to-Overview-to-notification parity evidence.

## Supersession

This decision is not superseded. It establishes the safe suppression posture while `DEC-0062` remains open. It does not resolve `DEC-0062`, remove `/recipes/analysis`, alter source sales/recipe/inventory data, or change historical notification facts. Any restoration of Overview Food Cost data, availability/source-health claims, or new Food Cost reminder generation requires a confirmed decision based on the exact business-date contract, pending/null valuation semantics, corrected status meaning, and accepted bounded/parity evidence.
