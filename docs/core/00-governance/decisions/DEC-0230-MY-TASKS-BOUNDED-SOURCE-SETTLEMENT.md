# DEC-0230 — My Tasks bounded source settlement

## Metadata

- Decision ID: `DEC-0230`
- Title: My Tasks bounded source settlement
- Status: `Confirmed and implemented — hosted cancellation and tuning gates pending`
- Date: 2026-07-26
- Decision owner: OGFI ERP Product Governance
- Decision Chair: Codex parent agent
- Related phase/module: Phase I / Overview / My Tasks
- Related decision brief: Workspace 1 next-implementation reconciliation after `fabeca6`

## Decision

Bound every enrolled My Tasks source at the presentation boundary with a validated deadline and process-wide admission cap. A timeout, saturation, or exception makes that named source unavailable; the page may retain healthy-source items but must withhold its total and continuation cursor.

Timed-out work retains its admission slot until it actually settles and emits a late-completion event. This checkpoint does not claim database cancellation or leak-free termination.

## Context

`getMyTasksPage` currently uses bare `Promise.allSettled` across enrolled source adapters. Its settled-error branch correctly produces a partial page, but a never-settling database or service promise prevents that branch and the entire page can wait indefinitely. This contradicts the existing contract that one unavailable source must not suppress healthy tasks or become a false zero.

The established Overview source collector already demonstrates bounded presentation settlement, process-wide admission, retained capacity until true settlement, and redacted telemetry. My Tasks needs the same safety properties without changing any source-owned task eligibility, ordering, authorization, or action authority.

## Options considered

### Option A — selected: bounded per-source settlement with retained admission

- Summary: use a 2,500 ms default and 3,000 ms maximum presentation deadline, a process-wide 32 default and 64 maximum in-flight cap, named unavailable-source outcomes, and redacted source/assembly telemetry.
- Benefits: returns healthy tasks within a bound, preserves the current partial-page safety contract, caps accumulated late work, and exposes operational evidence without sensitive payloads.
- Failure modes: an underlying read can continue after presentation timeout; permanently stuck reads can retain capacity until process recovery; overly aggressive deployment values can create false partial pages.
- Why selected: it is the smallest reversible option that fixes the current indefinite presentation wait while failing closed about completeness.

### Option B — rejected: route-only timeout or early admission release

- Summary: let the route/infrastructure time out, or return at a deadline and immediately release capacity.
- Benefits: smaller local implementation and faster apparent capacity recovery.
- Failure modes: route timeout loses source attribution and the safe partial page; early release permits unbounded accumulation of abandoned reads.
- Why rejected: it does not preserve the documented My Tasks partial-source contract or protect process/database capacity.

### Option C — rejected: sequential reads or broad shared-source refactor

- Summary: serialize adapters, or refactor the accepted Dashboard collector into a new shared abstraction before fixing My Tasks.
- Benefits: sequential execution reduces instantaneous concurrency; a shared primitive could reduce future drift.
- Failure modes: sequential reads compound latency and still hang; a broad refactor risks the accepted Dashboard behavior and enlarges this checkpoint.
- Why rejected: neither is the smallest safe correction. Shared extraction may be reconsidered after both contracts have executable evidence.

## Hard-gate assessment

- Tenant, company, brand, and location authorization remains inside each existing source service and is not replaced by the aggregator.
- Timeout, saturation, and exception never become an empty successful source or a zero total.
- Any partial response has `totalCount = null`, `nextCursor = null`, and `isComplete = false` so recovered rows cannot be skipped.
- No task eligibility, priority, due-date, status, actor, href, permission, or action authority changes.
- Telemetry contains only the closed source type, outcome, timestamps/duration, and aggregate counts; it contains no record identifiers, user data, query text, payloads, stack traces, or database errors.
- Invalid deployment configuration fails closed.

## Required safeguards

