# DEC-0273 — Inventory Pilot Configuration Draft, Seal, and Readiness Evidence

## Metadata

- Decision ID: `DEC-0273`
- Title: Inventory Pilot Configuration Draft, Seal, and Readiness Evidence
- Status: `Confirmed`
- Date: 2026-08-06
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory Control Pilot configuration and release
  readiness
- Related decisions: `DEC-0259`, `DEC-0260`, `DEC-0261`, `DEC-0263`,
  `DEC-0266`, `DEC-0270`, `DEC-0271`, `DEC-0272`
- Related decision brief: Parent-confirmed operational pilot configuration
  authoring and sealing boundary following independent council and challenge
  review

## Decision

Implement Option A: store normalized, mutable, company-scoped pilot drafts
separately from operational configuration, then compile a valid draft atomically
into the existing immutable sealed revision and memberships defined by
`DEC-0261`. Sealing requires a dedicated seal permission, exact Company
`MANAGE`, fresh MFA, and a sealer different from the draft's editor.

The seal also captures exactly eight immutable, digest-covered, point-in-time
family-readiness records. They are evidence only: live authorization, scope,
role assignment, segregation, approval routing, and source-state checks remain
authoritative whenever a workflow action occurs. Sealing has no activation,
approval, opening-stock, posting, ledger, balance, custody, or financial effect.

## Context

The operational classifier already accepts only immutable sealed revisions, but
there is no controlled way to prepare the real pilot cohort without editing
sealed data or treating the synthetic manifest from `DEC-0259` as operational
configuration. The bounded pilot also needs reviewable evidence that named
actors and routes existed at sealing time without turning that evidence into a
permanent grant.

A mutable authoring boundary is therefore required before the existing sealed
boundary. It must preserve exact tenant/company lineage, explicit endpoint
capabilities, an explicitly selected high-risk item catalog, actor separation,
and deterministic digest integrity. It must also retain historical cohort truth:
a successor configuration can govern new cohorts, but cannot silently rewrite
records already pinned to an earlier revision.

## Confirmed contract

### Draft and seal lifecycle

1. Draft headers, endpoint memberships, item memberships, named-actor evidence,
   and family-readiness inputs are normalized mutable records scoped to one
   tenant and company. Draft changes are audited and use version/CAS protection.
2. Access is additive and server-enforced: dedicated pilot-configuration
   **view**, **draft**, and **seal** permissions apply to their respective
   actions, and every action additionally requires exact `MANAGE` scope on the
   selected Company. Baseline grants for these permissions are limited to the
   configured Super Admin and System Admin roles, but a display role name or
   draft membership grants nothing: every action still requires a current live
   assignment carrying the applicable permission and exact Company `MANAGE`.
3. The draft editor cannot seal that draft. The sealer must have fresh MFA and
   current live permission, role assignment, effective date, tenant, company,
   and exact Company `MANAGE` scope when the transaction executes.
4. Sealing locks and revalidates the complete draft, allocates the next company
   revision number, deterministically compiles canonical content, writes the
   existing `InventoryPilotConfigurationRevision` plus normalized memberships
   and readiness snapshots, verifies the digest, and marks the draft terminal
   in one transaction. Any conflict or validation failure creates no partial
   sealed revision.
5. Sealed revisions, memberships, readiness records, canonical content, and
   digest are immutable. Correction requires a new draft and a higher successor
   revision; a sealed revision is never reopened or edited.

### Exact cohort and actor evidence

- The high-risk pilot catalog is the explicit set of selected Item IDs in the
  sealed membership records. Category, name, tag, report grouping, or client
  filtering cannot add or remove an item implicitly.
- Named actors prove only who satisfied the readiness review at the seal-time
  cutoff. They do not assign a role, permission, scope, approval step, or
  executor capability.
- Opening readiness requires distinct named actors for preparer, submitter,
  Operations reviewer, Accounting reviewer, and command requester, with every
  applicable prohibited-actor relationship rejected. The opening executor is
  not selected or granted by the draft; it remains deployment-controlled and
  independently authorized.

### Eight family-readiness snapshots

The seal transaction creates exactly one immutable readiness record for each of
these exact families, with no registry expansion or aliases:

1. `PurchaseRequest`
2. `QuotationRecommendation`
3. `PurchaseOrder`
4. `InventoryTransfer`
5. `StockCountAttemptReview`
6. `WastageReport`
7. `StockAdjustment`
8. `OpeningInventoryCutover`

Each record pins the sealed revision identity and digest, exact family key,
seal-time route/readiness facts, named actors and required role evidence, and
the evidence cutoff. These records are covered by the same deterministic sealed
digest and are point-in-time evidence only. Live authorization and routing data
remain the sole authority for visibility, submission, review, approval,
commands, and posting.

The single `PurchaseRequest` readiness record certifies only the bounded pilot's
standard, non-emergency scenario. Its evidence persists stable resolver ID
`purchase_request_approval_rule_v1` and must invoke the shared production
`resolvePurchaseRequestApprovalRule` resolver with canonical input
`isEmergency=false` and must resolve the selected active, sealed `DEFAULT` rule
with outcome `routeType=normal` and `fallbackUsed=false`. A valid active
`PR_EMERGENCY` rule may coexist; it is neither an ambiguity nor readiness
evidence for this record, and it receives no certification or UAT credit.

