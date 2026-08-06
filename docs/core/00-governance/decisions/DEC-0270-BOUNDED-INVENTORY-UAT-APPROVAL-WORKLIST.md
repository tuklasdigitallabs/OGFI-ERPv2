# DEC-0270 — Bounded Inventory UAT Approval Worklist

## Metadata

- Decision ID: `DEC-0270`
- Title: Bounded Inventory UAT Approval Worklist
- Status: `Confirmed`
- Date: 2026-08-03
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related phase/module: Phase I Inventory Control Pilot UAT; normalized approvals
- Related decisions: `DEC-0050`, `DEC-0051`, `DEC-0052`, `DEC-0244`,
  `DEC-0247`, `DEC-0258`, `DEC-0260`, `DEC-0261`, `DEC-0265`, `DEC-0268`
- Related decision brief: Parent-confirmed bounded Inventory Control UAT Approval
  Worklist, following Backend, Security, and QA deliberations

## Decision

Provide one server-owned, role-scoped Approval Worklist for bounded Inventory
Control UAT only. It may show and action only live-eligible work for these exact
normalized document families: `PurchaseRequest`, `QuotationRecommendation`,
`PurchaseOrder`, `InventoryTransfer`, `StockCountAttemptReview`, `WastageReport`,
and `StockAdjustment`.

This is not global normalized-routing activation. `APPROVAL_ROUTING_V1_ENABLED`
remains false, every other approval family remains unavailable, and the worklist
must neither fall back to a legacy/parallel queue nor create an approval ledger,
inventory movement, stock balance, financial commitment, receiving, payment, or
journal effect. The authoritative typed family command remains the only action
path and owns any separately documented source effect.

## Context

The Inventory Control Pilot requires a usable UAT decision surface for its
connected procurement and inventory chain, but the full normalized Approval Inbox
is deliberately disabled pending all-family parity, finance-policy resolution,
cutover, and release evidence. Exposing the global Inbox would falsely imply
availability for deferred families; retaining only notifications or reminder scans
would not give eligible UAT approvers a complete, actionable, role-scoped queue.

The bounded worklist closes that discoverability gap without broadening the
feature flag or changing the authoritative workflow model. It is a partial
visibility surface, not an authorization source and not an inventory posting
surface.

## Decision brief and scorecard conclusion

**Question.** Can the Inventory Control Pilot expose an actionable approval
surface for UAT without activating the global routing feature or weakening its
authorization, inventory, and audit controls?

**Confirmed conclusion.** Yes, only as Option A's exact seven-family,
server-owned, role-scoped worklist. Backend, Security, and QA deliberations found
the option acceptable only with live action-time eligibility/scope/SOD and MFA
revalidation, locked source/lineage/graph/current-step state, version/CAS
transitions, non-enumerating unavailable outcomes, and no worklist-owned ledger
or source effect.

**Scorecard result.** Option A is the only option that passes all applicable
hard gates: it supplies a usable UAT surface while preserving tenant/scope
isolation, server authorization, segregation, immutable approval/audit history,
inventory-ledger isolation, transaction consistency, phase scope, and a rollback
path (disable the bounded gate before admitting new work; settle already admitted
records through their existing authoritative workflow). Option B fails phase
scope and global activation gates; Option C fails the usable-work-surface need;
Option D fails single-authority and audit-integrity gates. The parent agent and
user explicitly confirmed Option A on 2026-08-03.

## Options considered

### Option A — selected: allowlisted bounded UAT worklist

- **Summary:** Expose the seven exact Phase I families through one server-owned,
  paginated worklist and detail/action surface, gated independently from global
  routing and only for admitted UAT scope.
- **Benefits:** Gives UAT approvers a real connected work surface, preserves the
  active normalized step as the single authority, and keeps deferred families
  unavailable rather than silently hidden behind a global activation.
- **Failure modes:** A registry expansion, stale eligibility projection, source
  change after list read, missing MFA, or a UI that implies complete coverage
  could expose an ineligible or misleading action.
- **Why selected:** It is the smallest usable UAT surface that preserves the
  pilot's role/scope and inventory controls while retaining the global no-go
  posture.

### Option B — rejected: enable `APPROVAL_ROUTING_V1_ENABLED` globally

- **Summary:** Turn on the existing normalized Inbox for all registered families.
- **Benefits:** One broad surface and less feature-gate branching.
- **Failure modes:** Would expose unready finance, workforce, and other families,
  bypass the outstanding all-family activation gates, and misrepresent UAT scope.
