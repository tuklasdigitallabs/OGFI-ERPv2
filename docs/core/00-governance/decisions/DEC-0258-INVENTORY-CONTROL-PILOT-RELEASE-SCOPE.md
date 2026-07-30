# DEC-0258 — Inventory Control Pilot Release Scope

## Metadata

- Decision ID: `DEC-0258`
- Title: Inventory Control Pilot Release Scope
- Status: `Confirmed`
- Date: 2026-07-30
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I procurement, receiving, and inventory control pilot
- Related decisions: `DEC-0036`, `DEC-0040`, `DEC-0041`, `DEC-0044`, `DEC-0049`, `DEC-0068`, `DEC-0098`, `DEC-0099`, `DEC-0188`, `DEC-0248`, `DEC-0252`, `DEC-0257`
- Related decision brief: Parent-led Inventory Control Pilot release-scope deliberation following the user's explicit release-priority shift

## Decision

Select **Option B: a bounded, connected Inventory Control Pilot** covering one
warehouse, one or two branches, and a deliberately selected set of high-risk
SKUs. Run test-data and shadow UAT first; the pilot may become the operational
stock system of record only after every release hard gate in this record passes
and the authorized business and release owners sign off.

The pilot is a controlled Phase I release, not a claim that the broad ERP or all
of Phase I is production-ready. A release-scope/profile indicator may classify
which modules are in the Inventory Pilot, but it must not hide deferred modules
from navigation. Existing server authorization remains authoritative, and pilot
roles receive only the exact approved company, brand, location, role, and data
scope; pilot enrollment grants no new authority in deferred modules.

## Context

The user's priority shifted from continuing the broad implementation sequence to
proving the restaurant inventory-control chain in a small operational scope.
An isolated stock-count or read-only demonstration would not prove the connected
controls that determine whether stock entered, moved, left, or was corrected
legitimately. Deploying the broad application as-is would fail to distinguish
pilot-ready workflows from deferred or preview surfaces and would lack the
required inventory release gates. Waiting for every current Phase I surface to be
finished would delay the narrower control outcome without reducing pilot risk.

The connected pilot therefore includes the minimum upstream and downstream
functions needed to establish trustworthy inventory lineage: identity and scope,
master data, controlled procurement, receiving, ledger posting, transfers,
counts and recounts, wastage, adjustments, reversals, evidence, audit, exception
reporting, and deployment recovery.

An inventory variance is an investigation signal, never proof of theft or
misconduct. The pilot has no recipe, POS, theoretical-consumption, or sales-
depletion source, so it must not create or infer POS/recipe consumption movements
or characterize an unexplained variance as theft.

Independent Dalisay, Hiraya, Lualhati, and Tala reviews unanimously supported
Option B with the hard gates and safeguards below. The requested
GPT-5.3-Codex-Spark and GPT-5.4 models were unavailable; the parent used GPT-5.6
role fallbacks for the independent reviews without changing the council roles,
authority, evidence standard, or hard gates.

## Options considered

### Option A — rejected: finish the full Phase I/current broad plan before any pilot

- **Summary:** Continue the current broad implementation plan and wait until all
  planned Phase I surfaces are complete before conducting an operational pilot.
- **Benefits:** Avoids maintaining a separate pilot-scope classification and could
  eventually present a broader production-ready feature set to users.
- **Failure modes:** Delays proof of the highest-priority inventory controls,
  expands the regression and adoption surface, and makes pilot failures harder
  to isolate.
- **Why rejected:** The user explicitly prioritized bounded inventory-control
  proof. A smaller connected slice can produce that evidence while retaining all
  applicable production controls.

### Option B — selected: bounded, connected Inventory Control Pilot

- **Summary:** Pilot the full connected inventory-control chain for one warehouse,
  one or two branches, and selected high-risk SKUs, beginning with test-data and
  shadow UAT and promoting to operational stock-of-record use only after all hard
  gates pass.