The raw sealed Approval Rule canonical definition and its digest remain a
separate database-verifiable evidence pair. `PurchaseRequest` additionally
stores a resolver-evidence canonical payload and digest containing the resolver
identity, canonical input, and exact outcome, including the selected rule key,
identity, lineage/version, normal route type, no-fallback result, and the same
raw rule evidence. Non-Purchase-Request families must not carry resolver
evidence. Both evidence pairs are covered by the sealed revision digest. Live
eligibility must invoke the same production resolver again with
`isEmergency=false` and require the same exact outcome. Missing `DEFAULT`, a
fallback, resolver drift, or a different selected rule fails closed. Emergency
Purchase Request routing and UAT remain outside this decision and the bounded
pilot readiness claim.

### Supersession and cohort pinning

A higher sealed revision may supersede its predecessor only for cohorts created
after the successor becomes the selected configuration through a separately
authorized runtime path. Existing opening cohorts, submission intents,
approval graphs, or other admitted records remain pinned to their original
revision and digest. No seal operation activates a revision, migrates an old
cohort, rewrites a route, or changes a source record.

## Options considered

### Option A — selected: normalized drafts compiled to immutable revisions

- **Benefits:** Separates safe authoring from operational truth, provides an
  atomic review-and-seal boundary, preserves exact relational scope and item
  identity, and records readiness without creating authority.
- **Failure modes:** Partial compilation, editor self-sealing, stale actor or
  route evidence, digest mismatch, or later consumers treating snapshots as
  grants could undermine the boundary.
- **Why selected:** It is the only option that supplies a usable operational
  preparation path while preserving the existing immutable classifier and live
  authorization model.

### Option B — rejected: mutable JSON, environment, or generic policy settings

- **Benefits:** Fewer purpose-built relations and a superficially simpler edit
  path.
- **Failure modes:** Weak referential integrity, ambiguous scope, unstable
  canonicalization, hidden catalog expansion, and accidental runtime authority.
- **Why rejected:** Pilot cohort, actors, routes, and evidence require exact
  relational identity and immutable history.

### Option C — rejected: edit or replace sealed revisions directly

- **Benefits:** Avoids a separate draft model.
- **Failure modes:** Rewrites historical classification, breaks digest and
  cohort pinning, and permits incomplete operational state.
- **Why rejected:** It violates `DEC-0261` and the immutable evidence boundary.

### Option D — rejected: make readiness snapshots runtime grants

- **Benefits:** Could reduce live lookups.
- **Failure modes:** Revoked roles, expired assignments, changed scope, or
  revised routes could remain effective; readiness would become a parallel
  authorization and routing system.
- **Why rejected:** Runtime permission, scope, segregation, MFA, and route checks
  must remain live and authoritative.

## Hard-gate assessment

- **Tenant/company isolation:** Draft, compilation, sealed output, readiness,
  endpoints, items, and actors must resolve to one exact tenant/company. Exact
  Company `MANAGE` is rechecked server-side for view, draft, and seal actions.
- **Authorization and segregation:** Dedicated permissions are additive, not
  substitutes for scope. Fresh MFA and editor/sealer separation apply at seal;
  named actors and role labels cannot grant authority.
- **Approval, inventory, and audit integrity:** Sealing creates configuration
  and immutable evidence only. It creates no approval decision, source status,
  movement, balance, opening inventory, custody, or financial effect. Draft
  mutations and seal outcomes remain auditable.
- **Atomicity and idempotency:** One locked transaction either creates the exact
  complete revision, memberships, eight readiness records, digest, and terminal
  draft outcome or creates none. Retried requests use version and idempotency
  protection and cannot allocate duplicate or divergent revisions.
- **Phase scope:** Only the bounded Phase I Inventory Control Pilot and the eight
  listed families are included.
- **Recovery:** Before seal, a draft can be corrected or abandoned with history
  preserved. After seal, rollback is forward-only through a higher successor;
  already pinned cohorts remain unchanged.

## Required safeguards

1. Deny unknown permission, family, endpoint capability, actor role, or item
   identity; never infer cohort membership from descriptive attributes.
2. Lock the company revision sequence and exact draft/version during sealing;
   reject stale, duplicate, cross-scope, incomplete, inactive, or digest-divergent
   input with zero sealed output.
3. Recompute the canonical form and digest from normalized records inside the
   seal boundary; cover all eight readiness records and exact selected Item IDs.
   For `PurchaseRequest`, also cover the production resolver identity,
   `isEmergency=false` input, and exact `DEFAULT` / `normal` / no-fallback
   outcome; rederive that outcome during live eligibility.
4. Recheck live permission, exact Company `MANAGE`, active assignments,
   effective dates, editor/sealer separation, and fresh MFA after locking and
   immediately before commit.
5. Validate required named actors and prohibited-actor combinations, including
   the five Opening roles. Do not admit the deployment executor as a draft-selected
   actor or grant.