- **Why rejected:** Global activation is not authorized by this decision.

### Option C — rejected: retain notifications/reminders with no worklist

- **Summary:** Keep the current partial notification/reminder signals and require
  approvers to find work elsewhere.
- **Benefits:** No new visible approval surface.
- **Failure modes:** Role-scoped notifications are intentionally absent, work is
  not reliably discoverable, and UAT cannot exercise the connected decision path.
- **Why rejected:** It does not supply the confirmed UAT worklist behavior.

### Option D — rejected: create a pilot-specific approval queue or ledger

- **Summary:** Copy approval assignments or actions into pilot queue/ledger rows.
- **Benefits:** May appear simple to query or report.
- **Failure modes:** Creates a second workflow authority, stale recipient copies,
  duplicate action outcomes, and misleading inventory/approval reporting.
- **Why rejected:** The active `ApprovalInstanceStep` and immutable approval/audit
  history remain authoritative; no new approval ledger is authorized.

## Hard-gate assessment

- **Tenant, company, brand, and location isolation:** List, detail, and action
  queries derive all scope from the authenticated actor and locked source
  projection. Cross-tenant/company, forged location, and out-of-scope records
  fail closed.
- **Server-enforced authorization:** Visibility is a server-derived projection;
  every action rechecks live permission, active role/assignment, effective dates,
  exact source scope, step state, and family allowlist inside the decision
  boundary. UI presence never grants authority.
- **Segregation of duties:** Recheck no-self and every family-specific prohibited
  actor rule at action time. This includes transfer requester/custody separation,
  count creator/counter/line-entry exclusion, and existing procurement/inventory
  approval restrictions. Sensitive inventory decisions require current MFA at
  action time; stale or failed MFA denies without mutation.
- **Inventory and money integrity:** The worklist makes no ledger, balance,
  custody, commitment, receipt, payment, or journal mutation. Any source effect
  remains only in the separately controlled typed command and its transaction.
- **Atomicity, idempotency, and recovery:** Action processing locks the exact
  source, required lineage, approval instance, and ordered current step; it uses
  source/version/step compare-and-set predicates. Conflicts, stale projections,
  revoked authority, or changed source lineage create no second outcome. Existing
  cancellation/reversal and immutable audit history remain the recovery path.
- **Phase discipline:** The allowlist is confined to the confirmed Phase I
  Inventory Control UAT chain. No finance, workforce, projects, or other family
  is admitted.

## Required safeguards

- Use a closed server-side family allowlist exactly matching this decision. Any
  unknown, inactive, feature-disabled, unregistered, or non-allowlisted family
  returns a stable unavailable result and yields no record existence disclosure.
- Build worklist rows from server-owned source projections only. The client must
  not provide or choose source status, scope, document family, permission,
  approver, route, version, or decision eligibility.
- Revalidate live source eligibility, tenant/company/brand/location scope,
  permission, role/assignment/effective-date status, no-self/prohibited actors,
  current MFA where required, source lineage, active instance, and current step
  after acquiring the required locks and before mutation.
- Pin and compare the source version (or documented `updatedAt` compatibility
  value where no version exists), applicable lineage version, approval instance
  version/state, and current step version/state. Use CAS for the exact source,
  graph, and step transition; never decide from a list-page snapshot.
- Preserve the documented lock order for each family. A stale, mismatched,
  cancelled, terminal, missing, or concurrently changed source/graph/step must
  fail closed with no source, approval, audit, notification, inventory, or ledger
  mutation beyond the already-defined safe denial handling.
- Apply current-MFA checks to sensitive inventory approvals, including transfers,
  stock-count review, wastage, and stock adjustments, according to the existing
  sensitive-action policy. MFA cannot be cached from page display.
- Paginate and filter server-side. Show only work the current actor may currently
  review; do not use notifications as authority or persist per-role recipient
  copies. A selected detail that becomes unavailable must show a non-enumerating,
  truthful unavailable/stale state.
- The UI must name the bounded UAT scope and state that only eligible in-scope
  approval work is shown. It must not display a global total, claim all approvals
  are visible, or imply that unavailable families have no pending work.
- Do not add Returned, History, Audit, or a second decision surface as passive
  worklist tabs. Source/audit history remains in its authoritative record view.
