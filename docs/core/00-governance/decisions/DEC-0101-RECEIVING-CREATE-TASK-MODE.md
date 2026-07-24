# DEC-0101 — Receiving Create Task Mode

## Metadata

- Decision ID: `DEC-0101`
- Title: Dedicated full-page Receiving create task mode
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Receiving / Inventory workstream
- Decision Chair: Codex parent agent
- Related phase/module: Phase I — Receiving register and Goods Receipt creation
- Related decision brief: Parent-agent Receiving create-surface review (confirmed 2026-07-24)

## Decision

Replace the Receiving register's create `TaskSheet` with a dedicated full-page task mode at `/receiving/new`. Preserve the existing server action, validation schemas, idempotency key behavior, tenant/company/location authorization, draft-only semantics, audit behavior, and error handling. The new page is an alternate presentation boundary for the same controlled create-draft workflow, not a new endpoint, permission, status transition, or posting shortcut.

## Context

Goods Receipt creation is a multi-line, evidence-aware workflow with Purchase Order selection, ordered/delivered/accepted/rejected/damaged quantities, discrepancy handling, and retry-safe submission. A task sheet is too constrained for the documented full-page task-mode requirements and can create a long stacked or cramped form on desktop and mobile. Moving to a dedicated route provides a focused workflow with clear scope and navigation while allowing the existing server-side action to remain the source of truth.

## Options considered

### Option A — Dedicated `/receiving/new` full-page task mode (selected)

- Summary: Render the existing create form as a focused route with explicit scope context, PO selection, line editor, validation/error summary, idempotency-aware submit, and draft-only completion state.
- Benefits: Supports long multi-line entry, responsive task-first layouts, reliable navigation/refresh behavior, and clear separation from register browsing without duplicating business logic.
- Failure modes: Requires route-level unsaved-work handling, back navigation, mobile layout validation, and consistent deep-link authorization.
- Why selected: It meets the visible-surface and task-mode gates while preserving the proven server action and controls.

### Option B — Keep the create TaskSheet/drawer (rejected)

- Summary: Continue presenting the full workflow over the register in a sheet or drawer.
- Benefits: Smallest UI change and quick return to the list.
- Failure modes: Constrained space for multi-line discrepancy/evidence entry, difficult mobile interaction, long-scroll sheet behavior, and unclear route/deep-link semantics.
- Why rejected: It does not satisfy the approved focused-workspace pattern for long transaction entry.

### Option C — Inline register form or new create API (rejected)

- Summary: Embed the form in the register or introduce a separate create endpoint/service for the new page.
- Benefits: Potentially fewer navigations or a clean new page contract.
- Failure modes: Duplicated business rules, inconsistent idempotency/authorization, accidental draft/posting coupling, and a long stacked operational register.
- Why rejected: It increases control and maintenance risk without operational benefit.

## Hard-gate assessment

- **Authorization and scope:** `/receiving/new` must enforce the same server-side create permission and selected tenant/company/receiving-location scope as the existing action. UI hiding is not authorization; all PO and location reads remain scoped.
- **Workflow/status:** The route may create only a draft Goods Receipt through the existing action. It must not post inventory, close a PO, approve a receipt, or alter receiving lifecycle semantics.
- **Validation and idempotency:** Existing shared schemas, field-level errors, canonical retry key/hash, duplicate replay, conflict behavior, and safe error codes remain unchanged. A selected-PO change must continue rotating the client retry key.
- **Data integrity/audit:** Server action remains the transactional source of truth for receipt/lines, sequence allocation, audit, and rollback. The page must not write directly to the database.
- **Visible-surface truthfulness:** The page must provide working PO selection, line entry, validation, submit, loading, error, denied, and success/draft states; no passive placeholder action area is acceptable.
- **Responsive usability:** Desktop, tablet, and mobile task modes must support multi-line entry, discrepancy fields, keyboard/touch interaction, navigation recovery, and readable scoped context.

## Required safeguards

- Reuse the existing server action and schemas; do not duplicate create logic in a route handler or client component.
- Carry selected tenant/company/location and PO context visibly and server-validate them; never use `All Brands / All Locations` for location-specific receiving.
- Preserve hidden/generated idempotency-key generation, rotation on PO change, safe retry replay, and stable changed-payload conflict behavior without exposing raw technical keys to users.
- Provide unsaved-change/back-navigation protection appropriate to the application shell, but never silently resubmit or regenerate a key in a way that changes retry semantics.
- Keep draft-only copy and actions explicit; provide a clear route back to the register and a link to the authoritative draft detail/next workflow action where applicable.
- Implement loading, empty PO, no-line, validation, denied, stale/closure, server-error, replay-success, and conflict states with user-safe messages. Do not expose stack traces or database errors.
- Keep the register create affordance navigational and permission-aware. Do not retain a hidden or duplicate TaskSheet path that can drift from the new page.
- Add route/component tests and responsive-browser evidence for scope, action submission, idempotency replay/conflict, status invariants, mobile usability, and visible-surface completeness.

## Implementation and documentation impact

- **Code / architecture:** Add the `/receiving/new` page/task-mode route and compose the existing form/action; no new domain service or write endpoint.
- **Data / schema:** No schema change. Existing Goods Receipt idempotency and document-number controls remain authoritative.
- **Workflow / permissions:** No permission or status change; create remains draft-only and server-authorized.
- **UI / mobile:** Replace the create TaskSheet with a dedicated responsive full-page task mode, preserving design tokens, focused entry, and clear context.
- **Reporting:** No report/export behavior change.
- **Knowledge base / training:** Update Receiving create guidance and release notes to reference `/receiving/new`, draft-only submission, and retry-safe behavior after the route is verified.
- **Tests / UAT:** Require existing receiving service tests plus route, authorization, idempotency, visual-surface, responsive-browser, and production-build evidence.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement `/receiving/new` and replace register create TaskSheet navigation | Receiving frontend | Next implementation slice | Confirmed for implementation |
| Verify server action, validation, scope, idempotency, and draft-only parity | Receiving backend + QA | With implementation | Required |
| Add visible-surface and responsive desktop/tablet/mobile tests | QA + Frontend | Before checkpoint | Required |
| Update Receiving UI spec, pending plan, glossary, KB, and release note | Mithi + Dunong | After verification | Required |

## Evidence

- `DEC-0093-GOODS-RECEIPT-CREATE-IDEMPOTENCY.md`: existing retry-safe Goods Receipt create contract.
- `docs/phases/phase-01-procurement-inventory/specs/receiving-ui-spec.md`: documented Receiving create, multi-line, discrepancy, and responsive task-mode requirements.
- `docs/core/04-design/UI_IMPLEMENTATION_STANDARD.md`: focused workspace and visible-surface gates.
- Parent-agent independent product, frontend, security, and QA review on 2026-07-24. Requested Code Spark/GPT-5.4 reviewer identifiers were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing hard gates.

## Supersession

Not superseded. This decision changes only the create presentation boundary; it does not supersede the Goods Receipt workflow, authorization, idempotency, or posting decisions.
