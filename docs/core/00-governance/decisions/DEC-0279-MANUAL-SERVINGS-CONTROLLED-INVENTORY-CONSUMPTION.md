# DEC-0279 — Manual Servings and Controlled Inventory Consumption

## Metadata

- Decision ID: `DEC-0279`
- Title: Manual Servings and Controlled Inventory Consumption
- Status: `Confirmed`
- Implementation state: `Implemented locally and default-off; activation evidence pending`
- Date: 2026-08-11
- Decision owner: OGFI Product Owner / Operations and Inventory Owners
- Decision Chair: Parent agent
- Related phase/module: Phase II Restaurant Operations, recipe costing, and inventory consumption
- Related decisions: `DEC-0035`, `DEC-0036`, `DEC-0041`, `DEC-0049`, `DEC-0068`, `DEC-0258`, `DEC-0280`
- Related decision brief: Parent-led manual servings and controlled inventory-consumption deliberation, confirmed by the authorized human on 2026-08-11

## Decision

Adopt a source-neutral, immutable manual serving declaration followed by
independent fact verification and a separate explicit controlled posting command.
Posting derives expected ingredient depletion from the effective published recipe
and creates a dedicated `CONSUMPTION_OUT` inventory movement exactly once; it is
expected/book consumption, not independent evidence of physical actual usage.

The additive local implementation is available under Restaurant Ops and remains
default-off per branch. No production activation, UAT-ready claim, or authoritative
physical-actual food-cost claim is permitted until every safeguard and activation
gate in this record passes.

## Context

The current theoretical-versus-actual report can calculate theoretical ingredient
usage from posted sales imports and can summarize outbound inventory-ledger evidence,
but the ERP has no approved ordinary service-consumption source. Manual serving
facts are needed before a trusted POS source is available, without disguising
recipe-derived book consumption as physical actual usage or using wastage and stock
adjustments as substitute depletion sources.

The selected design separates factual capture, verification, and inventory posting.
It preserves future POS replacement through a source-neutral contract and keeps
physical counts authoritative for observed stock and unexplained variance.

Requested Code Spark and GPT-5.4-mini reviewers were unavailable. The permitted
GPT-5.6 specialist fallback was used without relaxing the decision protocol or hard
gates.

## Confirmed disposition ownership

| Operational fact                                   | Inventory-effect owner                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Paid menu item prepared and issued/served          | Controlled recipe `CONSUMPTION_OUT`                                                                                |
| Complimentary menu item prepared and issued/served | Controlled recipe `CONSUMPTION_OUT`, with required reason, authorizer, and equivalent controlled approval/evidence |
| Staff meal                                         | Separate Authorized Consumption workflow; excluded from menu-serving declarations                                  |
| Cancelled before preparation                       | No inventory movement                                                                                              |
| Prepared but not served/issued                     | Wastage                                                                                                            |
| Served and later refunded                          | Remains controlled recipe consumption; refund does not restore stock                                               |
| Remake                                             | Original prepared item is Wastage; issued replacement is controlled recipe consumption                             |
| Count difference                                   | Count-variance/correction workflow; never a second consumption posting                                             |

These categories are mutually exclusive for inventory-effect ownership. A physical
depletion event must not be posted through more than one source.

## Options considered

### Option A — selected: immutable serving facts with separate controlled posting

- **Summary:** An encoder submits immutable service-period facts; a different
  manager verifies them; an explicitly authorized non-encoder posts the entire
  verified document through a dedicated recipe-consumption command.
- **Benefits:** Separates observation from stock authority, supports exactly-once
  posting and future POS replacement, preserves audit history, and makes missing
  recipe or stock readiness fail closed without losing the declared fact.
- **Failure modes:** Duplicate period coverage, double ownership across consumption
  and wastage, stale recipe/UOM data, wrong issue location or lot, negative stock,
  self-verification, partial posting, or late posting across a count cutoff could
  corrupt expected on-hand and variance analysis.
- **Why selected:** It is the smallest source-neutral design that preserves
  segregation, immutable-ledger integrity, and future integration flexibility.

### Option B — rejected: entry directly posts recipe depletion