- **Benefits:** Tests end-to-end stock lineage, approvals, segregation, scope,
  exception handling, and recovery in a bounded operational population; limits
  blast radius and supports controlled reconciliation and rollback.
- **Failure modes:** Misclassification could present a deferred module as part of
  the Inventory Pilot; pilot enrollment could accidentally broaden authority;
  an incomplete upstream workflow could make stock lineage unreliable; a flawed
  opening cutover could corrupt starting balances; incomplete recount correction
  could hide duplicate or unaudited corrections; or users could treat a variance
  as evidence of misconduct.
- **Why selected:** It is the smallest target that can prove connected restaurant
  inventory control without pretending that the entire application is ready.

### Option C — rejected as the target: stock-count/read-only monitoring pilot

- **Summary:** Pilot stock counts and read-only inventory monitoring without the
  connected purchasing, receiving, transfer, wastage, adjustment, and reversal
  controls.
- **Benefits:** Has a smaller training and technical footprint and is suitable as
  a temporary shadow-data exercise.
- **Failure modes:** Cannot establish how stock entered, moved, or was corrected;
  produces variances without authoritative transaction lineage; and may create
  false confidence in inventory accuracy.
- **Why rejected:** It does not prove the desired operational control. It is
  allowed only as a temporary shadow-UAT step before the connected pilot, never
  as the release target or stock system of record.

### Option D — rejected: deploy the current broad application as-is

- **Summary:** Put the existing broad application into pilot use without truthful
  Inventory Pilot/deferred classification, safe incomplete-action states, or the
  exact production gates in this record.
- **Benefits:** Fastest apparent deployment and retains access to all currently
  visible modules.
- **Failure modes:** Presents deferred or insufficiently verified workflows as
  production-ready, enlarges authorization and data-integrity risk, confuses users
  about which records are authoritative, and lacks an acceptable evidence-based
  GO boundary.
- **Why rejected:** It fails scope, least-privilege, verification, and release-
  recovery gates.

## Pilot boundary

### Included and connected

Only the following operational families and their required shared dependencies
receive Inventory Pilot production-readiness scope and release credit:

1. Shared production authentication, MFA evidence, tenant/company/brand/location
   scope enforcement, least-privilege roles, user/role/scope administration, and
   required audit access.
2. Pilot suppliers, items, categories, UOMs and conversions, warehouse and branch
   locations, and only the selected pilot SKU population.
3. Purchase Request, configured approval, quotation comparison when required,
   Purchase Order approval/issue, receiving, discrepancies, partial receipts,
   outstanding quantities, and authorized receiving reversal.
4. Immutable inventory movements and derived balances; warehouse-to-branch and
   in-scope branch transfer request, approval where required, dispatch, receipt,
   discrepancy handling, and supported reversal/settlement behavior.
5. Blind stock counts, movement freeze where configured, review, recount,
   correction lineage, and a single count-generated Stock Adjustment path with
   duplicate prevention and no direct count movement.
6. Wastage and manual Stock Adjustment submission, configured approval, separate
   posting, linked reversal, reasons, evidence, and full audit history.
7. Scoped inventory, discrepancy, variance, exception, ledger, and audit reports
   needed to operate and reconcile the pilot; evidence capture and export controls
   remain subject to least privilege.
8. Exact-candidate deployment, observability, backup, restore, rollback, recovery,
   and human release evidence for the hosted pilot.

The Accounting reviewer role remains part of the pilot control path for material
loss, wastage, and stock adjustments where the active configured policy requires
that review. This does not release Accounts Payable, General Ledger, payment,
cash, expense, or any other Finance product workflow.

If production SMTP is unavailable or unqualified, required users must use the
in-application queues plus a documented manual review/reminder cadence. Missing
email delivery must not bypass an approval, evidence requirement, exception
review, or release blocker.

### Deferred but visible