- Keep the global flag false and maintain a distinct denial-only bounded-worklist
  gate. Removing the allowlist, expanding a family, or enabling global routing
  requires a new confirmed material decision and evidence review.

## Implementation and documentation impact

### August 6, 2026 evidence-lane hardening addendum

The Decision Chair accepted the independent Architecture, Security, and QA
challenge conclusion that the bounded worklist needs a separate hardened
automation-evidence runtime. This does not change the seven admitted families or
authorize hosted/production activation.

- The exact evidence identity is an optimized `NODE_ENV=production` build with
  `APP_ENV=uat`, `CI=true`, `AUTH_MODE=local`, an explicit hardened-UAT switch,
  the bounded-worklist switch, and global normalized routing exactly false.
- Authentication security posture is separate from environment identity. This
  exact UAT lane receives production-strength secret, encryption, throttle,
  trusted-proxy, HTTPS-origin, and `__Host-` Secure-cookie controls. Ordinary
  demo UAT remains non-hardened and is not evidence. SMTP remains outside this
  manual local-account evidence lane.
- A global/bounded flag collision fails closed; it never falls through to the
  global Inbox. Production and staging cannot enable the bounded gate.
- Bounded detail and action must use the normalized eligible-step query, filtered
  by approval ID and the server-owned family allowlist, as their first record
  read. Typed actions must repeat normalized authority checks inside their
  existing locked transactions.
- The evidence runner must attest a nonce-bound disposable database, terminate
  its one-shot provisioning broker, scrub setup credentials before starting
  Next, and independently verify teardown and zero adjacent effects.

This addendum is implemented only through the source prerequisite boundary.
Executable PostgreSQL and trusted-TLS browser evidence remains mandatory before
the worklist receives UAT admission credit.

### August 6, 2026 reviewed-state integrity addendum

The Decision Chair accepted Architecture's signed-token recommendation after an
independent QA and UX challenge found that transactional source locks alone do
not prove the approver reviewed the state ultimately decided. The bounded lane
therefore requires a short-lived, domain-separated HMAC review token over one
closed, typed projection for each of its seven families.

- The token binds the tenant, company, actor, live authentication session,
  approval instance, current normalized step, assigned user/role, required
  permission, routing schema version and fingerprint, source identity/revision,
  and a SHA-256 digest of the complete canonical review snapshot. It contains no
  commercial display values and expires after fifteen minutes.
- The browser submits only the approval ID, requested decision, remarks,
  optional supported evidence reference, and opaque review token. It does not
  choose the family, scope, step, source version, permission, or dispatcher.
- Signature, schema, expiry, actor/session/scope, and approval binding are
  checked before accepting the command. Each typed family handler must then
  recompute and compare the step/source revision and canonical review digest
  inside its existing locked transaction before any decision or side effect.
- A changed line, evidence/policy fact, source lineage, source revision, current
  step, assignment, or expired review produces the single user-safe
  `APPROVAL_REVIEW_STALE` outcome with zero decision, audit, notification,
  ledger, balance, custody, or commitment mutation.
- The review projection is exhaustive and discriminated by the seven admitted
  families. It shows complete material lines and decision facts; mixed-UOM
  lines are never collapsed into a misleading quantity. The inbox uses a
  separate lightweight batch projection and never hydrates full detail per row.

This stateless design adds no schema or second approval record. A persisted
rendered-review table was rejected because it would add retention and
source-of-truth ambiguity without being required for the current UAT control.

### August 6, 2026 local implementation evidence checkpoint

The seven-family typed review and decision boundary is implemented locally. This
checkpoint records implementation and executable evidence; it does not authorize
UAT admission, hosted activation, or release.

- Each review token is domain-separated, signed, and valid for at most fifteen
  minutes. It binds the actor, authenticated session, tenant/company, approval
  instance and step, assigned user/role, required permission, routing
  fingerprint, source identity/revision, and canonical review digest. The raw
  token is not retained in audit history.
- The selected review presents the material typed facts for all seven admitted
  families, including complete procurement lines and quotation comparisons,
  identifiable evidence, inventory value/date facts, and stock-count
  attempt/blind/freeze/counter/recount lineage. A stale review is terminal: all
  decision actions are disabled, draft remarks remain available in the browser,
  and the approver must reload the current review. A successful decision returns
  durable success feedback on the worklist.
