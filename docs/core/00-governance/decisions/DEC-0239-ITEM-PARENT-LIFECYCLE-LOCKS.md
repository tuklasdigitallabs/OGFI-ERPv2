# DEC-0239 — Item parent lifecycle locks

## Metadata

- Decision ID: `DEC-0239`
- Title: Serialize Item writes with Item Category and UOM deactivation
- Status: `Confirmed — implemented locally; executable PostgreSQL race matrix authored and registered, execution open`
- Date: 2026-07-26
- Decision owner: Master Data / Inventory integrity
- Decision Chair: Parent agent
- Related phase/module: Phase I Master Data
- Related decision brief: First Master Data production-readiness review priority, 2026-07-26

## Decision

Prioritize and implement the Item parent-lifecycle race correction before further
composer expansion. Item creation and any future governed material edit must lock and revalidate the exact
company-scoped Item Category and referenced base, purchase, and issue UOM rows in
a stable order inside the write transaction. Item Category and UOM deactivation
must lock the same parent row before checking active Item dependents and changing
its lifecycle state.

The valid race result is serialized: either the Item write commits against parents
that remained active and the waiting deactivation then rejects because an active
dependent exists, or deactivation commits first and the waiting Item write rejects
the now-inactive parent. No transaction may commit a new or edited active Item
against a deactivated Category or UOM.

## Context

The Master Data production-readiness review considered expanding large option
composers and restructuring the visible editor. Independent Security review found
a harder data-integrity issue: an Item write could validate an active Category or
UOM while a concurrent deactivation independently observed no active dependent.
Without a shared lock and in-transaction revalidation contract, both operations
could succeed and leave an active Item referencing an inactive parent.

This is a source-of-truth lifecycle invariant, so the blocker takes priority over
workflow ergonomics. The composer and TaskSheet improvements remain separate
visible-surface follow-ups and are not implemented by this decision.

## Options considered and challenge positions

### Option A — selected: shared parent lifecycle locks and revalidation

- Position: Security identified the concurrent Item-write/parent-deactivation race
  as a blocking production-readiness defect.
- Benefits: preserves active-parent integrity under concurrency; uses the existing
  transaction boundary, scope authority, lifecycle states, and audit contract; no
  schema or permission change is required.
- Failure modes: inconsistent lock ordering can deadlock; a parent can be checked
  outside the transaction; one optional UOM can be omitted; a count can be taken
  before the parent lock; unit/static tests can pass without proving two-connection
  behavior.
- Why selected: data integrity is a hard gate and cannot be deferred in favor of a
  presentation improvement.

### Option B — deferred: expand the Item composer beyond 100 options

- Position: Product initially recommended completing the greater-than-100-option
  selection experience as the next operational gap.
- Benefits: improves creation/editing for large category and UOM catalogs and
  avoids a bounded-selector dead end.
- Failure modes: users still face a production-blocking parent lifecycle race;
  increasing visible selection capacity does not serialize source writes.
- Why deferred: valuable but cannot override a credible data-integrity blocker.
  It remains a separate Master Data visible-surface completion item.

### Option C — deferred: replace the current composer with a TaskSheet

- Position: UX initially recommended a focused TaskSheet to improve multi-section
  Item maintenance and responsive task clarity.
- Benefits: can reduce modal/form congestion and make long Item edits easier to
  review.
- Failure modes: changes information architecture without closing the concurrent
  source invariant; it may widen implementation scope before the write contract is
  safe.
- Why deferred: the challenge round agreed that TaskSheet design follows the
  integrity correction and requires its own visible-surface acceptance evidence.

## Hard-gate assessment

- Tenant/company isolation: every parent lock includes the session tenant and
  selected company; an absent, foreign, or inactive parent fails closed.
- Server authorization: existing Core Administration permission and selected-
  company Manage checks remain required before any Item or parent mutation.
- Data integrity: Item creation and parent deactivation share `FOR UPDATE` locks
  and revalidate active state/dependents in the same transaction. `DEC-0241`
  replaced current editing with name-only correction against the locked Item row;
  it does not change parent references.
- Consistency: Category locks precede sorted, de-duplicated UOM locks for Item
  writes. Deactivation locks its one scoped parent before the dependent count.
- Audit: successful Item and parent lifecycle changes retain their existing audit
  writes in the same transaction; rejected races create no partial source change.
- Recovery: the change is application-level, non-schema, and reversible. Existing
  inactive parents and historical Item references are not rewritten.
- Phase discipline: no inventory movement, approval, purchasing, supplier,
  reporting, export, permission, or lifecycle-state expansion is authorized.

## Required safeguards

- Lock the exact scoped Item Category and all distinct referenced UOMs during Item
  creation and any future governed material edit; normalize optional UOMs, sort
  their IDs, and lock them in deterministic order.
- Recheck the Category and every required UOM as `ACTIVE` after acquiring locks.
  Preserve the existing stable user-safe error families for missing/inactive
  Category, base UOM, purchase UOM, and issue UOM.
