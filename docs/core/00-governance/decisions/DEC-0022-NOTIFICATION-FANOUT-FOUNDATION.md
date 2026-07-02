# Decision Record — Notification Fanout Foundation

## Metadata

- Decision ID: `DEC-0022`
- Title: Notification Fanout Foundation
- Status: `Confirmed`
- Date: 2026-06-30
- Decision owner: Operations + Purchasing + Warehouse + IT
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Notifications, Approvals, Purchasing, and Inventory Controls
- Related decision brief: Bounded workflow notification fanout for approval assignments

## Decision

Implement a bounded in-app notification foundation for approval-assignment events. The first slice creates durable recipient-scoped notification records for Purchase Request submission, Purchase Order submission, and Purchase Order remaining-balance closure requests.

## Context

Phase I workflows already create approval instances, but approvers need a scoped attention record that survives navigation and can be read or archived without changing the source workflow. The implementation must not introduce queueing behavior in this release and must not allow notification actions to approve, post, receive, close, or mutate controlled source records.

## Options considered

### Option A — selected

- Summary: Add in-app notification records with tenant/company/location scope, source entity references, deep links, recipient basis, and idempotent source event keys.
- Benefits: Gives users a reliable work queue foundation while preserving approval, inventory, and purchasing source-of-truth controls.
- Failure modes: Users may expect read/archive actions to complete the underlying approval unless UI labels remain clear.
- Why selected: It is the smallest controlled option that improves workflow visibility without changing source-record authority or requiring a queue.

### Option B — rejected

- Summary: Build broad notification fanout, reminders, escalation, email, preferences, and worker delivery in one slice.
- Benefits: More complete notification coverage.
- Failure modes: Higher delivery, privacy, idempotency, and operational-noise risk; conflicts with the current no-queueing scope.
- Why rejected: Too broad for the stabilization slice and not required before proving the recipient-scoped in-app model.

### Option C — rejected

- Summary: Keep approval inbox only and defer notification records.
- Benefits: Avoids new schema.
- Failure modes: Users lack a persistent notification center and future fanout lacks an idempotent recipient record.
- Why rejected: Phase I needs operational attention visibility for approval assignments.

## Hard-gate assessment

- Tenant, company, and location scope are stored on each notification.
- Notification recipients are resolved from active users, role assignments, and scope assignments.
- Notification read/archive state does not alter approval, purchase, receiving, transfer, inventory, or audit records.
- Source event keys are unique per tenant and recipient to avoid duplicate records on retries.
- The first slice is in-app only and does not introduce queue processing, email delivery, or automated escalation.

## Required safeguards

- Use service-layer recipient resolution and source-record deep links.
- Upsert notifications by tenant, recipient, and source event key.
- Store only safe notification metadata; do not copy confidential source payloads into notifications.
- Keep workflow actions in their source services; notification actions may only mark read or archive.
- Add tests that prove the schema uniqueness, workflow wiring, and real notification inbox page.

## Implementation and documentation impact

- Code / architecture: Add notification service helpers and wire first approval-assignment events.
- Data / schema: Add `Notification` table with recipient, scope, source entity, status, metadata, and idempotency fields.
- Workflow / permissions: No new source workflow authority is granted by notification access.
- UI / mobile: Replace notification preview with a scoped in-app inbox supporting read/archive.
- Reporting: Notification reporting and export delivery remain future hardening.
- Knowledge base / training: Add user-facing notification guidance before release.
- Tests / UAT: Cover notification creation, scoping, read/archive behavior, and no source mutation.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Add broader notification fanout for receiving, transfer, wastage, counts, and adjustments | Mithi / Decision Chair | After Phase I posting workflows stabilize | Partial — wastage and stock-adjustment approval-submission fanout implemented; receiving, transfer, count, and broader exception/status fanout remain deferred |
| Decide reminder and escalation handling without queueing for current release | Operations + IT | Before pilot | Complete — bounded manual in-app scans for approval and project reminders; automated scheduler/email escalation remains deferred |
| Add user-facing notification center guidance | Dunong | Before release notes | Complete — see `docs/knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md` |

## Evidence

- `docs/core/02-controls/NOTIFICATION_AND_ESCALATION_SPEC.md`
- `docs/core/03-data/DATABASE_SCHEMA.md`
- `docs/core/03-data/ERP_DATA_DICTIONARY.md`
- `docs/core/06-reporting/REPORTING_AND_EXPORT_SPEC.md`
- Deliberation consensus by Amihan, Dalisay, Hiraya, and Lualhati selected the bounded in-app foundation.
- User-facing dashboard, My Work, and notification guidance explains that notifications are scoped alerts and do not mutate source records.
- Follow-up deliberation by Dalisay, Hiraya, Lualhati, and Tala selected manual reminder-scan tooling as the current-release no-queue reminder model.
- Approval reminders are generated only by a permissioned manual scan of the current user's server-authorized approval queue; project deadline reminders use the existing permissioned project reminder scan.
- Reminder scans create in-app notification visibility and audit evidence only. They do not approve, reject, post, receive, close, reverse, escalate authority, or mutate source records.
- Targeted tests cover approval reminder date classification, scan wiring, recipient scope, idempotency key pattern, manual UI entry points, and project reminder regression.
- Follow-up deliberation selected operational approval-submission fanout as the smallest safe broader-notification slice.
- Wastage Report and Stock Adjustment submissions now create scoped in-app approval notifications using the same audit-event idempotency pattern as PR, quotation recommendation, and PO approvals.
- Receiving status/exception fanout, transfer status/exception fanout, stock-count review fanout beyond generated adjustment approval, automated scheduler runs, email delivery, and configurable escalation-chain automation remain deferred.

## Supersession

Not superseded.
