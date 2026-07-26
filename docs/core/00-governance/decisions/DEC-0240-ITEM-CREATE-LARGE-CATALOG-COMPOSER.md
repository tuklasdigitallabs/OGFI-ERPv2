# DEC-0240 — Item create large-catalog composer

## Metadata

- Decision ID: `DEC-0240`
- Title: Complete Item creation with a focused large-catalog composer
- Status: `Confirmed — implemented locally; external production evidence open`
- Date: 2026-07-26
- Decision owner: Phase I Master Data
- Decision Chair: Parent agent
- Related phase/module: Phase I Master Data / Item Master
- Related decisions: `DEC-0140`, `DEC-0143`, `DEC-0239`

## Decision

Replace the disabled greater-than-100-option Item creation path with a focused
`Create Item` TaskSheet. Category, base UOM, purchase UOM, and issue UOM each use
an independent, server-paged, searchable active option selector. A selected option
is retained additively when it falls outside the current search page; this does not
expand the ordinary page, preload the catalog, or grant mutation authority.

Required Category and base-UOM selections must resolve to exact active scoped
options before submission. Optional purchase and issue UOMs deliberately support
`None`. Each selector must distinguish loading, lookup failure with retry, no
configured active records, and no search match. The create action remains a trusted-
origin Server Action and the domain service remains authoritative for permission,
tenant/company scope, duplicate code, and active-parent revalidation.

A rejected create keeps the user's draft in the TaskSheet and shows user-safe
inline feedback. When a parent selection has become stale, the catalogs refresh and
the unresolved selection must be made again. A successful create closes and resets
the composer, refreshes the register, and leaves a persistent confirmation naming
the created item. Creating an Item posts no stock movement.

## Context

The earlier bounded option-catalog foundation prevented unbounded page hydration,
but Item creation became unavailable once a Category or UOM catalog exceeded its
bounded inline limit. That was a visible workflow dead end for a core Master Data
action. `DEC-0239` first corrected the harder concurrent parent-lifecycle integrity
race. With that source invariant locally protected, the next dependency-ordered
work was to make Item creation usable without restoring full-catalog reads.

This decision is intentionally limited to creation. The selected existing-Item
edit/deactivation surface, Supplier catalog mobile layout, option-endpoint
operational controls, role-policy reconciliation, and external database/browser/
hosted/UAT evidence remain separate completion gates.

## Options considered and deliberation outcome

### Option A — selected: focused TaskSheet with four independent bounded selectors

- Why it works: removes the large-catalog dead end while preserving bounded reads,
  exact selection context, server ownership, responsive task focus, and the existing
  Item service contract.
- Likely failure modes: shared search or pagination state can change the wrong UOM;
  late responses can overwrite newer results; selected values can disappear during
  filtering; optional selectors can accidentally become assignments; stale parent
  selections can submit; closing or errors can discard a draft; a success toast can
  disappear before the user can verify the created record.
- Safeguards: independent selector state and request cancellation, selected-ID
  retention, explicit `None`, submit readiness checks, truthful empty/error/retry
  states, trusted-origin submission, server revalidation, dirty-close protection,
  inline draft-preserving errors, stale-catalog refresh, and persistent success
  confirmation.

### Option B — rejected: retain the inline form and lift or remove the option cap

- Benefit: smaller interface change.
- Failure modes: restores unbounded reads or merely raises the failure threshold;
  keeps a long operational form embedded in the registry; does not provide
  independent search/page state or reliable selected-option retention.
- Reason rejected: it conflicts with bounded operational-list and focused-task
  requirements and does not close the underlying large-catalog workflow.

### Option C — rejected: keep Item creation disabled when a catalog overflows

- Benefit: preserves the existing bounded query with no new client state.
- Failure modes: an authorized user cannot perform a visible core action in a valid
  high-cardinality company; the workspace remains knowingly incomplete.
- Reason rejected: a visible create action cannot be considered production-ready
  while ordinary catalog growth turns it into a dead end.

First-round Product review selected Option A as a separate bounded checkpoint to
close the greater-than-100 create dead end, with the selected existing-Item
TaskSheet immediately after it. UX also selected Option A first and required Item
creation itself to use a TaskSheet because four asynchronous selectors and the form
length are not suitable for an EntryModal or embedded mobile workflow. Security
selected Option A first and required exact-intent selected retention with no auto-
selection, independent selector state, and unchanged server/`DEC-0239` authority;
it identified the reusable selector as a dependency for the later selected-Item
TaskSheet.

In the challenge round, Product agreed that the create TaskSheet is mandatory but
must not absorb the separate selected existing-Item TaskSheet. UX rated an
EntryModal a Serious-but-manageable failure and the TaskSheet the minimum acceptable
surface. Security rated silent valid-ID substitution **Blocking** unless selector
state, abort/sequence handling, and tests are independent. Trusted-origin handling
was Serious-but-manageable and was added; explicit endpoint observability and
throttling remains an overall production-readiness gate. Requested Code Spark and
exact GPT-5.4 models were unavailable; the closest permitted GPT-5.6 specialist
fallbacks were used without relaxing any hard gate.

## Hard-gate assessment

- Tenant/company isolation: options are returned only through the authenticated,
  selected-company-scoped Item option service; selected-ID retention is additive
  only after the same server scope check.
- Server authorization: the selector grants no authority. The create service still
  enforces the existing Core Administration and selected-company Manage contract.