Phase 1.5 Projects & Implementation Tracker, Expansion, Marketing, Workforce,
broad Restaurant Operations, Finance product workflows, recipe/menu-costing, and
POS integration remain visible in navigation. Each must be truthfully labeled
`Deferred`, `Preview`, or `Not in Inventory Pilot`, as appropriate to its current
state. A release-scope/profile indicator may support this classification but must
not remove these destinations from navigation.

This decision assigns no current delivery effort and no pilot production-ready
credit to those surfaces. It does not authorize new pilot-role permissions,
broaden existing server access, or require removal of existing safe working
actions. Existing safe working actions may remain available to users who already
have authority. Unsafe or incomplete actions must remain disabled with a clear
reason. Existing server authorization continues to govern direct routes, server
actions, APIs, background actions, and exports.

No deferred module may be described as implemented, complete, or pilot-ready
merely because it is visible, contains safe working actions, or has a shared
implementation foundation.

## Hard-gate assessment

The pilot remains **test-data/shadow UAT only** and must not become the operational
stock system of record until all of the following gates pass for the exact
release candidate:

1. **Production identity:** Every human uses a unique production identity; shared
   logins are prohibited. Production authentication and required MFA evidence are
   active, and session/revocation controls pass.
2. **Pilot classification, authority, and scope isolation:** Inventory Pilot
   classification is truthful and does not hide deferred navigation. Existing
   server authorization admits each actor only to their approved
   tenant/company/brand/location scope, one warehouse, one or two branches,
   selected SKUs, and named roles where applicable. Pilot enrollment grants no new
   deferred-module authority. Least privilege and direct URL/API denial for
   unauthorized requests are proven; unsafe or incomplete deferred actions are
   visibly disabled with an explicit reason.
3. **Active pilot-family approvals:** Active configured approval routes resolve to
   named eligible approvers for PR, quotation recommendation where required, PO,
   transfers/count review where required, wastage, material loss, and Stock
   Adjustment. Self-approval and prohibited actor combinations are denied.
4. **Opening inventory cutover:** The authorized inventory and operations owners
   approve a dated opening count and reconciliation. Opening inventory is posted
   through the immutable ledger using the approved cutover procedure, reconciles
   to derived balances, and has complete source evidence; no direct balance write
   is permitted.
5. **Count/recount correction lineage:** Count attempts and recounts remain
   immutable and traceable, the authoritative attempt is unambiguous, corrections
   preserve lineage, and count-generated adjustment creation is single-use and
   idempotent. `P1-UAT-011` must not be claimed complete until this behavior is
   implemented and its required evidence passes.
6. **Exact-candidate technical evidence:** Authorization, database-backed
   integrity/concurrency/idempotency, and responsive production-artifact browser
   gates pass against the exact candidate. A local run, source-only change,
   different SHA, skipped database suite, or development-server browser result is
   insufficient.
7. **Hosted recovery evidence:** Hosted backup and restore, deployment rollback,
   post-restore reconciliation, post-rollback smoke, and evidence retention pass
   for the pilot environment and exact candidate. A documented stop-posting and
   recovery path is assigned to named owners.
8. **Human UAT and signoff:** Named operational users complete the connected pilot
   scenarios on representative desktop and mobile surfaces. Security/Controls,
   Purchasing, Warehouse/Inventory, Operations, QA, and Release owners sign the
   evidence and GO decision with no unresolved blocker or critical defect.

These gates preserve tenant and scope isolation, server authorization,
segregation of duties, immutable ledger and audit history, transactional and
idempotent posting, Phase I scope discipline, and a recoverable release path.
There is no standing waiver for a failed gate.

## Required safeguards

### Immediate manual and shadow-period controls

1. Keep the currently approved manual or legacy inventory record as the stock
   system of record until the production cutover is signed. Clearly label pilot
   test/shadow records as non-authoritative and prevent them from being mixed with
   production opening balances.
