# DEC-0242 — Supplier catalog confidentiality and lifecycle integrity

## Metadata

- Decision ID: `DEC-0242`
- Title: Complete the Supplier Catalog with explicit confidential clearance and serialized lifecycle actions
- Status: `Implemented locally — external production-readiness evidence remains open`
- Date: 2026-07-26
- Decision owner: Phase I Master Data / Supplier Catalog
- Decision Chair: Parent agent
- Related phase/module: Phase I Master Data / Suppliers
- Related decisions: `DEC-0141`, `DEC-0142`, `DEC-0145`, `DEC-0146`,
  `DEC-0181`, `DEC-0182`, `DEC-0183`, `DEC-0189`, `DEC-0190`

## Decision

Introduce `purchasing.supplier_confidential.view` as an explicit sensitive
clearance for Supplier commercial data. It is additional clearance, never
standalone Supplier authority: every read still requires the existing Supplier
workspace authorization and selected tenant/company scope, and every write still
requires existing `core.administer` plus selected-company `MANAGE`. A nonblank
write to `Supplier.paymentTerms` or Supplier Item reference-price/effective
metadata additionally requires the confidential permission. Crafted input from a
caller without that permission fails closed.

Without confidential clearance, Supplier reads omit or redact `paymentTerms` and
the Supplier Catalog's latest reference unit price, currency, and effective-date
metadata at query/projection level. The UI renders an explicit `Restricted` state;
it must not receive a value and merely hide it. The permission is sensitive and is
not a default or recommended grant for `CONFIGURED_ADMIN`. Only the existing
superuser all-permission seed behavior may receive it automatically.

Supplier and Supplier Item link deactivation must lock the exact scoped record,
require `ACTIVE`, and use transactional compare-and-swap so concurrent attempts
produce one lifecycle winner and one audit event. Supplier Item detail/actions must
prove the exact tenant/company/Supplier/link binding. Supplier registry, catalog,
and option reads use deterministic ordering with a stable ID tie-breaker, exact
counts, clamped pages, and bounded page sizes.

Supplier deactivation, accreditation changes, and Supplier Item link creation all
serialize on the same exact scoped Supplier row. A writer that loses to Supplier
deactivation fails without a source, price-history, or audit mutation. Reference-
price effective dates accept only real `YYYY-MM-DD` calendar dates; normalized
dates such as February 31 are rejected.

The Catalog renders the same result set as a desktop table and mobile cards without
horizontal mobile scrolling. URL-backed Supplier section, query/filter, option
page, link page, and selected-action context remain preserved. Create and
deactivation work use focused task modes with 44-pixel-minimum targets; ranges and
true/filtered empty states remain exact and explicit.
Mutation results use trusted Server Action state rather than URL success claims.
Recoverable errors stay inside the task, retain the full bounded tab-scoped draft,
and focus the error. Pending state disables close/cancel/submit and announces
progress; confirmed success is announced, closes the task, and restores a stable
context focus target.

## Context

The Supplier workspace already has bounded registries, a selected Supplier
workspace, paged Catalog options, focused lifecycle actions, and an authoritative
Admin Audit handoff. Production-readiness review found three remaining local hard
gates:

1. payment terms and reference-price history are confidential supplier commercial
   data, but ordinary management authority could read and write them without a
   separate clearance;
2. Supplier and Supplier Item link lifecycle actions could race without an exact
   row lock and active-state claim; and
3. the Catalog's desktop-oriented presentation and ordering/paging details did not
   yet guarantee the same bounded result set on mobile or stable settlement under
   duplicate sort values and out-of-range URLs.

This decision closes those local contracts without changing supplier eligibility,
accreditation policy, Purchase Orders, receiving, inventory, payments, or Finance.
It does not grant any role new Supplier authority by implication.

## Options considered

### Option A — selected: explicit clearance plus query-level redaction and CAS lifecycle

- Summary: add a sensitive Supplier confidential permission, retain ordinary
  Supplier authority as a prerequisite, omit protected values before projection,
  reject unauthorized nonblank writes, serialize lifecycle actions, and complete
  the bounded responsive Catalog contract.
- Benefits: least privilege is explicit and independently revocable; UI and direct
  requests share one server boundary; concurrent deactivation cannot duplicate
  source/audit effects; mobile and desktop represent one authoritative result set.
- Failure modes: a broad select can leak a value before masking; the permission can
  be accidentally recommended to administrators; a hidden field can submit
  confidential content; Supplier/link IDs can be rebound; status checks outside the
  transaction can admit two winners; unstable ordering can duplicate/skip rows.
- Why selected: it is the only option that satisfies confidentiality,
  authorization, transaction, and visible-surface hard gates together.