- **Summary:** Reduce stock as soon as a branch user enters servings.
- **Benefits:** Fewer steps and faster apparent stock updates.
- **Failure modes:** Entry mistakes immediately affect inventory, the encoder
  controls both fact and effect, retries can duplicate depletion, and missing
  readiness encourages partial or estimated posting.
- **Why rejected:** It fails the required independent verification and controlled
  posting boundary.

### Option C — rejected: record servings for reporting only or wait for POS

- **Summary:** Keep manual servings read-only, use counts/adjustments for stock, or
  defer all consumption posting until a POS integration exists.
- **Benefits:** Avoids a new inventory writer in the near term.
- **Failure modes:** Expected on-hand remains overstated; variances absorb ordinary
  service depletion; adjustments or wastage can be misused; and a future POS
  contract has no proven controlled consumption boundary to replace.
- **Why rejected:** It does not establish trustworthy book consumption and weakens
  operational interpretation of counts and variance.

## Hard-gate assessment

1. **Scope isolation:** Every policy, declaration, verification, post, reversal,
   movement, allocation, and report is tenant/company/location scoped, with brand
   where applicable. Service-period configuration is authoritative for that exact
   scope and effective date.
2. **Server authorization and segregation:** Submission, fact verification, and
   posting are server-enforced commands. The encoder cannot verify or post their
   declaration. A different manager verifies facts. The same non-encoder manager
   may verify and post only through separate explicit actions while holding both
   live permissions, exact live scope, and current MFA.
3. **Small-branch path:** A branch without a second eligible manager uses a remote
   Area or Operations manager with exact assigned scope. Self-verification is never
   a fallback.
4. **Immutable ledger and audit:** Posting creates dedicated
   `CONSUMPTION_OUT` movements through the inventory ledger and append-only audit
   history. No direct balance update or destructive correction is allowed.
5. **Atomicity and idempotency:** One verified declaration posts all derived
   ingredient allocations atomically and exactly once. Missing or ambiguous
   recipe, UOM, issue-location, lot/expiry, or stock readiness blocks the whole
   post and creates zero movements; partial posting is prohibited.
6. **Recovery:** A posted declaration is corrected only through a full-document
   reversal followed by a corrected replacement. Reversal and replacement retain
   source lineage and exactly-once guards.
7. **Phase and activation boundary:** The source may be implemented additively and
   default-off, but production activation requires the operational, authorization,
   data-integrity, browser, count, recovery, UAT, and owner gates below.

## Required safeguards

### Service periods and factual capture

- Configure exactly one authoritative, non-overlapping service-period source per
  company/location/effective date. Use either configured service periods with a
  read-only daily rollup, or `DAILY` as the sole capture period; never accept both
  as posting sources.
- Support every active branch location, but activate posting only after that
  branch passes readiness and is explicitly enabled. Each branch must resolve to
  an exact inventory issue location. Where a branch has more than one stockroom,
  use an approved branch default or item-specific mapping; never infer the first
  location and never permit `All Locations` for posting.
- Provide an effective-dated, audited company-default service-period schedule and
  timezone. A branch may use an effective-dated override; overrides must retain
  their reason, actor, and history and must satisfy the same no-overlap and
  `DAILY`-versus-shift exclusivity rules.
- The entry catalog includes every active, approved menu item offered at the
  selected branch. Catalog visibility does not imply posting readiness. Resolve
  its effective published recipe through `DEC-0280` only:
  `UNAVAILABLE > LOCATION_OVERRIDE > BRAND_DEFAULT > blocked`. A missing valid
  resolution, UOM path, inventory-item mapping, issue location, or eligible stock
  blocks the whole post while preserving the serving fact.
- Store business date in the company timezone and timestamps in UTC. Reject
  overlapping periods, duplicate source coverage, and stale configuration.
- Preserve submitted facts even when posting readiness fails. Corrections create
  an auditable replacement/supersession chain; they do not overwrite facts.
- Keep source identity neutral so a later trusted POS declaration can replace the
  manual source under a separately controlled precedence/cutover process without
  changing the consumption-posting contract.

### Recipe, UOM, issue location, lot, and posting

- Resolve an effective-dated published recipe through the brand-default adoption
  and exact-location exception hierarchy in `DEC-0280`, then retain an immutable
  recipe/yield and resolution-source snapshot for every served menu item, including
  sub-recipes, UOM conversion, and approved rounding. Pending cost evidence does
  not block otherwise valid quantity readiness.