- All thirteen admitted decision variants run at PostgreSQL `SERIALIZABLE`
  isolation and use the transition-aware advisory aggregate fence. The same fence
  is used by Purchase Request comment writers and controlled-evidence writers so
  a concurrent review-relevant insert cannot silently escape the reviewed
  snapshot. Writers that are valid after a stable decision or return transition
  remain allowed; the fence prevents the review/transition race rather than
  freezing the source permanently.
- Quotation Recommendation review additionally acquires the parent
  `QUOTATION_REQUEST` aggregate fence before it enumerates and locks the sorted
  child quotations. `createSupplierQuote` uses the same transition-aware parent
  fence. An entirely new quote therefore cannot be inserted during, or race, a
  pending recommendation review, while valid quote lifecycle actions after a
  stable decision or return remain available.
- Serialization conflicts are mapped from SQLSTATE `40001`, including the
  Prisma error metadata path, to the stable user-safe
  `APPROVAL_REVIEW_STALE` outcome. Review verification is recorded in the same
  transaction as the decision, with the source revision, canonical digest,
  routing fingerprint, and token timing metadata but without the opaque token.
- Final current-source focused approval review validation passes **139/139**.
  Web lint and TypeScript checking pass, and the Docker optimized production
  build passes through image export and unpack. The local web container was
  recreated from that image without recreating PostgreSQL and returns a healthy
  in-container `/health` response. The production-authenticated Nginx-to-Caddy
  proxy/runner contract passes 2/2 from the clean image without receiving browser
  execution credit. A real disposable PostgreSQL
  Purchase Request and Quotation Recommendation review-versus-writer matrix
  passes **5/5**; its first
  execution exposed and corrected an integer advisory-lock overload mismatch and
  Prisma `void` raw-query deserialization, then the corrected path passed.
- The post-security-review fence/quotation/approval subset passes **90/90** and
  is included in the final **139/139** focused result. Both two-order Quotation
  Recommendation PostgreSQL cases pass with one decision, one review audit, one
  outcome audit, one notification, an unchanged one-quote set, and zero writer
  audit, inventory-ledger, or balance effect.
- The authorization-valid seven-family disposable PostgreSQL matrix passes
  **7/7**, including the corrected Purchase Order canonical projection with
  complete live location-scope metadata. All 151 migrations, migration-ledger
  live/drift checks, seed, throttle probes, append-only checks, pilot bootstrap,
  and verified teardown pass. Trusted-TLS responsive browser execution with
  named roles and the remaining release gates are still mandatory. The Inventory
  Control Pilot and Phase I remain **NO-GO**.

The requested Code Spark and GPT-5.4-mini subagent models were unavailable for
this checkpoint. GPT-5.6 specialist fallbacks performed the independent Backend,
Security, QA, and UI/UX work and review without relaxing the decision protocol or
hard gates.

- **Code / architecture:** Add a distinct bounded-UAT availability gate and one
  shared server projection/action adapter. Reuse canonical typed family commands;
  do not duplicate decision logic or introduce a pilot ledger.
- **Data / schema:** No new source-of-truth approval, inventory, or financial
  ledger is authorized. Any schema need requires separate migration review and
  data-dictionary assessment.
- **Workflow / permissions:** Only the seven listed families are visible/actionable
  when the actor is live eligible. Existing family-specific SOD, source/version,
  step, scope, and MFA controls are mandatory.
- **UI / mobile:** `/approvals` becomes a clearly labeled partial Inventory
  Control UAT worklist when its bounded gate is enabled; otherwise it stays
  truthfully unavailable. It uses server pagination, selected-record detail, and
  mutually exclusive permitted actions. Non-admitted families remain unavailable,
  not silently represented as cleared work.
- **Reporting:** Worklist counts are scoped operational projections only. They are
  not approval-ledger totals or inventory/financial reporting facts.
- **Knowledge base / training:** Dunong must assess a short UAT approver handoff
  only after the visible implementation and exact labels are verified. No
  user-facing how-to, release note, or training material is authorized yet.
- **Tests / UAT:** Require live eligibility/scope/SOD/MFA revocation cases;
  allowlist/unavailable-family non-enumeration; server pagination; stale
  source/version/lineage/step conflicts; concurrent exactly-once decision; no
  ledger/movement/balance/commitment effect; desktop/tablet/mobile states; and
  truthful partial-visibility copy.

### August 6 hosted-authorization follow-up