### Option B — rejected: treat Core Administration and company Manage as confidential clearance

- Summary: retain the current administration boundary for commercial fields.
- Benefits: no new permission or seed/migration work.
- Failure modes: administrative setup authority becomes supplier-commercial access;
  IT or delegated administrators can receive negotiated terms and price history
  contrary to the separate-confidential-control requirement.
- Why rejected: ordinary administration/scope authority is not proof of business
  need for sensitive Supplier terms.

### Option C — rejected: mask values only in browser components

- Summary: return the full Supplier projection and conditionally hide fields.
- Benefits: small presentation-only change.
- Failure modes: protected values remain available to rendering, serialization,
  logs, tests, or crafted clients; write boundaries remain bypassable.
- Why rejected: UI hiding is not authorization and cannot satisfy data-minimization
  requirements.

### Option D — rejected: defer Catalog usability and lifecycle serialization

- Summary: add only the permission and leave lifecycle/paging/mobile gaps open.
- Benefits: smaller immediate implementation.
- Failure modes: duplicate deactivation audit effects and incomplete mobile actions
  remain visible production blockers; a partial checkpoint could be mistaken for
  Workspace 3 completion.
- Why rejected: the confirmed checkpoint is the smallest coherent Supplier Catalog
  boundary that closes its related local confidentiality, integrity, and visible-
  surface risks.

Independent Product/Workflow, Security, Data/Architecture, and UX analysis was
conducted under the deliberation protocol. Requested Code Spark and exact GPT-5.4
models were unavailable; the closest permitted GPT-5.6 role fallbacks were used
without relaxing any hard gate.

## Hard-gate assessment

- Tenant/company isolation: every Supplier, link, item, price, count, and selected
  action remains tenant- and selected-company scoped.
- Server authorization: the confidential permission is additional to existing
  read/manage authority. Nonblank confidential writes are rejected at the server;
  no browser control grants authority.
- Confidentiality: unauthorized projections omit protected values at query/service
  level and return only an explicit restricted state, never a masked copy of the
  value.
- Data integrity: exact scoped Supplier/link row locks and active compare-and-swap
  admit one deactivation winner and one atomic audit event.
- Binding integrity: selected Supplier and link IDs are resolved together; a link
  cannot be acted on through another Supplier or company context.
- Audit: successful deactivation and audit evidence commit together; denied, stale,
  inactive, foreign, or losing attempts create neither source nor audit mutation.
- Phase discipline: no Purchase Order, receiving, inventory movement, supplier
  payment, accreditation rule, or Finance behavior changes.
- Recovery: the permission catalog addition has an explicit migration/rollback
  sequence; Supplier commercial values and lifecycle history are not rewritten.

## Required safeguards

- Define `purchasing.supplier_confidential.view` as sensitive. Do not include it in
  `CONFIGURED_ADMIN` defaults or recommendations. Preserve only the superuser's
  general all-permission seed behavior.
- Require ordinary Supplier read authority and selected-company scope before
  evaluating confidential clearance. The permission alone must return no Supplier,
  link, count, or metadata.
- Select/project `paymentTerms` and latest reference-price/currency/effective
  metadata only for authorized callers. Unauthorized service/view models must carry
  an explicit restricted marker, not the original value.
- Reject unauthorized crafted nonblank confidential input before mutation or audit.
- Resolve exact Supplier/link/item/UOM ownership and status on every read/write.
- Lock exact scoped lifecycle rows, claim `ACTIVE` transactionally, and make source
  status plus audit one transaction. Test both concurrency winner orders.
- Use deterministic business ordering followed by stable ID, exact totals, bounded
  pages, and server-side clamping. Desktop and mobile must consume the same page.
- Preserve Catalog URL/filter/page/selection context, exact visible ranges,
  loading/error/true-empty/filtered-empty states, focused create/deactivate task
  modes, keyboard/focus behavior, and 44-pixel-minimum actions.
- Validate live permission revocation, no standalone access, no default/recommended
  admin grant, query-level omission, crafted writes, foreign bindings, concurrent
  lifecycle attempts, high-cardinality pagination, and responsive browsers.

## Implementation and documentation impact

- Code / architecture: add one sensitive permission check to Supplier read/write
  projections; add exact row-lock/CAS lifecycle services; share one server page
  between desktop/mobile Catalog presentations.
- Data / schema: no Supplier business-field or lifecycle-state change. A permission-
  catalog migration adds `purchasing.supplier_confidential.view` and the superuser
  all-permission seed includes it through its existing general rule.
