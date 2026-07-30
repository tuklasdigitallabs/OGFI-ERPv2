# DEC-0259 — Inventory Pilot Synthetic Configuration Baseline

## Metadata

- Decision ID: `DEC-0259`
- Title: Inventory Pilot Synthetic Configuration Baseline
- Status: `Confirmed`
- Date: 2026-07-30
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory Control Pilot configuration baseline
- Related decisions: `DEC-0036`, `DEC-0041`, `DEC-0049`, `DEC-0050`,
  `DEC-0051`, `DEC-0052`, `DEC-0098`, `DEC-0099`, `DEC-0225`, `DEC-0257`,
  `DEC-0258`
- Related decision brief: Parent-led decision on the first local-only Inventory
  Control Pilot configuration-baseline implementation

## Decision

Implement a repository-owned, synthetic, local-only Inventory Control Pilot
manifest together with a positively marked disposable PostgreSQL fixture and
validator. Bind the evidence to one canonical manifest digest and prove exact
acceptance plus adversarial rejection without creating operational configuration
or authority.

Do not create `CompanyPolicySetting` rows, production seed values, real
identities, business thresholds, approval routes, opening values, or runtime
authority in this slice. After the authorized owner confirms the operational
cohort and policy values, reconsider `CompanyPolicySetting` or a dedicated
relational model; either operational design must have no test fallback and must
enforce digest and change-history integrity.

## Context

`DEC-0258` requires the pilot warehouse, branches, selected high-risk SKUs,
named users, roles, approvers, effective policy values, and opening-stock controls
to be frozen before shadow UAT or operational cutover. `DEC-0036` already
authorizes conservative configurable defaults; this record does not reopen or
supersede them. The owner has not confirmed which effective values and cohort
bindings govern this operational pilot. Encoding guessed pilot-specific values
in runtime tables or seeds would turn a test convenience into operational policy
and could accidentally grant authority or establish false opening inventory.

The implementation sequence still needs a repeatable local gate that can prove
the shape, scope relationships, deterministic identity, and fail-closed behavior
of a future pilot configuration. A repository-owned synthetic manifest and a
positively attested disposable database provide that evidence without claiming
that synthetic actors, locations, items, approval routes, thresholds, or values
are approved for live use.

The current application also lacks a complete operational boundary for this
configuration:

- item authorization does not yet enforce a pilot SKU scope;
- transfer and ordinary stock-count approval families are not fully represented
  in the active approval-routing model;
- opening-balance posting does not yet have the required complete transaction and
  linked-reversal path; and
- the authorized owner has not confirmed the operational cohort, pilot-specific
  effective policy values, thresholds, named actors, approval routes, or opening
  values.

These are blockers to operational configuration and release, not values the
synthetic fixture may fill by assumption.

The requested Code Spark and GPT-5.4-mini subagent models were not selectable in
the active toolset. The parent used the closest permitted GPT-5.6 role fallbacks
for the material deliberation and retained the required independent evidence,
hard gates, and parent confirmation. The fallback is an execution constraint and
does not change this decision's authority or scope.

## Options considered

### Option A — selected: synthetic manifest plus disposable-database validator

- **Summary:** Store a synthetic local-only pilot manifest in the repository;
  provision only a positively marked disposable PostgreSQL fixture; validate the
  manifest and fixture against one canonical representation and digest; and
  retain exact-match and adversarial rejection evidence.
- **Benefits:** Enables deterministic local validation without creating live
  authority or guessed policy; makes the evidence reviewable and repeatable; and
  provides a controlled precursor to owner-confirmed operational configuration.
- **Failure modes:** A synthetic manifest could be mistaken for production data;
  the database could be misidentified as disposable; non-canonical serialization
  could produce unstable digests; partial or extra rows could escape validation;
  or a future runtime could silently fall back to the test manifest.
- **Why selected:** It is the only option that advances the local baseline while
  respecting the unresolved business policy and the operational blockers.

### Option B — rejected now: write the pilot baseline to `CompanyPolicySetting`

- **Summary:** Represent the pilot cohort and configuration as company policy
  settings immediately.
- **Benefits:** Reuses an existing configurable-policy mechanism and could expose
  an eventual administrative lifecycle.
- **Failure modes:** The generic setting structure may not preserve relational
  scope and referential integrity; guessed values could become runtime policy;
  change history or digest binding could be incomplete; and synthetic data could
  accidentally influence production behavior.
- **Why rejected now:** Operational values and authority are unconfirmed, the
  required SKU and approval-family boundaries are incomplete, and no production
  data-model choice has been approved. This option may be reconsidered only after
  owner confirmation and a separate implementation review.

### Option C — deferred alternative: dedicated relational pilot configuration

