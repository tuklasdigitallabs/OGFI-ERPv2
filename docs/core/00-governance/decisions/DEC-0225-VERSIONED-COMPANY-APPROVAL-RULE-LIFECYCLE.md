# DEC-0225 — Versioned company Approval Rule lifecycle

## Metadata

- Decision ID: `DEC-0225`
- Title: Immutable, company-scoped Approval Rule lifecycle
- Status: Confirmed
- Date: 2026-07-26
- Decision owner: Core Administration / Policy Owners
- Decision Chair: Parent agent
- Related phase/module: Phase I — Configurable Approval Engine / Core Administration
- Related decision brief: Approval Rule lifecycle composer, 2026-07-26

## Decision

Approval Rules use an immutable, company-scoped lifecycle: create an inactive rule,
revise it by creating an inactive successor, and atomically activate a validated
version for its route slot. New and revised rules support only ordered role-targeted
steps and server-owned `DEFAULT` or Purchase Request emergency route templates.

Tenant-wide rules and legacy `USER`-targeted versions remain inspectable but are not
mutable through this composer. An active legacy `USER` route makes the migration fail
closed until its authority is inventoried and resolved through controlled policy.

## Context

Core Administration exposed an Approval Rules registry and detail route but no
lifecycle controls, despite the Phase I exit criterion that an administrator can
configure a rule. The prior schema had mutable rule records without lineage,
version, idempotency, or concurrency fields, while approval instances retained a
reference to the selected rule. Most live route consumers use exact company,
transaction type, active state, and priority; generic JSON filters are not evaluated
consistently. A generic builder would therefore advertise controls that do not
reliably change runtime routing and could rewrite the meaning of historical rules.

## Options considered

### Option A — selected: immutable company-scoped successor versions

- Benefits: preserves historical rule definitions and existing approval instances;
  supports reversible, audited changes for future submissions; avoids unimplemented
  routing semantics.
- Failure modes: active legacy `USER` routes require controlled reconciliation;
  role-only routing cannot express a future approved named-signatory exception.
- Why selected: satisfies audit, authorization, recovery, and visible-workflow gates
  without inventing unresolved approval policy.

### Option B — rejected: mutate rule and steps in place

- Benefits: smaller schema and interface change.
- Failure modes: historical rule detail changes after use, concurrent writes can be
  lost, and rollback becomes ambiguous.
- Why rejected: conflicts with required version/change history and trustworthy audit.

### Option C — rejected: generic builder or read-only defer

- Benefits: a generic builder appears comprehensive; deferral avoids migration work.
- Failure modes: branch, amount, category, budget, named-user, and arbitrary filter
  controls are not shared runtime semantics; read-only Administration fails the
  documented configuration and visible-surface gates.
- Why rejected: neither alternative is production-safe for the Phase I requirement.

## Hard-gate assessment

- Tenant/company isolation: mutations are limited to the exact tenant and selected
  company; tenant-wide rules are read-only.
- Server authorization: lifecycle actions require Core Administration authority,
  tenant-role administration authority, selected-company `MANAGE`, and the existing
  privileged-MFA guard.
- Approval segregation: configuration grants no approval authority. Live role,
  permission, scope, source-state, prohibited-actor, and no-self-approval checks remain
  authoritative when a document is submitted or acted on.
- Audit/history: there is no hard deletion or published-version rewrite. Lineage,
  version, actor, reason, before/after state, and lifecycle action are retained.
- Consistency/idempotency: company locking, lifecycle compare-and-set, scoped
  idempotency, an active-route-slot constraint, and one transaction protect writes.
- Recovery: a retained validated version may be reactivated through a new audited
  action; existing approval instances and copied instance steps never change.
- Phase discipline: generic filters, named approvers/backups, group or parallel modes,
  thresholds, effective dates, delegation, and tenant-wide mutation remain deferred.

## Required safeguards

- Add rule lineage, version, route key, lifecycle concurrency, updated timestamp, and
  idempotency fields through an additive reviewed migration.
- Seal each new definition in its construction transaction. PostgreSQL rejects later
  rule-definition changes, step insert/update/delete, rule deletion, and truncation;
  lifecycle state changes remain the only permitted in-place updates.
- Enforce composite tenant/company references for successors and lifecycle intents,
  plus root and successor lineage invariants in PostgreSQL.
- Enforce one active company route per tenant, company, transaction type, and
  server-owned route key; preflight duplicate active slots and active legacy `USER`
  targets without selecting or rewriting a winner.
- Create and revise only as inactive. Activation validates the complete version and
  atomically swaps the exact route slot.
- Accept only contiguous required sequential steps beginning at one and exactly one
  active, tenant-visible role target per step. Each role must carry the route's
  required approval permission and have an active/effective selected-company member.
- Generate route filters on the server. Never accept arbitrary client JSON.
- Require a reason and idempotency key/hash; reject stale lifecycle versions,
  different-payload retries, invalid roles, absent MFA, and tenant-wide writes.
- Preserve `APPROVAL_RULE_NOT_CONFIGURED` behavior where no active route exists.

## Implementation and documentation impact

- Code / architecture: dedicated catalog and lifecycle service actions; browser forms
  remain untrusted composers.
- Data / schema: additive version/lineage/concurrency/idempotency fields and a partial
  unique active-route constraint, with PostgreSQL rehearsal required.
- Workflow / permissions: changes affect future submissions only; existing approval
  instances remain unchanged.
- UI / mobile: authorized Create, Revise, Activate, and Deactivate controls expose only
  supported route templates and role steps; tenant-wide/legacy states explain why
  they are read-only.
- Reporting: Audit Trail records lifecycle events with route, lineage, reason, and
  idempotency correlation.
- Knowledge base / training: explain company-only, inactive-first, role-only behavior
  and the deferred controls.
- Tests / UAT: cover scope/MFA, route and role validation, lineage, atomic swap,
  active-slot conflict, CAS, idempotency, legacy fail-closed behavior, unchanged
  instances, rollback, audit, responsive states, and real PostgreSQL behavior.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement migration, lifecycle service, actions, and composer | Parent implementation agent | Current phase | Implemented source checkpoint; external gates open |
| Update source-of-truth, enablement, glossary, release note, and pending plan | Parent / documentation owners | After verified behavior | Complete for source checkpoint |
| Rehearse migration, active-slot concurrency, and rollback on disposable PostgreSQL | QA / release owner | Before production-readiness claim | Open release gate |
| Confirm named approvers, tenant-wide ownership, generic predicates, and advanced routing modes | Management / policy owner | Before expanding the composer | Open decision |

## Evidence

- `ERP_APPROVAL_MATRIX.md`, `SECURITY_AND_AUDIT_MODEL.md`, and the Phase I technical
  build plan establish configurability, version/audit history, authorization, and the
  administrator-configuration exit criterion.
- The Prisma schema and live approval services show historical rule references,
  decentralized exact-company lookup, and only a narrow Purchase Request emergency
  filter distinction.
- Independent Product, Architecture, and Security deliberation plus a targeted
  challenge round converged on this bounded option. Requested Code Spark and GPT-5.4
  subagent models were unavailable; the closest permitted GPT-5.6 specialists were
  used and recorded.
- Prisma validation/client generation, package typechecks, web lint, 58 focused web
  tests, 34 database-package tests, the full 1,357-test web regression, the 20-case
  authorization manifest, E2E typecheck, and an isolated production build pass.
  The registered PostgreSQL lifecycle specification remains unexecuted because the
  required disposable-database administrator sentinel is unavailable.

## Supersession

Not superseded.