- Migration / rollback: deploy the permission-catalog migration before code that
  requires the key. Do not backfill grants to `CONFIGURED_ADMIN` or recommended
  roles. Roll back application behavior only to a fail-closed hotfix; never restore
  broad commercial-field exposure. Keep the permission catalog row because deleting
  it can break role-permission links. Revoke explicit grants only through an
  operationally approved access change. Rollback must not delete or rewrite
  Supplier terms, prices, statuses, or audit history, and the Supplier Catalog must
  remain unavailable until a safe application version is active if confidentiality
  cannot otherwise be preserved.
- Workflow / permissions: the new permission grants confidential visibility only;
  it does not grant Supplier read, create, edit, deactivation, accreditation,
  purchasing, approval, or payment authority.
- UI / mobile: explicit `Restricted` commercial fields; same-result responsive
  table/cards; focused create/deactivate task modes; no horizontal mobile scrolling.
- Reporting / exports: no new report or export. Existing future exports must apply
  the same confidential boundary before enrollment.
- Knowledge base / training: Dunong must assess the new Restricted state,
  administrator grant guidance, and responsive Catalog workflow separately.
- Tests / UAT: focused and full local gates plus executable permission, concurrency,
  paging, mobile/browser, migration, and rollback evidence are required before a
  production-readiness claim.
- Glossary: `Supplier confidential access` is a new reusable permission concept and
  requires Dunong's user-facing glossary assessment; this source record does not
  prescribe grant recipients beyond the confirmed seed boundary.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement permission migration, server enforcement, lifecycle serialization, trusted task state, bounded responsive Catalog, and tests | Engineering / Database / QA | Current checkpoint | Complete locally |
| Align source-of-truth permission, security, data, UI, and plan documentation | Mithi | Current checkpoint | Complete for local checkpoint |
| Assess user-facing glossary, knowledge base, release note, and training impact | Dunong | Before release | Complete for local checkpoint |
| Execute disposable-PostgreSQL permission/concurrency/query-plan evidence | Database / QA | Before Master Data production readiness | Open |
| Execute authenticated desktop/tablet/mobile browser evidence | QA / UX | Before Master Data production readiness | Open |
| Verify permission migration/rollback and hosted recovery | Database / Release | Before production readiness | Open |
| Reconcile remaining Master Data role-policy and option-endpoint operational gates | Product / Security / Operations | Before Workspace 3 completion | Open |

## Evidence

- The Master Data and role/security specifications already classify Supplier
  payment information, negotiated terms, and contract pricing as separately
  confidential from ordinary Supplier Master access.
- The parent-confirmed deliberation requires query-level omission, additional-not-
  standalone clearance, fail-closed crafted writes, exact Supplier/link binding,
  serialized lifecycle actions, stable/clamped paging, and same-result responsive
  presentation.
- Local focused coverage passes 30/30 across Supplier, action-feedback,
  permission-catalog, and URL-owned TaskSheet suites. The complete non-database
  web suite passes 1,444 tests with 305 skipped and one existing TODO across 131
  passed/11 skipped files. Web typecheck, lint, E2E typecheck, production build,
  authorization-manifest, secret-review, and diff-hygiene evidence are recorded in
  the implementation plan.
- The registered disposable-PostgreSQL specification contains 13 cases for both
  confidential read projections, standalone and live/revoked clearance, crafted
  writes, clamped and tied multi-page ranges, exact/inactive-parent binding,
  duplicate deactivation, and three deterministic cross-writer lifecycle tests.
  Those tests force both winner orders for accreditation, link creation, and link
  deactivation against Supplier deactivation, for six exact race executions with
  observed row-lock waiting and atomic source/audit invariants. The responsive Playwright
  specification discovers 12 logical cases across 24 desktop/mobile project cases
  covering 320/390/900/1024/1366 layouts, URL and lookup-selection state, task
  focus, complete draft recovery, trusted success, pending controls, inactive and
  empty states, and create/deactivate success/error behavior. These specifications
  are authored only until their external runners execute successfully.
- No disposable-PostgreSQL, authenticated-browser, query-plan, hosted migration,
  recovery, or UAT execution credit is claimed.
- Final bounded-source Security and UX/QA reviews returned **GO** with
  C0/H0/M0/L0. Final Product review returned **GO** with C0/H0/M0/L1 after the
  deterministic six-execution race matrix was added; its non-blocking Low notes
  that future evidence could additionally assert audit `entityType` and complete
  before/after payloads. No local source blocker remains for this bounded
  checkpoint.
- Supplier Master Data, Workspace 3, and Phase I remain incomplete and **NO-GO**
  for production completion.

## Supersession

This decision strengthens but does not replace the existing Supplier register,
selected workspace, bounded catalog, duplicate-link, action-composer, and Admin
Audit decisions. Where earlier Supplier screens exposed payment terms or latest
reference-price metadata under ordinary management access, this decision's
explicit confidential boundary is authoritative.