- Resolve the configured issue location and deterministic FEFO lot/expiry
  allocation under transaction locks. Negative stock is prohibited.
- Use one dedicated movement type and source guard for `CONSUMPTION_OUT`; no other
  source may claim the same source identity, declaration revision, line, or
  allocation.
- Revalidate live scope, permissions, MFA, declaration state, source version,
  recipe/UOM/readiness, stock, lot order, count freeze, period cutoff, and reversal
  state inside the posting transaction.
- A replay returns the existing outcome or a stable conflict and never creates a
  second movement. Reversal is balance-neutral against the original allocations;
  a corrected replacement posts as a new linked document.

### Count and reconciliation controls

- Pilot with blind closing counts daily for a bounded configured set of
  high-shrink sentinel items, weekly for other configured high-risk/perishable
  items, and monthly for general inventory.
- A sentinel is an explicitly configured item/category/location cohort selected
  because of high value, shrink exposure, ease of removal, perishability, or
  repeated variance. No item list is hardcoded and the system must not enroll an
  item automatically; later usage/variance signals may only recommend a reviewed
  configuration change.
- Review cadence only after at least four weeks and sufficient evidence. Do not
  relax cadence automatically; any change remains an explicit, audited policy
  decision.
- Enforce count freeze/cutoff and late-post controls so a consumption event cannot
  silently cross an authoritative count boundary. Late facts require an explicit
  controlled disposition before posting.
- Reports must label recipe-derived results as `Expected/Book Consumption`.
  Physical counts and controlled variance/correction records remain the evidence
  for observed actual depletion or loss; no theft/loss conclusion follows from a
  consumption estimate or variance alone.

### Activation evidence

- Default-off feature/configuration state with no legacy fallback writer.
- Migration review, rollback considerations, data-dictionary update, and seeded
  permission/policy review.
- Database tests for atomic no-partial posting, deterministic FEFO, no-negative
  stock, exact replay, concurrent post/reversal, full reversal and replacement,
  period overlap, count freeze/cutoff, and zero-movement readiness failures.
- Authorization tests for encoder segregation, remote-manager scope, live
  permission revocation, MFA, direct route/API denial, and complimentary approval
  and evidence requirements.
- Production-authenticated responsive browser tests and named-user UAT covering
  paid, complimentary, staff meal exclusion, pre-prep cancel, prepared discard,
  refund, remake, readiness failure, late posting, reversal, and correction.
- Operations, Inventory, Security/Controls, QA, Release, and Product owner signoff
  for the exact candidate and configured pilot scope before production activation.

### Confirmed operating roles and complimentary controls

- Branch Staff and Branch Supervisors may encode declarations only when assigned
  the exact branch scope and submit permission.
- A Branch Manager may verify and post through separate explicit commands only
  when holding the separate live permissions, exact branch scope, and required
  MFA. The encoder cannot verify or post their own declaration.
- A remote reviewer must be a specifically authorized Admin, Area, or Operations
  account with exact branch scope, the required operational permission, and MFA.
  A generic platform-administrator role does not automatically grant branch
  consumption authority.
- Complimentary means an ordinary menu item prepared and served without payment,
  including an authorized VIP, service-recovery, or promotional serving. It still
  posts recipe consumption exactly once with zero revenue and requires a category
  or reason, authorizing manager, and an appropriate table, transaction, guest,
  event, incident, or explanatory reference. Configurable high-value, repeated,
  or bulk thresholds may require elevated Operations or remote review.
- Staff meals are not menu servings under the confirmed OGFI process and remain in
  the separate Authorized Consumption workflow. A complimentary serving must not
  also be posted as Wastage or Authorized Consumption.

## Implementation and documentation impact

- **Code / architecture:** Add a source-neutral serving-declaration domain and a
  separate transactional consumption-posting service. Keep routes/UI from writing
  inventory directly. The first implementation remains default-off.
- **Data / schema:** Add scoped/effective service-period configuration, immutable
  declaration and line revisions, verification/post/reversal state and actors,
  `DEC-0280` recipe-resolution/yield/UOM snapshots, issue-location and FEFO allocation lineage,
  idempotency/source guards, and dedicated `CONSUMPTION_OUT` ledger provenance.