2. Freeze and publish the named pilot warehouse, branches, SKUs, users, approvers,
   effective date, and cutover window. Identify included workflows and label other
   visible modules as `Deferred`, `Preview`, or `Not in Inventory Pilot`. Any
   expansion of pilot scope or authority requires a new readiness review and
   explicit approval; it is not an informal configuration change.
3. Use controlled, sequentially identified source documents for receipts,
   transfers, counts/recounts, wastage, and adjustments during shadow testing or
   an outage. Preserve actor, timestamp, reason, quantities, evidence, and reviewer
   identity, then reconcile before resuming authoritative posting.
4. Assign a named Inventory Owner to reconcile source documents, ledger movements,
   and derived balances at least daily during the pilot. Stop affected SKU/location
   posting and investigate any unexplained mismatch before carrying it forward.
5. Require independent count/recount and review for material variances according
   to the active pilot policy. Preserve both attempts and the correction trail;
   never overwrite an attempt to make the result agree.
6. Route material loss, wastage, and adjustments to the configured Accounting or
   other independent reviewer where required. Do not use this review to activate
   deferred Finance workflows.
7. Treat a variance as an investigation queue item. Any fraud, theft, HR, or
   disciplinary conclusion requires separate authorized evidence and process
   outside the inventory variance itself.
8. When SMTP is unavailable, perform and evidence the assigned manual review of
   in-app approval and exception queues. Do not assume silence means completion.
9. During an outage or failed reconciliation, stop authoritative postings in the
   affected scope, preserve numbered source evidence, notify the named control and
   release owners, and follow the approved restore/rollback/reconciliation runbook
   before reopening.

### Implementation and verification constraints

- Keep pilot classification separate from authorization. Classification must not
  hide navigation or create authority; existing server authorization/data-access
  rules continue to protect reads, writes, options/lookups, exports, attachments,
  notifications, scheduled/manual scans, and deep links.
- Preserve existing safe working actions for already-authorized users. Disable
  unsafe or incomplete actions with explicit reasons and do not count them toward
  Inventory Pilot readiness.
- Keep inventory balance derived from posted immutable movements. Receiving,
  transfer dispatch/receipt, count-generated adjustments, wastage, adjustments,
  and reversals must be transactional and retry-safe.
- Preserve ordered, delivered, accepted, rejected, damaged, short, and outstanding
  quantities. Only accepted quantities affect receiving stock.
- Preserve reasons, evidence rules, approval history, posting actors, linked
  reversals, and non-destructive audit history.
- Do not generate consumption movements in the absence of an approved POS/recipe
  integration and do not infer theoretical usage from sales or recipes.
- Use the exact-candidate evidence session for authorization, database, browser,
  deployment, backup/restore, rollback, UAT, and final signoff artifacts.

## Implementation and documentation impact

- **Code / architecture:** A release-scope/profile indicator may classify included
  and deferred modules but must not hide navigation or act as a new permission
  source. Preserve existing server authorization. This record does not authorize
  a broad-module readiness claim or change the modular-monolith architecture.
- **Data / schema:** **No schema decision is made by this record.** Any required
  schema or migration change needs its own review, rollback analysis, and data-
  dictionary update. Opening inventory must use the approved immutable-ledger
  cutover path.
- **Workflow / permissions:** Activate only named pilot users, exact scopes,
  least-privilege roles, and configured pilot-family approval routes. Retain no
  self-approval and independent Accounting review where policy requires it.
- **UI / mobile:** Keep deferred modules visible and label them `Deferred`,
  `Preview`, or `Not in Inventory Pilot`. Existing safe working actions need not
  be removed; unsafe or incomplete actions remain disabled with explicit reasons.
  Included pilot surfaces must show scope, status, next action, and audit context.
  Validate branch and warehouse task paths on desktop, tablet, and mobile. No
  visible deferred surface receives an implementation or readiness claim from
  this record.
- **Reporting:** Limit reports and exports to scoped operational reconciliation,
  exception, ledger, variance, and audit needs. Variance reporting must state that
  it is an investigation signal and must not label theft or inferred consumption.