Exact-SHA run `31108885996` exposed a Stock Adjustment final-approval versus
cancellation race that could return a raw PostgreSQL serialization failure. The
approved correction does not alter approval authority, status semantics, MFA,
segregation, inventory posting, or the bounded seven-family scope. Cancellation
now acquires the same Stock Adjustment decision-aggregate fence as approval
before the shared producer barrier and source/approval locks. The canonical lock
order is:

`decision aggregate fence -> producer barrier -> source -> approval graph`

Any residual serialization abort at the reviewed-approval transaction boundary
is returned as `APPROVAL_REVIEW_STALE`; database codes are not exposed. The
associated MFA and Item-parent changes are test-fixture corrections only: they
replace obsolete mocks/order with real active MFA, role, and company-management
authority. A fresh disposable PostgreSQL run applied all 151 migrations and
passed the affected three files **16/16**, including the adversarial approval /
cancellation race with no inventory movement and safe loser containment.
Independent challenge review then required direct stock-neutrality assertions;
the race was rerun **2/2** on another fresh 151-migration database and proved
zero `InventoryMovement` and `InventoryBalance` rows for both possible terminal
outcomes, followed by verified database teardown.

This follow-up changes no visible user workflow or policy, so no glossary,
knowledge-base, training, or user-facing release-note update is required. Hosted
exact-SHA authorization and browser evidence remains required before UAT credit.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement the bounded gate, projection, action path, and deny-by-default family boundary. | Backend / Frontend | Before bounded UAT worklist exposure | Implemented locally; final current-source focused suite passes 139/139, lint/typecheck pass, and the Docker optimized build completes through image export |
| Verify lock/CAS, live scope/SOD/MFA, no-ledger-effect, and concurrency cases against PostgreSQL. | QA / Security | Before UAT admission | Complete for this bounded worklist: seven-family acceptance passes 7/7 and the separate Purchase Request/Quotation Recommendation writer-concurrency matrix passes 5/5 with verified teardown |
| Verify desktop, tablet, and mobile partial-visibility states with named UAT roles. | QA / UAT lead | Before UAT execution | Pending |
| Assess approved, implemented behavior for an approver UAT guide. | Dunong | After UI verification | Handoff required; trusted-TLS named-role UI evidence still pending |
| Reassess global routing only under its existing all-family activation gates. | Product Owner / Release Board | Separate future decision | Deferred |

## Evidence

- Parent confirmation of the bounded Inventory Control UAT Approval Worklist.
- Completed Backend, Security, and QA deliberations supplied to the Decision
  Chair; their hard-control requirements are incorporated above.
- Local focused evidence on August 6, 2026: final current-source approval review
  coverage passes 139/139, web lint and typecheck pass, the Docker optimized
  build completes through image export and unpack, and the 5/5 disposable-
  PostgreSQL Purchase Request plus Quotation Recommendation review/writer matrix
  passes after correcting the discovered advisory
  lock overload and raw-query deserialization defects.
- Security follow-up evidence: the parent Quotation Request fence is shared by
  recommendation review and quote creation, the focused
  fence/quotation/approval subset passes 90/90, and both real two-order
  PostgreSQL cases pass without a new quote or adjacent audit/inventory effect.
- Final database acceptance evidence: seven families pass 7/7 against all 151
  migrations. The first Purchase Order attempt failed closed on an over-broad
  nested canonical projection; explicit scalar selection and complete location
  scope metadata corrected it, and the final current-source rerun passes with
  zero approval-only inventory movement or balance effect and verified teardown.
- `DEC-0050` for role-scoped authoritative work, live eligibility, bounded
  notification behavior, and decision CAS.
- `DEC-0051`, `DEC-0052`, and `DEC-0244` for typed canonical decisions and the
  still-disabled global routing posture.
- `DEC-0247` for the closed writer perimeter and producer/source-locking fences.
- `DEC-0258`, `DEC-0260`, `DEC-0261`, `DEC-0265`, and `DEC-0268` for pilot scope,
  transfer/count semantics, sealed classifier and intent/version controls,
  custody/MFA fence, and wastage controls.
- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` and
  `docs/core/04-design/UI_UX_WORKSPACE_AUDIT.md` for the previously truthful
  feature-disabled Inbox posture and visible-surface gates.

## Supersession

No supersession. This decision is intentionally narrower than, and does not
activate, the global routing path documented by `DEC-0244`, `DEC-0247`, and
`DEC-0051`.