- **Workflow / permissions:** Add separate submit, verify, post, return/correct,
  and reverse permissions/actions with live scope/MFA and prohibited-actor checks.
  Complimentary service requires reason, authorizer, and controlled approval/evidence.
- **UI / mobile:** Provide a task-focused declaration/review/post workspace with
  explicit readiness blockers, period/source identity, disposition, expected
  ingredient effect, separate post action, and full activity/reversal lineage.
- **Reporting:** Add expected/book-consumption reporting and reconciliation to
  counts and ledger movements without renaming it physical actual usage.
- **Knowledge base / training:** Dunong must assess role-based operating guidance,
  disposition examples, closing cadence, blocked-post recovery, and release notes
  before user exposure. No user-facing behavior is released by this decision alone.
- **Tests / UAT:** All activation evidence above remains pending. This record is
  not implementation, UAT, release, or production-readiness evidence.

## Follow-up actions

| Action                                                                                                                                                                      | Owner                                                 | Due / trigger         | Status          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------- | --------------- |
| Design additive schema, permissions, posting transaction, and source-neutral interface.                                                                                     | Architecture / Database / Backend / Security          | Before implementation | Completed locally |
| Implement the manual declaration, independent verification, and explicit post/reversal workflow behind a default-off gate.                                                  | Engineering                                           | After design review   | Completed locally |
| Configure company-default service periods, audited branch overrides, branch issue locations, sentinel count cohorts, complimentary controls, and named remote-review paths. | Operations / Inventory / Product                      | Before UAT            | Pending         |
| Execute database, authorization, concurrency, browser, reconciliation, and named-user UAT evidence.                                                                         | QA / Security / Operations / Inventory                | Before activation     | Pending         |
| Approve exact-candidate production activation.                                                                                                                              | Product / Operations / Inventory / Security / Release | After all gates pass  | Pending         |
| Prepare user-facing guidance and release communication.                                                                                                                     | Dunong                                                | Before user exposure  | Local guide complete; release communication pending |

## Evidence

- [`AGENTS.md`](../../../../AGENTS.md) — tenant/scope, server authorization,
  immutable-ledger, configurable-policy, audit, transaction, and documentation rules.
- [`SUBAGENT_DELIBERATION_PROTOCOL.md`](../SUBAGENT_DELIBERATION_PROTOCOL.md) —
  confirmed-decision process and hard gates.
- [`DECISION_SCORECARD.md`](../DECISION_SCORECARD.md) — weighted comparison after
  inventory, authorization, audit, atomicity, scope, and recovery hard gates.
- [`OPEN_DECISIONS_AND_ASSUMPTIONS.md`](../OPEN_DECISIONS_AND_ASSUMPTIONS.md) —
  former item 21 decision question and required control topics.
- [`theoretical-vs-actual-food-cost-workflow.md`](../../../phases/phase-02-restaurant-operations-and-food-cost/workflows/theoretical-vs-actual-food-cost-workflow.md) — current reporting boundary and confirmed next workflow.
- [`PHASE2_DATA_EXTENSIONS.md`](../../../phases/phase-02-restaurant-operations-and-food-cost/data/PHASE2_DATA_EXTENSIONS.md) — current and pending Phase II data boundary.
- Authorized human confirmation supplied to the parent agent on 2026-08-11,
  including disposition, period, segregation, posting, count, reversal, and
  activation defaults.
- Fresh disposable PostgreSQL 17 lifecycle evidence on 2026-08-11 applied all
  152 migrations and passed declaration verification, FEFO posting, exact replay,
  reversal neutrality, correction lineage, self-verification denial, mutable-state
  controls, and insufficient-stock rollback with zero partial mutation.

## Supersession

This record resolves Open Decision 21. It does not supersede the current
read/report/export food-cost implementation, immutable-ledger, count, wastage,
adjustment, authorization, or Inventory Control Pilot decisions. A future trusted
POS source may replace manual fact capture only through a separately confirmed
source-precedence and cutover decision; the controlled consumption-posting and
exactly-once ownership safeguards remain authoritative unless explicitly
superseded. `DEC-0280` supersedes only this record's prior exact-branch recipe-
assignment target: effective recipe resolution now uses brand-default adoption,
branch unavailability/location-override exceptions, and fail-closed precedence.