- **Summary:** Add normalized company-, location-, item-, actor-, role-, route-,
  and effective-period records for an operational pilot cohort.
- **Benefits:** Can enforce referential integrity, lifecycle constraints, history,
  and scoped queries more directly than a generic policy-value store.
- **Failure modes:** Introduces schema and migration risk before the required
  policy is known; may duplicate existing authorization or approval concepts; and
  could prematurely establish an operational configuration model.
- **Why deferred:** It may be the correct operational model, but only after the
  owner confirms the cohort and policy and the missing runtime boundaries are
  resolved. It requires its own schema, rollback, data-dictionary, authorization,
  and migration deliberation.

### Option D — rejected: defer all configuration-baseline work

- **Summary:** Wait for complete owner policy and runtime implementation before
  creating any manifest or validator.
- **Benefits:** Avoids synthetic configuration work and the risk of confusing it
  with production data.
- **Failure modes:** Leaves no deterministic local contract for validating the
  expected cohort shape, relationships, digest, or fail-closed behavior; delays
  evidence for later implementation; and encourages ad hoc fixtures.
- **Why rejected:** The synthetic, isolated boundary provides useful local
  evidence without making an operational decision.

## Hard-gate assessment

- **Tenant/company/brand/location isolation:** Synthetic records must form one
  internally coherent test scope and the validator must reject cross-scope or
  unknown references. No operational scope assignment is created.
- **Server authorization:** The manifest and fixture grant no runtime authority
  and are not an authorization source. Existing server authorization remains
  authoritative.
- **Segregation of duties:** Synthetic actor-role relationships may test required
  separation, but they do not approve real actors or routes. The validator must
  reject prohibited self-approval relationships represented in the test case.
- **Immutable ledger and audit:** No opening balance or inventory movement is
  posted by this slice. The incomplete opening-balance transaction/reversal path
  remains blocking.
- **Transactional consistency and idempotency:** Fixture provisioning and
  validation must operate only against an attested disposable database and be
  repeatable without drifting the accepted evidence.
- **Phase scope:** The work is limited to the Phase I Inventory Control Pilot
  baseline described by `DEC-0258`.
- **Recovery and rollback:** The disposable fixture can be destroyed and recreated
  from its repository source. No production rollback or operational recovery
  credit follows from that local proof.

The operational pilot remains **NO-GO**. This decision does not close production
identity, approval activation, opening-stock, count correction, exact-candidate
browser, hosted recovery, human UAT, or owner-signoff gates.

## Required safeguards

1. Label the manifest, fixture, commands, and evidence as synthetic, local-only,
   disposable, and non-authoritative.
2. Require a positive disposable-database marker or attestation. Absence,
   mismatch, a forbidden production-like target, or uncertain identity must fail
   before fixture mutation.
3. Define one deterministic canonical form for the manifest. Bind provisioning,
   validation, and retained evidence to its cryptographic digest.
4. Prove exactness: expected records and relationships must be present with no
   unapproved substitution, omission, or extra cohort member.
5. Add adversarial cases for tampered digests, cross-company/location references,
   unknown or duplicate identities, extra or missing cohort members, invalid
   actor separation, unmarked databases, and any attempt to treat the fixture as
   operational configuration.
6. Keep test values obviously synthetic. Do not use real staff identities,
   supplier commitments, production location identifiers, live item catalogs,
   policy thresholds, approval routes, or opening inventory values.
7. Do not read the synthetic manifest from production runtime, deployment seeds,
   standard application startup, or authorization and approval services.
8. Do not add `CompanyPolicySetting` rows or another operational configuration
   store as part of this slice.
9. A later operational design must use only owner-confirmed values, have no
   fallback to the synthetic manifest, preserve an immutable or append-only
   change history appropriate to the model, and bind active configuration and
   release evidence to an exact digest/version.
10. Do not claim SKU-scope enforcement, transfer/count approval coverage, or
    opening-stock readiness until their separate implementation and evidence
    gates pass.

## Implementation and documentation impact

- **Code / architecture:** Add a local verification boundary for a repository
  manifest and disposable fixture. Do not connect it to application runtime,
  production seed, authorization, approval, or posting code.
- **Data / schema:** No production schema or migration is authorized. Disposable
  fixture data is evidence-only and must be reconstructable. A later relational
  operational model requires a separate decision and data-dictionary update.
- **Workflow / permissions:** No policy, identity, role assignment, threshold,
  route, or permission changes. Missing transfer and ordinary count approval
  families remain blockers.
- **UI / mobile:** No visible workflow or navigation change is authorized.
- **Reporting:** The validator may emit local verification evidence only; it must
  not produce operational inventory, variance, approval, or readiness reports.