- `MY_TASKS_SOURCE_DEADLINE_MS`: integer, default `2500`, range `1..3000`.
- `MY_TASKS_SOURCE_MAX_IN_FLIGHT`: integer, default `32`, range `1..64`.
- Closed source outcomes: `EXCEPTION`, `TIMEOUT`, `LATE_COMPLETION`, and `SATURATED`; assembly outcomes: `COMPLETE` and `PARTIAL`.
- A timed-out read retains its admission slot until fulfillment or rejection and cannot mutate the already-returned page.
- Late rejection must be observed and must not become an unhandled rejection.
- Module-filtered requests start only their selected enrolled source.
- Deterministic tests cover never-settling reads, healthy-plus-timeout partial results, saturation, late fulfillment/rejection, slot release, redacted telemetry, invalid configuration, and no total/cursor on partial pages.
- Hosted load, database statement-timeout/cancellation, threshold tuning, alerting, and recovery evidence remain required before Workspace 1 production readiness.

## Implementation and documentation impact

- Code / architecture: bounded My Tasks source settlement, admission controller, telemetry contract, and test support inside the My Tasks service; no Dashboard refactor in this checkpoint.
- Data / schema: none.
- Workflow / permissions: none.
- UI / mobile: existing partial-source warning remains authoritative; no new task or action surface.
- Reporting: none.
- Knowledge base / training: clarify only if the visible partial/unavailable behavior changes; do not create an SLA meaning from the technical deadline.
- Tests / UAT: focused deterministic service tests, full source-control gates, then hosted latency/saturation and responsive authenticated evidence.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Implement bounded settlement, admission, and telemetry | Backend Engineering | Current checkpoint | Complete |
| Independently review no-zero/no-cursor and retained-capacity behavior | Security + QA | Before commit | Complete — GO, C0/H0/M0 |
| Execute hosted load, threshold, statement-timeout/cancellation, and alert evidence | DevOps + Database + Release | Before Workspace 1 production readiness | Pending |

## Evidence

- `apps/web/src/server/services/myTasks.ts` now bounds each enrolled adapter at the presentation boundary, retains admission until true settlement, and emits the closed redacted telemetry contract.
- `apps/web/src/server/services/myTasks.test.ts` now deterministically covers configuration bounds, a never-settling source, partial healthy results, saturation, retained capacity, late fulfillment/rejection, and telemetry redaction.
- `apps/web/src/app/(app)/my-tasks/page.tsx` now gives a partial page with no healthy rows a warning state rather than the complete-page all-clear message.
- Focused My Tasks service and visible-state coverage passes 25/25; the authorization manifest passes 20/20; the complete non-database web suite passes 1,395 tests with 305 skipped and one existing TODO across 127 passed/11 skipped files. Web typecheck and lint, E2E typecheck, production build, secret review, and `git diff --check` pass. The authenticated disposable-database E2E entry point failed closed before database creation with `DISPOSABLE_DATABASE_ADMIN_URL_REQUIRED`, so no browser or PostgreSQL execution credit is claimed.
- Independent Security/QA and Product/UX final reviews both returned source-checkpoint GO with no Critical, High, or Medium finding. Both separately retain Workspace 1 production readiness as NO-GO until the hosted, database-cancellation, responsive-browser, recovery, and UAT safeguards execute.
- `apps/web/src/server/services/dashboard.ts` and its tests provide the accepted bounded-presentation and retained-admission precedent.
- Independent Product, Security/QA, and Engineering analysis agreed the gap is real. Security classified it as a High production-availability blocker. The Decision Chair applies that hard gate before Positive Stock destination/export parity.
- Requested Code Spark and exact GPT-5.4 models were unavailable in the active toolset; the closest permitted GPT-5.6 specialist fallbacks were used without relaxing any gate.

## Supersession

This decision is not superseded. A later change that releases timed-out capacity early, changes deadline/cap bounds, adds database cancellation claims, changes partial-page cursor/total behavior, or moves authorization into the aggregator must explicitly amend or supersede this record.