- Lock the scoped active Category or UOM before counting active Items that refer to
  it, then reject deactivation with `ITEM_CATEGORY_HAS_ACTIVE_ITEMS` or
  `UOM_HAS_ACTIVE_ITEMS` as applicable.
- Keep parent revalidation, Item write, deactivation, and successful audit evidence
  inside their existing transactions. A losing operation must leave source and
  audit state unchanged.
- Preserve the Item-row lock and base-UOM movement-history guard for any future
  governed material edit. Under `DEC-0241`, current Item maintenance permits only
  a version-checked Item Name correction and rejects every material-field change.
- Execute a real two-connection PostgreSQL race for Category and each UOM role. It
  must prove both valid orderings, bounded settlement/no deadlock, exactly one
  permitted winner, stable losing error, final active-parent invariant, and no
  partial audit/source writes. Static source assertions are not concurrency proof.
- Complete responsive composer/TaskSheet and greater-than-100-option behavior as
  separately reviewed Master Data visible-surface work.

## Implementation and documentation impact

- Code / architecture: shared scoped parent-lock helper is used by Item creation;
  Category and UOM deactivation use corresponding transactional parent locks.
- Data / schema: no schema, migration, backfill, field, or existing-row change.
- Workflow / permissions: no lifecycle state or authority change; only concurrent
  enforcement of the existing active-parent/dependent rule is strengthened.
- UI / mobile: no composer, TaskSheet, option-catalog, or responsive behavior change
  in this checkpoint; existing user-safe action feedback remains authoritative.
- Reporting: no report, metric, or export change.
- Knowledge base / training: no visible workflow or terminology change; Dunong's
  separate assessment remains authoritative for user-facing material.
- Tests / UAT: focused Item coverage, complete non-database regression, web
  typecheck/lint, E2E typecheck, production build, authorization manifest, secret
  review, diff hygiene, and independent reviews pass. An executable disposable-
  PostgreSQL two-connection matrix is authored and registered, but its execution,
  responsive browser, hosted recovery, and UAT remain open.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement shared parent lifecycle locks and transactional revalidation | Parent implementation agent | Current checkpoint | Complete locally |
| Align decision index, Master Data source spec, and pending plan | Mithi | Current checkpoint | Complete |
| Execute two-connection Category/UOM race matrix | QA / Database / release owner | Before Master Data production-readiness claim | Matrix authored and registered; PostgreSQL execution remains an open blocking evidence gate |
| Complete large option-catalog and focused Item TaskSheet review | Product / UX / Engineering | Before Master Data workspace completion | Item create and controlled-correction sheets complete locally under `DEC-0240`/`DEC-0241`; external evidence remains open |
| Verify authenticated responsive UI, hosted recovery, and UAT | QA / Product / release owner | Before workspace completion | Open release gate |

## Evidence

- The root project rules require transaction safety, server-side scope enforcement,
  non-destructive master-data lifecycle, and applicable concurrency validation.
- The Master Data UI Specification requires duplicate/required-data validation and
  controlled deactivation without retroactive historical mutation.
- Implementation uses scoped `FOR UPDATE` parent locks, active-state revalidation,
  deterministic UOM ordering, and parent-lock-before-dependent-count deactivation.
- The current registered disposable-PostgreSQL integration matrix defines four
  tests: Item creation against Category plus base, purchase, and issue UOM
  deactivation. Each test exercises both winner orders for eight total races. It
  requires distinct backend PIDs, observes the actual wait through
  `pg_blocking_pids`, checks the stable loser error for each ordering, and asserts
  the final active-parent invariant together with atomic source and audit outcomes.
  The suite is discovered and skips safely when its integration sentinel is absent.
- Focused Item coverage passes 10/10. The complete non-database web suite passes
  1,424 tests with 305 skipped and one existing TODO across 129 passed/11 skipped
  files. Web typecheck/lint, E2E typecheck, production build, and the 20/20
  authorization manifest, secret review, and `git diff --check` pass. Final Product,
  Security, and UX reviews each return **GO** with C0/H0/M0/L0 for this local source
  checkpoint.
- The matrix is registered in the procurement/inventory disposable runner. That
  runner was attempted and still fails closed before database creation with
  `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`; therefore none of the eight races has
  execution credit. Authenticated responsive browser, hosted recovery/deployment,
  and UAT remain open. Master Data and Phase I remain incomplete and **NO-GO**.
- Product initially selected the greater-than-100-option composer, UX selected a
  TaskSheet, and Security identified the race as Blocking. The parent-led challenge
  round applied the data-integrity hard gate and reached consensus on the race-first
  option. Requested Code Spark and exact GPT-5.4 reviewers were unavailable; the
  closest permitted GPT-5.6 specialists were used without relaxing any gate.

## Supersession

`DEC-0241` narrows the current selected-Item edit surface to name-only correction,
so the authored race matrix no longer includes material Item update cases. This
decision remains authoritative for Item creation versus parent deactivation and for
the locking contract required by any future governed material edit.