- **Knowledge base / training:** No Dunong update is required for this internal
  synthetic validation slice. Operational configuration will require role-based
  enablement after owner confirmation and implementation.
- **Tests / UAT:** Require canonical-digest, exact-fixture, repeatability,
  disposable-target safety, and adversarial rejection tests. The evidence does
  not count as human UAT or operational stock-of-record validation.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the synthetic manifest, disposable fixture, validator, canonical digest, exact-match proof, and adversarial cases. | Engineering / QA | Current local-only baseline slice | Complete locally; independent re-review GO on 2026-07-30 |
| Confirm the exact warehouse, branches, high-risk SKU cohort, named actors, roles, approvers, thresholds, evidence rules, count cadence, tolerances, opening values, and owners. | Product / Operations / Inventory / Security | Before operational configuration | Blocking |
| Define and enforce operational pilot SKU scope without treating presentation classification as authorization. | Product / Architecture / Security / Engineering | Before shadow-to-operational promotion | Blocking |
| Complete the required transfer and ordinary stock-count approval-family decision and runtime coverage. | Product / Operations / Controls / Engineering | Before operational routing activation | Blocking |
| Complete the immutable opening-balance transaction, reconciliation, idempotency, and linked-reversal path. | Inventory / Architecture / Database / QA | Before opening-stock rehearsal | Blocking |
| Reconsider `CompanyPolicySetting` versus a dedicated relational operational configuration model using only owner-confirmed values, no test fallback, exact digest/version binding, and preserved history. | Parent decision council / Product owner | After owner policy confirmation and blocker closure | Deferred |
| Assess operational configuration help and training impact. | Dunong / Process owners | After an operational model is confirmed | Pending handoff |

## Evidence

- [`AGENTS.md`](../../../../AGENTS.md) — Phase I scope, server authorization,
  configurable policy, immutable ledger, segregation, data, testing, and
  documentation rules.
- [`SUBAGENT_DELIBERATION_PROTOCOL.md`](../SUBAGENT_DELIBERATION_PROTOCOL.md) —
  material-decision process, hard gates, status, and model-fallback requirements.
- [`DECISION_RECORD_TEMPLATE.md`](../DECISION_RECORD_TEMPLATE.md) — confirmed
  decision-record structure.
- [`DEC-0258`](DEC-0258-INVENTORY-CONTROL-PILOT-RELEASE-SCOPE.md) — bounded pilot
  scope, release gates, owner-confirmed cohort requirement, and prohibition on
  treating shadow data as operational stock.
- [`CURRENT_PENDING_IMPLEMENTATION_PLAN.md`](../../07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md) —
  local-only directive, pilot dependency order, unresolved release blockers, and
  evidence-weighted status at the time of this decision.
- Parent decision brief, independent specialist reviews, challenge synthesis, and
  parent-confirmed hybrid conclusion on 2026-07-30. Code Spark and GPT-5.4-mini
  were unavailable in the active toolset, so the council used the closest
  permitted GPT-5.6 role fallbacks without weakening any hard gate.
- Local implementation evidence on 2026-07-30: 14 manifest/canonicalization/
  boundary cases passed; a fresh positively attested PostgreSQL 17 database
  applied all 141 migrations and passed seed, role-contract, authentication-
  throttle, and 17 append-only-history cases; repeat provisioning and exact
  validation proved 10 actors, 10 roles, 32 scopes, and eight sealed test routes;
  transactional probes rejected and rolled back extra role/scope/permission/rule/
  route state plus operational transfer, approval-instance, inventory-balance,
  inventory-movement, company-policy, notification, and audit rows. Exact zero-
  state assertions also covered procurement, receiving, transfers, counts,
  wastage, adjustments, approval instances, notifications, audit, inventory, and
  policy. Teardown left only the PostgreSQL template databases and the temporary
  Docker container was removed.
- Independent QA re-review returned **GO** for closing this synthetic baseline
  only, with no Blocking or High findings. Code Spark and GPT-5.4-mini were not
  selectable, so the owner-authorized GPT-5.6 fallback was used and recorded.
  The review grants no operational configuration, approval-runtime activation,
  stock authority, UAT credit, deployment authority, or Phase I completion.

## Supersession

This record supplements `DEC-0258` with the local synthetic configuration-
baseline boundary. It does not supersede the configurable defaults in `DEC-0036`
or existing authorization, approval, inventory-ledger, audit, or release
decisions. It does not delete or reinterpret existing `CompanyPolicySetting`
records and does not select the future operational configuration data model. A
later confirmed record must document the owner-approved cohort, effective policy
values, selected storage model, migration and rollback effects, runtime
authorization boundary, history contract, and exact-version/digest enforcement
before operational configuration is implemented.
