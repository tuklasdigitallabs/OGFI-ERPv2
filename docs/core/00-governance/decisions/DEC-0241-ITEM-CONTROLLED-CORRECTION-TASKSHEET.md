# DEC-0241 — Item controlled correction TaskSheet

## Metadata

- Decision ID: `DEC-0241`
- Title: Restrict selected-Item maintenance to concurrency-safe non-material correction
- Status: `Confirmed — implemented locally; external production evidence open`
- Date: 2026-07-26
- Decision owner: Phase I Master Data
- Decision Chair: Parent agent
- Related phase/module: Phase I Master Data / Item Master
- Related decisions: `DEC-0143`, `DEC-0239`, `DEC-0240`

## Decision

Replace the selected existing-Item inline action block with a URL-selected,
workspace-sized TaskSheet. An `ACTIVE` Item permits only an Item Name correction,
with a required reason. Item code, Category, item type, base/purchase/issue UOM,
inventory tracking, expiry tracking, lot tracking, receiving inspection, and
lifecycle state are read-only. The service rejects any forged difference in those
material fields with `ITEM_MATERIAL_CHANGE_REQUIRES_REVIEW`.

The correction action asserts trusted origin, authorizes the selected company,
locks the exact tenant/company-scoped Item row, requires `ACTIVE`, and compares the
submitted `expectedUpdatedAt` value under that lock. A stale writer fails with
`ITEM_UPDATE_CONFLICT`; a no-op fails with `ITEM_CORRECTION_NO_CHANGE`. A successful
name correction and its reason-bearing audit event commit atomically. Rejected
attempts change neither Item nor audit history.

Inactive or otherwise non-active Items are intentional read-only history. Direct
Item deactivation now fails closed with
`ITEM_DEACTIVATION_GOVERNANCE_REQUIRED`. The active Item sheet displays a disabled
`Deactivate Item` control and explains that a real governed flow still needs
Warehouse/Purchasing review, on-hand-stock and open procurement/inventory
transaction checks, and a replacement plan where applicable. The screen does not
record or imply a deactivation request.

The sheet links to the exact Item filter in Admin Audit. A malformed, missing, or
cross-company selected identifier renders a generic unavailable state without
disclosing record facts. Closing restores the bounded register context by removing
only the selected Item identifier.

## Context

`DEC-0143` introduced a selected-Item action composer, but the visible edit form
allowed material master-data changes and direct deactivation even though the
authoritative governance sources require owner approval/impact review for material
Item changes and controlled review before deactivation. The existing service also
accepted updates to inactive Items and had no optimistic version check between
editors.

This decision closes the locally implementable safe-maintenance slice without
inventing the missing approval/deactivation workflow. It deliberately narrows
current write authority to the documented steward-edit case for a typo or other
non-material description correction. Material changes, deactivation, and
reactivation remain unavailable until their governed workflows and controls are
implemented and separately reviewed.

## Options considered and deliberation outcome

### Option A — selected: name-only correction and fail-closed lifecycle controls

- Why it works: matches the existing non-material correction rule, preserves audit
  history, prevents stale overwrites, and gives users a truthful focused detail
  surface without inventing an approval request.
- Likely failure modes: a forged hidden field could widen the correction; two
  editors could overwrite each other; an inactive record could be changed; a
  disabled lifecycle action could appear to submit a request; a foreign identifier
  could disclose Item facts.
- Safeguards: server comparison of every governed field, scoped row lock plus
  `expectedUpdatedAt` compare-and-swap, active-state check, trusted-origin action,
  generic unavailable state, explicit read-only copy, and no callable
  browser-reachable deactivation form.

### Option B — rejected: keep material Item editing in the selected composer

- Benefit: preserves broader maintenance capability.
- Failure modes: Category, UOM, type, and tracking changes bypass the documented
  owner-approval and impact-review control; concurrent edits can silently replace
  another steward's update.
