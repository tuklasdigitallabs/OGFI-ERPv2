# DEC-0035 — Phase II F&B Workflow Control Policy

- **Status:** Confirmed product and control decision.
- **Date:** 2026-07-06
- **Owner:** OGFI ERP Product Governance
- **Related phase/module:** Phase II — Restaurant Operations and Food Cost
- **Related decisions:** `II-008`, `II-009`, `II-010`

## Decision

OGFI ERP Phase II will use F&B-standard controlled workflows: immutable recipe versions, separate menu-price decision records, correction-only operational edits after submission, and server-enforced finite state transitions. No recipe, menu-price, branch checklist, food-safety, incident, or maintenance workflow may rely on direct in-place status mutation from the UI.

## Context

Phase II had read-only recipe costing plus create/review/terminal actions for branch operations, food safety, incidents, and maintenance. Broader CRUD required a decision because direct edits could weaken recipe cost history, menu-pricing governance, QA traceability, branch compliance evidence, and audit controls.

## Confirmed Policy

### Recipe And Menu Pricing

- `Recipe` remains the scoped master record.
- Recipe costing changes are made through immutable `RecipeVersion` records.
- Published versions are never edited in place.
- A cost-impacting edit creates a new draft version that may be submitted, reviewed, approved, published, returned, rejected, cancelled, archived, or superseded.
- Publishing a recipe version must be a protected server action with permission, scope, no-self-approval where approval is required, reason/evidence, audit, and concurrency protection.
- Menu-price changes are not automatically applied from recipe cost changes.
- Menu pricing uses a separate menu-price decision/proposal workflow and effective-dated immutable `MenuPrice` rows.
- Historical recipe versions, sales analysis, and food-cost reports keep the effective version and price basis used at the time.

### Operational Corrections

- Branch checklists, food-safety logs, incidents, and maintenance tickets may be created and then moved through controlled workflow actions.
- After submission, broad in-place editing is not allowed.
- Corrections use explicit correction/revision records or correction transitions with reason, evidence where required, actor, approver where required, and audit history.
- Terminal or reviewed records may only be changed through a controlled reopen/correction path; they are never silently overwritten.
- Operational correction actions do not mutate purchasing, inventory, finance, or recipe source records.

### Intermediate Statuses

- Intermediate statuses are allowed only when backed by an explicit server-side transition action.
- A status must not be shown as actionable if no current role-scoped action can move a record into or out of it.
- Transition policy is the source of truth for allowed actions, permissions, evidence, reason requirements, terminal behavior, and idempotency.
- Every status change must be emitted through a controlled transition service or equivalent domain service command with actor, action, from status, to status, reason/evidence, idempotency where applicable, and audit.
- Invalid, duplicate, stale, or unauthorized transitions fail atomically with stable user-safe error codes.

## Options Considered

### Option A — selected: immutable versioning plus transition-ledger workflows

- **Benefits:** Preserves F&B costing history, pricing governance, QA evidence, auditability, branch workflow clarity, and rollback paths.
- **Failure modes:** Transition drift between DB, service, and UI; stuck intermediate states; duplicate publish or correction retries.
- **Why selected:** Best satisfies operational control, audit, scope isolation, and maintainability without replacing the modular monolith.

### Option B — rejected: direct CRUD with edit reason and audit note

- **Benefits:** Faster to build and familiar to users.
- **Failure modes:** Silent cost drift, weak forensic history, unclear menu-price basis, and higher abuse risk.
- **Why rejected:** Does not satisfy F&B control expectations for recipe costing, food safety, and compliance workflows.

### Option C — rejected: external BPM/workflow engine

- **Benefits:** Powerful workflow routing.
- **Failure modes:** New platform dependency, deployment complexity, integration risk, and broader rollback burden.
- **Why rejected:** Too large for the current modular-monolith phase and not needed for the bounded workflow set.

## Hard-Gate Assessment

- Tenant, company, brand, and location scope remain mandatory on new workflow records.
- Authorization is enforced in services before write actions.
- Self-approval is blocked for approval-required recipe, menu-price, correction, and closure actions.
- No recipe/menu/operational transition posts inventory or finance effects unless a separate approved module owns that posting.
- Audit history is append-only; material records are superseded, corrected, cancelled, or archived, not hard-deleted.
- Transition commands use transactions and idempotency/concurrency guards where retries or double-clicks can occur.
- The decision remains inside Phase II restaurant operations and food-cost scope.
- Rollback is feature-level: disable new transition endpoints while preserving added history rows.

## Required Safeguards

- Add a shared transition policy registry consumed by services, UI metadata, and tests.
- Hide or disable any intermediate status with no reachable transition for the current user and record state.
- Add append-only transition/history records for recipe versions, menu-price decisions, and operational corrections.
- Preserve compatibility with existing read/report/export paths during additive rollout.
- Add tests for allowed and denied transitions, no self-approval, idempotent retry, concurrent publish/correction, terminal-state guardrails, and audit creation.
- Add UAT scripts proving create, submit, review, approve/publish, correction, cancel/reject, and reporting behavior by role and scope.

## Implementation Impact

- **Code / architecture:** Add shared workflow transition policy helpers and domain service commands. Route handlers and server actions must delegate to these commands.
- **Data / schema:** Additive Prisma migration for recipe transition history, menu-price decisions, operational correction records, and transition metadata.
- **Workflow / permissions:** Add recipe edit/submit/review/approve/publish/archive, menu-price decision, and operational correction permissions.
- **UI / mobile:** Show action-oriented buttons and modals only for permitted reachable actions.
- **Reporting:** Reports retain effective recipe, menu-price, correction, and transition history without replacing source records.
- **Knowledge base / training:** Add role-based guidance for recipe changes, price decisions, operational corrections, and status meanings.
- **Tests / UAT:** Cover happy path, denial, invalid transition, duplicate retry, concurrent attempts, audit, and source-record immutability.

## Follow-Up Actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement additive schema and transition policy registry | Engineering | Phase II implementation resume | Implemented |
| Implement recipe version commands and menu-price decision commands | Engineering | After schema foundation | Implemented |
| Implement operational correction commands for branch ops, food safety, incidents, and maintenance | Engineering | After shared transition foundation | Implemented |
| Update UAT and knowledge-base materials | Product / Enablement | Before Phase II UAT | In progress |

## Evidence

- User confirmation on 2026-07-06 to use best-practice F&B industry standard.
- Council review by Dalisay, Hiraya, Ligaya, and Lualhati.
- `docs/phases/phase-02-restaurant-operations-and-food-cost/implementation/PHASE2_DECISION_REGISTER.md`
- `docs/phases/phase-02-restaurant-operations-and-food-cost/workflows/recipe-management-workflow.md`
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- `packages/database/prisma/schema.prisma`