- Request integrity: the write is a trusted-origin Server Action; malformed or
  stale catalog input fails closed with stable user-safe feedback.
- Data integrity: `DEC-0239` active-parent locks/revalidation and existing duplicate
  Item-code controls remain authoritative inside the create transaction.
- Audit: a successful Item and its audit event remain atomic; rejected submissions
  create neither a partial Item nor a success confirmation.
- Inventory: creating an Item does not post, adjust, reserve, or otherwise move
  inventory.
- Recovery: no schema, migration, backfill, public API, permission, or workflow
  transition changes. The UI slice is reversible without rewriting master data.
- Phase discipline: no purchasing, receiving, supplier, approval, reporting, export,
  or inventory-ledger behavior is added.

## Required safeguards and tests

- Keep Category, base UOM, purchase UOM, and issue UOM query, page, selected value,
  loading, error, and retry state independent.
- Use bounded server pagination, deterministic ordering, active-only ordinary
  results, selected-ID retention, and request cancellation/stale-response rejection.
- Distinguish true catalog-empty from filtered-empty states; provide clear recovery
  guidance, a retry action, and search reset.
- Treat purchase and issue UOM `None` as an explicit valid non-assignment. Never
  infer a UOM from a failed or empty lookup.
- Disable create until required selections resolve to exact active options; continue
  to revalidate all submitted parents and authority on the server.
- Preserve entered fields after a rejected action, refresh parent catalogs after a
  stale-parent error, protect dirty close/cancel, and restore trigger focus.
- Keep success confirmation visible outside the closed TaskSheet and state plainly
  that no stock movement was posted.
- Validate focused component/action/service contracts, full non-database regression,
  typecheck, lint, production build, E2E typecheck, authorization manifest, secret
  review, and diff hygiene. External responsive-browser, disposable-PostgreSQL,
  hosted recovery/deployment, and UAT evidence remain required.

## Implementation and documentation impact

- UI: Item creation now uses a workspace-sized TaskSheet with identity,
  classification, UOM, operational-control, cancel, submit, error, and confirmation
  surfaces.
- Data access: four independent client selectors reuse the bounded scoped Item
  option-catalog endpoint. No unbounded catalog hydration is reintroduced.
- Service / authorization: no domain authority or workflow change; the existing
  server create service and `DEC-0239` lifecycle locks remain authoritative.
- Data / schema: no schema, migration, field, backfill, or historical-row change.
- Reporting / exports: no report, metric, or export change.
- Knowledge base / glossary: the behavior uses existing terms and changes no policy;
  no glossary entry is required. Dunong owns the separate user-facing enablement
  assessment.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement and locally validate the Create Item TaskSheet and selectors | Engineering | Current checkpoint | Complete locally |
| Align decision index, Master Data spec, plan, and release summary | Mithi | Current checkpoint | Complete |
| Re-run and record the complete non-database suite on the final candidate | Parent / QA | Before checkpoint commit | Complete locally |
| Complete selected existing-Item TaskSheet and Supplier catalog mobile layout | Product / UX / Engineering | Before Master Data completion | Open |
| Add explicit option-endpoint observability/throttling evidence | Security / Operations / Engineering | Before production readiness | Open |
| Reconcile the documented role matrix with implemented Item authority | Product / Security / Governance | Before production readiness | Open policy gate |
| Execute high-cardinality/query-plan and `DEC-0239` race evidence in disposable PostgreSQL | Database / QA | Before production readiness | Open |
| Verify authenticated responsive browser, hosted recovery/deployment, and UAT | QA / Release / business owner | Before workspace completion | Open |

## Evidence

- The implemented composer exposes four independent server-paged/searchable
  selectors, selected-option context, required-resolution checks, explicit optional
  `None`, true-empty and filtered-empty states, retry, stale-response cancellation,
  dirty-close protection, draft-retaining inline action errors, stale-parent catalog
  refresh, and persistent named success confirmation.
- The create Server Action asserts trusted origin, maps stable action feedback, and
  delegates source mutation to the existing Item domain service.
- Initial final review remained **NO-GO**: Product found a High selected-edit
  regression caused by selected-only catalogs; Security found a High lack of
  executable behavior coverage; and UX found Medium true-versus-filtered-empty and
  missing-success-confirmation gaps. The candidate corrected those issues. Final
  Product, Security, and UX reviews each return **GO** C0/H0/M0/L0 for this local
  source checkpoint.
- Focused Item coverage passes 17/17. The final complete non-database web suite
  passes 1,431 tests with 305 skipped and one existing TODO across 130 passed/11
  skipped files. Web typecheck/lint, E2E typecheck, production build, the 20/20
  authorization manifest, secret review, and diff hygiene pass.
- Disposable-PostgreSQL high-cardinality/query-plan evidence and the `DEC-0239`
  two-connection races remain unexecuted locally. The PostgreSQL and authenticated
  E2E runners were attempted and failed closed before database creation with
  `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`, so no database or responsive-browser
  execution credit is claimed. Hosted recovery/deployment and UAT gates also remain
  open. Master Data and Phase I remain incomplete and **NO-GO** for production
  completion.

## Supersession

This decision completes the Item-create large-catalog follow-up left open by
`DEC-0140` and `DEC-0239`. It does not supersede their bounded-read or lifecycle-
integrity controls.