6. Label readiness UI, exports, and evidence as seal-time evidence, never as
   current or permanent authority. Revalidate all live authorization, SOD, MFA,
   scope, source, and route facts at use time.
7. Keep sealing separate from activation and posting services. It must not call
   family activation, approval submission/decision, opening command, inventory
   ledger, balance, custody, receiving, or financial writers.
8. Require a separate confirmed implementation and evidence gate for downstream
   consumers that pin or use sealed route/readiness facts. This record does not
   claim that route-pin consumption is implemented.

## Implementation and documentation impact

- **Code / architecture:** Add an administrative draft/read/seal service and an
  atomic compiler into the existing sealed revision boundary. Keep runtime
  authorization, routing, activation, and posting services separate.
- **Data / schema:** Add normalized mutable draft relations and append-only or
  immutable family-readiness records linked to the existing revision/digest.
  Schema changes require reviewed migration, rollback considerations, database
  constraints, runtime privilege review, and data-dictionary updates.
- **Workflow / permissions:** Add dedicated view/draft/seal permissions, all
  paired with exact Company `MANAGE`; seal additionally requires fresh MFA and
  editor/sealer separation. Baseline permission grants are limited to configured
  Super Admin and System Admin roles; the role label is never a bypass for live
  assignment, applicable permission, or exact Company `MANAGE` checks.
- **UI / mobile:** Provide a company-context configuration workspace that
  distinguishes editable draft, seal review, immutable revision detail, and
  point-in-time readiness evidence. Disabled states must explain permission,
  scope, MFA, segregation, or validation denial.
- **Reporting:** Readiness exports may attest the exact revision/digest and
  cutoff only; they cannot claim current route or actor authority.
- **Knowledge base / training:** Dunong must assess administrator and UAT
  enablement after the implemented labels, permissions, and navigation are
  verified. No user-facing availability announcement is authorized by this
  record.
- **Tests / UAT:** Require authorization, SOD/MFA, atomic compilation,
  immutability, digest, exact-family, exact-item, successor/pinning, concurrent
  seal, no-side-effect, and truthful-readiness coverage. Purchase Request tests
  must prove standard `DEFAULT` resolution with `isEmergency=false`, no fallback,
  allowed coexistence of an uncertified valid `PR_EMERGENCY` rule, and fail-closed
  resolver/outcome drift. They grant no emergency-scenario UAT credit.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement normalized drafts, compiler, immutable readiness records, permissions, and audit history. | Database / Backend / Security | Before operational configuration entry | Pending |
| Prove atomic seal, exact digest/family/item membership, privilege separation, concurrent retry, and zero activation/posting effects on PostgreSQL. | QA / Security / Database | Before UAT use | Pending |
| Implement and separately verify any downstream route/readiness pin consumer. | Architecture / Backend / QA | Before claiming route-pin enforcement | Separate pending scope |
| Verify responsive draft, review, disabled, conflict, and immutable-detail states. | Frontend / QA | Before UAT use | Pending |
| Assess administrator/UAT guidance from verified implementation. | Dunong | After visible behavior is stable | Pending handoff |

## Evidence

- Parent confirmation of Option A and the exact contract recorded here on
  2026-08-06.
- Parent-confirmed route-context clarification on 2026-08-06: the single
  `PurchaseRequest` snapshot is standard/non-emergency only, uses resolver ID
  `purchase_request_approval_rule_v1` and shared
  `resolvePurchaseRequestApprovalRule` with `isEmergency=false`, accepts only
  `DEFAULT` / `normal` / no fallback, and grants no `PR_EMERGENCY` certification
  or UAT credit.
- Independent council reviewers unanimously recommended Option A. The challenge
  round agreed its strongest property is the separation of mutable preparation
  from immutable operational truth; its principal serious-but-manageable risk is
  that seal-time actor/route evidence could be mistaken for permanent authority
  before downstream route-pin consumers exist. Live revalidation, explicit
  evidence labeling, and a separate consumer implementation gate are therefore
  mandatory.
- Requested Code Spark and GPT-5.4-mini reviewers were unavailable. The council
  used `gpt-5.6-terra`, the closest permitted fallback, without relaxing
  independence, hard gates, or the implementation lock.
- `DEC-0259` for the synthetic, non-authoritative precursor; `DEC-0261` for the
  immutable sealed revision, normalized membership, digest, activation, and
  cohort-pinning boundary; `DEC-0263` and `DEC-0271` for Opening roles,
  executor separation, and no-posting preparation; `DEC-0266` for readiness
  scope; and `DEC-0270` for the eight-family set's seven normalized approval
  families and continuing live action authority.

## Supersession

No supersession. This record extends `DEC-0261` with a controlled authoring and
readiness-evidence boundary. It does not supersede the synthetic-only limit in
`DEC-0259`, the opening cutover controls in `DEC-0263`, or any live authorization,
routing, activation, and posting contract. The Inventory Control Pilot remains
local-only and **NO-GO**; this clarification neither certifies emergency
Purchase Requests nor authorizes UAT, staging, activation, or production use.