- Reason rejected: it violates a governance hard gate. A real material-change
  workflow must be designed and authorized before those fields become writable.

### Option C — rejected: retain direct Item deactivation with a reason

- Benefit: preserves the previous one-step lifecycle action.
- Failure modes: deactivation can occur without Warehouse/Purchasing review,
  on-hand-stock and open-transaction checks, or a replacement plan; a reason alone
  is not the documented control.
- Reason rejected: lifecycle integrity and operational continuity cannot be
  inferred from a free-text reason. The boundary must fail closed until the
  governed flow exists.

### Option D — rejected: hide the incomplete lifecycle capability

- Benefit: produces a smaller sheet.
- Failure modes: users cannot distinguish a permission denial from a missing
  governed workflow and may assume deactivation occurs elsewhere.
- Reason rejected: the visible-surface gate requires an intentional disabled state
  with a truthful reason and authoritative next step.

Product, Security, and UX independently reviewed the selected-Item surface. The
challenge round accepted the focused TaskSheet only after material edits and direct
deactivation were treated as blocking governance gaps. Requested Code Spark and
exact GPT-5.4 models were unavailable; the closest permitted GPT-5.6 role
fallbacks were used without relaxing any hard gate.

## Hard-gate assessment

- Tenant/company isolation: detail and correction resolution use the authenticated
  tenant and selected company; missing and foreign records share a generic result.
- Server authorization: the existing Core Administration plus selected-company
  management check remains authoritative; the UI grants no write authority.
- Request integrity: the Server Action asserts trusted origin and validates the
  submitted correction, reason, identifier, and version token.
- Concurrency and data integrity: the exact Item row is locked before active-state,
  version, no-op, and material-field checks. Only the name can be written.
- Audit: the name change and reason-bearing audit event are atomic. Every rejection
  leaves both source and audit state unchanged.
- Lifecycle safety: direct Item deactivation fails closed; no deactivation request,
  state transition, or implied approval is created.
- Inventory safety: the decision posts no movement and cannot alter UOM or tracking
  controls. Existing inventory history is not rewritten.
- Recovery: no schema, migration, backfill, public API, permission, or inventory
  posting change. The UI is reversible without rewriting master data.
- Phase discipline: no approval builder, purchasing workflow, report, export, or
  new lifecycle state is introduced.

## Required safeguards and tests

- Keep Item Name as the only writable business field; require a correction reason.
- Compare all submitted Category, UOM, type, and operational-control values with
  the locked row and reject every material difference.
- Require an exact `ACTIVE` tenant/company Item and matching `expectedUpdatedAt`
  value under `FOR UPDATE`; reject no-op, stale, inactive, missing, and foreign
  attempts before mutation or audit.
- Keep direct Item deactivation fail-closed after input and authorization checks.
- Preserve filter/search/page context on open and close, dirty-draft protection,
  in-sheet success/error feedback, focus recovery, 44-pixel-minimum actions, and a
  generic unavailable selected-record state.
- Show governed fields as read-only and the incomplete deactivation control as
  disabled with its explanation connected through `aria-describedby`.
- Link to the authoritative exact Item view in Admin Audit; do not embed or
  duplicate audit data in the TaskSheet.
- Validate focused source/component behavior, full non-database regression,
  typecheck, lint, build, authorization manifest, secrets, and diff hygiene. Run
  the authored disposable-PostgreSQL correction matrix and authenticated responsive
  browser specification when their required environment is available.

## Implementation and documentation impact

- UI: the selected Item opens in a workspace TaskSheet. Active Items expose only
  name correction; non-active Items are read-only; deactivation is explicitly
  unavailable; unavailable selections disclose no record facts.
- Service / authorization: Item correction adds exact scoped row locking,
  active/version/no-op checks, material-field rejection, and trusted-origin action
  handling. Direct Item deactivation fails closed.
- Data / schema: no schema, migration, field, backfill, or historical-row change.
- Workflow / permissions: no new approval route, role, permission, deactivation
  request, or reactivation capability. Missing governed workflows remain open.