- **Knowledge base / training:** Dunong must prepare or update role-based pilot
  procedures, shadow-versus-stock-of-record guidance, outage/manual fallback,
  count/recount correction, variance interpretation, and known deferred-module
  limitations before operational cutover. This record does not change the
  knowledge base or training materials itself.
- **Tests / UAT:** Run the exact-candidate authorization, database, responsive
  browser, recovery, and complete connected Phase I pilot scenarios. Human
  signoff is mandatory. `P1-UAT-011` remains pending until correction lineage and
  duplicate-prevention evidence are complete.
- **Planning:** This decision changes release priority and release boundary only.
  It does not itself rewrite the implementation plan; the parent owner must
  schedule the confirmed scope without representing deferred work as complete.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Publish the exact warehouse, one/two branches, SKU list, named users, roles, approvers, and cutover owners. | Product / Operations / Inventory / Security | Before shadow UAT | Pending |
| Implement and verify truthful pilot/deferred module classification without hiding navigation or granting new authority; retain unauthorized direct-route/API/export denial under existing controls. | Engineering / Security / QA | Before production-candidate UAT | Pending |
| Complete count/recount correction lineage and pass `P1-UAT-011` without duplicate or direct count movement. | Engineering / Inventory / QA | Before stock-of-record GO review | Blocking |
| Approve and rehearse opening-count and immutable-ledger cutover reconciliation. | Inventory / Operations / QA | Before stock-of-record cutover | Pending |
| Pass exact-candidate auth, database, responsive browser, hosted backup/restore, rollback, and post-recovery reconciliation gates. | Security / QA / DevOps / Release | Before GO decision | Pending |
| Execute connected shadow UAT and obtain named business, controls, QA, and release signoff. | Operations / Process Owners / QA / Release | Before GO decision | Pending |
| Prepare the required role-based pilot, fallback, variance, and limitation guidance. | Dunong / Process Owners | Before operational cutover | Pending handoff |

## Evidence

- [`AGENTS.md`](../../../../AGENTS.md) — Phase I boundary, core scope,
  procurement/inventory controls, server authorization, immutable ledger, no
  self-approval, documentation authority, and release verification rules.
- [`SUBAGENT_DELIBERATION_PROTOCOL.md`](../SUBAGENT_DELIBERATION_PROTOCOL.md) —
  decision status, independent review, hard gates, and Mithi record requirements.
- [`DECISION_RECORD_TEMPLATE.md`](../DECISION_RECORD_TEMPLATE.md) — required
  decision-record structure.
- [`Phase I README`](../../../phases/phase-01-procurement-inventory/README.md) —
  Phase I in-scope connected controls and readiness rule.
- [`PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md`](../../07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md) —
  pilot scope, named role/scope evidence, opening-stock reconciliation, Phase I
  scenario matrix, human signoff, and known release exceptions.
- [`PHASE1_PHASE1_5_UAT_EXECUTION_SCRIPTS.md`](../../07-quality/PHASE1_PHASE1_5_UAT_EXECUTION_SCRIPTS.md) —
  executable count/recount, count-generated adjustment, wastage, adjustment,
  transfer, receiving, and authorization-denial evidence steps.
- Parent decision brief and unanimous independent Dalisay, Hiraya, Lualhati, and
  Tala reviews; user-confirmed priority shift and parent confirmation on
  2026-07-30. Requested GPT-5.3-Codex-Spark and GPT-5.4 were unavailable, so the
  council used GPT-5.6 role fallbacks without weakening hard gates.

## Supersession

This record sets the release boundary and gates for the bounded Inventory Control
Pilot. It does not supersede existing workflow, authorization, inventory-ledger,
audit, deployment, or recovery decisions. Where a related implementation exists,
that implementation receives pilot release credit only after it is truthfully
classified as included, remains protected by existing server authorization, and
passes the gates in this record.