- Inventory / reporting / exports: no movement, balance, metric, report, or export
  change.
- Glossary: user enablement adds `Non-material Item name correction` as a reusable
  label for this deliberately narrow audited action; it does not create a new
  lifecycle status, role, or source-of-truth concept.
- Knowledge base / training: visible behavior changed and requires Dunong's
  separate Item Master help, release-note, and training assessment.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and locally validate the selected Item TaskSheet and correction boundary | Engineering / QA | Current checkpoint | Complete locally; final gate record owned by parent |
| Align decision index, Master Data spec, governance note, and pending plan | Mithi | Current checkpoint | Complete |
| Document the user-visible correction and disabled lifecycle behavior | Dunong | Before release | Required handoff |
| Design and approve material Item-change governance | Product / Purchasing / Warehouse / Finance / Security | Before material fields become writable | Open policy/workflow gate |
| Implement governed Item deactivation review, dependency checks, and replacement-plan handling | Product / Engineering / QA | Before deactivation becomes available | Open blocking workflow gate |
| Execute the disposable-PostgreSQL correction and parent-lifecycle matrices | Database / QA | Before Master Data production readiness | Authored; execution open |
| Verify authenticated responsive browser, hosted recovery/deployment, and UAT | QA / Release / business owner | Before workspace completion | Open |

## Evidence

- The selected Item route renders a focused TaskSheet with bounded-context return,
  active name correction, required reason, governed read-only fields, disabled
  deactivation explanation, exact Admin Audit handoff, non-active history state,
  and generic unavailable state.
- The correction service locks the exact scoped Item, enforces `ACTIVE`, compares
  `expectedUpdatedAt`, rejects no-op and all governed-field differences, writes only
  `itemName`, and creates the reason-bearing audit event in the same transaction.
  The exported direct-deactivation boundary validates identity/authority and then
  fails closed without Item or audit mutation.
- Focused source/component tests cover trusted origin, version/active/no-op/material
  guards, name-only persistence, disabled lifecycle copy, audit handoff, draft
  protection, and context recovery.
- A disposable-PostgreSQL specification exists with 14 cases: one concurrent
  two-writer compare-and-swap race, stale version, inactive Item, foreign-company
  concealment, direct-deactivation fail-closed behavior, and nine material-field
  forgery cases. It is registered but has no execution credit: the runner fails
  closed before database creation with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`.
- The existing authenticated milestone browser specification is updated to open
  the selected Item TaskSheet and assert the disabled deactivation state and its
  no-request explanation. It is authored only and has no execution credit because
  the disposable authenticated environment is unavailable behind the same
  required database sentinel.
- A focused Playwright specification contributes nine selected-Item scenarios
  across desktop and mobile projects (18 discovered cases): open/close context,
  dirty close, pending duplicate suppression, action-backed success, terminal
  conflict recovery, audit new-tab draft retention, inactive/archived history,
  unavailable selection, and mobile overflow. It is authored but unexecuted.
- Final focused Item coverage passes 20/20. The complete non-database web suite
  passes 1,434 tests with 305 skipped and one existing TODO across 130 passed/11
  skipped files. Web typecheck/lint, E2E typecheck, production build, the
  regenerated 20/20 authorization manifest, secret review, and diff hygiene pass.
  Final Product, Security, and UX reviews each return **GO** C0/H0/M0/L0 for this
  bounded local source checkpoint.
- Responsive-browser execution, hosted deployment/recovery evidence, and UAT remain
  open. Master Data, Workspace 3, and Phase I remain incomplete and **NO-GO** for
  production completion.

## Supersession

This decision supersedes `DEC-0143` only for selected existing-Item edit and
deactivation behavior. `DEC-0143` remains authoritative for the selected-record URL
pattern and historical base-UOM guard. `DEC-0239` remains authoritative for Item
creation versus parent deactivation; material Item edits are no longer exposed by
the current correction boundary.
