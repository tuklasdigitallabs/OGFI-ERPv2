# OGFI ERP — Dashboard UI Specification

**Phase:** I  
**Primary users:** Executive, General Manager, Operations Manager, Purchasing, Warehouse, Branch Manager, Storekeeper, Finance/Accounting  
**Purpose:** Present role-specific operational priorities, risks, and next actions without exposing irrelevant or unauthorized data.

---

## 1. Screen inventory

| Screen ID | Screen | Purpose |
|---|---|---|
| DASH-01 | Executive Dashboard | Consolidated risks, approvals, purchasing/inventory control indicators |
| DASH-02 | Operations Dashboard | Branch/location action and exception monitoring |
| DASH-03 | Purchasing Dashboard | PR/PO, supplier, delivery, and quotation work queue |
| DASH-04 | Warehouse Dashboard | Inbound delivery, transfer, count, and stock-risk queue |
| DASH-05 | Branch Dashboard | Today’s deliveries, low stock, counts, transfers, and pending actions |
| DASH-06 | My Tasks | Cross-module assigned action list |

## 2. Global layout

- Persistent sidebar and compact top header per `UI_IMPLEMENTATION_STANDARD.md`.
- Context switcher shows company / brand / location or allowed consolidated scope.
- Page title, dashboard assembly time, compact attempted-source status, optional date range, and approved refresh/export actions.
- Start with compact scope and source-observation context, then an action-first `Today’s work` queue; show compact role-required KPI cards second, with analytics, reports, and other drill-down widgets secondary. The queue and every drill-down remain within the user’s authorized scope.
- Source check time states when Overview received the response, not when records last changed or whether data meets a freshness SLA. Unauthorized sources are omitted. A source-native `Data as of` time is shown only when its adapter provides documented semantics.
- If an authorized attempted source is unavailable, keep unaffected sources visible, identify the view as partial, link to the authoritative workspace, and withhold complete cross-source totals rather than interpreting the source as zero.
- Do not use sales, covers, food cost, labor cost, or recipe-derived metrics in Phase I unless a validated source integration exists.

## 3. Required KPI cards by role

| Role | KPI cards |
|---|---|
| Executive / GM | Pending approvals by age, open PO value, critical stock locations, count/variance exceptions |
| Operations | Branch issues, counts due, transfers overdue, wastage pending review |
| Purchasing | PR aging, PO pending approval, delivery overdue, RFQ/comparison queue |
| Warehouse | Inbound deliveries today, transfers to dispatch, transfers awaiting receipt, counts due |
| Branch Manager | Low/critical stock, expected deliveries, transfer receipt tasks, required counts, pending approvals |
| Storekeeper | Tasks due today, stock counts, low/critical items, deliveries/transfers to receive |
| Finance | High-value approvals, open POs, receiving discrepancies, approved inventory adjustments |

## 4. Action queue standard

Each action row must include:

- Priority icon/label
- Clear task title
- Record number or item name
- Location context
- Due date / age
- Status
- Primary action or row click

Example: `Receive Transfer TO-2026-00182 · Main Warehouse → YL-MOA · Due today`.

## 5. Widget behavior

- Widgets are role-default, not freely draggable in Phase I.
- Users may filter within permitted scope; global scope cannot be widened beyond assignment.
- Every KPI/widget links to a filtered list or report.
- When normalized approval routing is disabled, the approval preview and Approval Inbox queue are both shown as unavailable. Overview must not render an `Open approvals`, `Open Approval Inbox`, or generic approval-source action in that state, and it must state that pending work may still exist. The permissioned `Scan Approvals` tool may create current-user reminders only for eligible due or overdue work; it is not a complete queue and its approval links remain unavailable until controlled Inbox activation.
- The implemented `Receiving Follow-up` widget opens a closed, read-only `receiving-follow-up-v1` profile. Its dashboard count, bounded candidates, server-paginated list, constrained header search, and CSV export share the exact selected-location predicate confirmed in `DEC-0069`; client status, discrepancy, scope, tab, token, or reason inputs cannot redefine it.
- The implemented `Ledger Variance` widget opens the dedicated, read-only `ledger-variance-v1` reconciliation profile confirmed in `DEC-0070`. The card, three bounded candidates, 25-row server pages, additive search, and diagnostic CSV use one variance-only cache-to-ledger query for the selected active location. Both balance-view and ledger-view permissions are required. Trust-gate `block` withholds the numeric dashboard value but keeps warned diagnostic evidence available to authorized investigators.
- The implemented `Positive Stock` metric and Active stock rows signal open the versioned, read-only `positive-stock-v1` Inventory profile confirmed in `DEC-0231`. Dashboard count, exact destination total/page, and bounded CSV export share the current tenant/company/selected-location, active-Inventory-Location, `qtyOnHand > 0` predicate. A maximum-120-character search may only narrow the profile. Invalid, duplicate, stale, or widening profile inputs fail visibly; the profile is a live inquiry, not a historical dashboard snapshot, and grants no ledger, posting, adjustment, or balance-edit authority.
- The implemented `Zero Stock` metric opens the versioned, read-only `zero-stock-v1` Inventory profile confirmed in `DEC-0232`. Its dashboard count, exact destination total/page, and bounded CSV export share the current tenant/company/selected-location, active-Inventory-Location, relation-ownership, and exact `qtyOnHand = 0` balance-row predicate. Positive, negative, inactive, malformed, and cross-scope rows are excluded; two valid zero rows for one item remain two rows. Copy says `Zero-stock balance rows`, not `Items configured`, because the profile is not catalog completeness or automatic replenishment.
- The implemented `Rows with lot or expiry data` card appears under `Stock balance signals` and opens the versioned, read-only `lot-expiry-data-v1` profile confirmed in `DEC-0233`. Dashboard count, exact destination total/page, and bounded CSV share one static parameterized selected-scope/active-Inventory-Location/related-record predicate for an existing balance row whose trimmed lot is nonblank or expiry is recorded. Positive, zero, and negative quantities are included; blank or whitespace-only lot without expiry is excluded. This is live data presence, not tracking compliance, coverage, accountability, traceability, or a historical snapshot.
- Inventory dashboard-profile dispatch is exhaustive for `positive-stock-v1`, `zero-stock-v1`, and `lot-expiry-data-v1`. Profile mode accepts exactly one `dashboard`, optional single normalized search of at most 120 characters, and optional single valid page; raw tab/scope/filter overrides fail visibly. All profiles show current live rows, preserve canonical context through independently authorized ledger navigation, and retain existing balance/export permissions.
- The Branch Operations `Reviews` widget opens the read-only `branch-checklist-reviews-v1` profile confirmed in `DEC-0226`. Its card and destination share the exact selected tenant, company, optional brand, and location predicates and include all scoped `SUBMITTED` and `MANAGER_REVIEW` checklists. This is an oversight count, not a claim that the actor can act on every row; each source-detail action reauthorizes the live actor independently.
- The Branch Operations `Exceptions` widget opens the read-only `branch-checklist-exceptions-v1` profile confirmed in `DEC-0226`. The card counts exception lines. The destination preserves that line total and separately reports affected checklist rows so the two grains are not conflated.
- Branch Operations profiles accept only bounded search as an additional narrowing condition. Raw status, shift, business date, and scope inputs cannot widen or redefine them. Invalid or stale profile identifiers fail visibly, and row/detail navigation preserves the profiled return context.
- The Food Safety `Reviews` widget opens the read-only `food-safety-reviews-v1` profile confirmed in `DEC-0227`. Its card and destination share the exact session tenant, selected company, optional brand, and selected location predicates and include the complete scoped `SUBMITTED` plus `EXCEPTION_REVIEW` oversight population. It does not claim that the actor can act on every row; source-detail actions reauthorize independently.
- The Food Safety `Exceptions` widget opens the read-only `food-safety-exceptions-v1` profile confirmed in `DEC-0227`. Its card is the sum of exception readings, while the destination contains affected logs with `exceptionCount > 0` across all statuses and reports affected logs separately. Historical exception logs remain visible even when no current action is available.
- Food Safety profiles accept only a normalized, maximum-120-character search as an additional narrowing condition. Raw type, status, business date, and scope inputs cannot widen or redefine them. Invalid or stale profile identifiers fail visibly; create and export are hidden; and record navigation retains only canonical profile return context.
- The Incident widgets open the four read-only profiles confirmed in `DEC-0228`: `incident-open-v1` contains `OPEN`, `IN_PROGRESS`, and `PENDING_REVIEW`; `incident-critical-v1` contains `CRITICAL` incidents across every status as a historical severity lens; `incident-pending-review-v1` contains scoped `PENDING_REVIEW` oversight rather than actor-assigned work; and `incident-overdue-v1` uses the captured operating-date cutoff with `dueAt` before that date, `resolvedAt` null, and status other than `CANCELLED`.
- Every Incident card and destination uses the same exact session tenant, selected company, nullable selected brand, and selected location predicates. The four incident-record populations may overlap and are not additive. A maximum-120-character normalized search may only narrow them; raw status, severity, incident-date, and scope inputs cannot redefine them. Missing, invalid, duplicate, or stale profile parameters fail visibly.
- The overdue card captures the operating date once and sends it as the required non-future `asOf=YYYY-MM-DD` cutoff. The destination keeps that cutoff but reads current records, so later resolution, cancellation, correction, or backdated entry can change its rows; it must not be described as a historical snapshot. Other Incident profiles reject `asOf`.
- Incident profile mode hides create and ordinary export and rejects direct dashboard-profile export requests. Lists use a minimal triage projection; record detail and correction/resolve/cancel actions independently reauthorize the live actor and exact scope. Detail, back, and action redirects preserve only canonical profile, bounded search, page, and applicable cutoff context.
- The Maintenance widgets open the four read-only profiles confirmed in `DEC-0229`: `maintenance-follow-up-v1` contains active `OPEN`, `IN_PROGRESS`, and `PENDING_VENDOR` tickets; `maintenance-critical-v1` contains `CRITICAL` tickets across every status as a historical priority lens; `maintenance-pending-vendor-v1` contains scoped `PENDING_VENDOR` oversight rather than actor-assigned work; and `maintenance-overdue-v1` uses the captured operating-date cutoff with `targetDueAt` before that date, `completedAt` null, and status in the active whitelist.
- Every Maintenance card and destination uses the same exact session tenant, selected company, nullable selected brand, and selected location predicates. The four ticket populations may overlap and are not additive. A maximum-120-character normalized search may only narrow them through visible metadata; raw status, priority, requested-date, and scope inputs cannot redefine them. Missing, invalid, duplicate, or stale profile parameters fail visibly.
- The Maintenance overdue card captures the operating date once and sends it as the required non-future `asOf=YYYY-MM-DD` cutoff. The destination keeps that cutoff but reads current records, so later completion, cancellation, correction, or backdated entry can change its rows; it is not a historical snapshot. Other Maintenance profiles reject `asOf`. The active whitelist intentionally excludes cancelled and malformed completed/null-completion rows from overdue work without rewriting their stored data.
- Maintenance profile mode hides create and ordinary export and rejects direct dashboard-profile export requests. Lists use a minimal visible-metadata projection that excludes source Incident ID; any source link is permission-gated on detail and its destination reauthorizes independently. Detail, back, and action redirects preserve only canonical profile, bounded search, page, and applicable cutoff context.
- Empty widget state gives an accurate positive message such as `No overdue transfers in your assigned locations.`

## 6. My Tasks requirements

- Aggregate actionable items from approvals, receiving, transfers, counts, wastage, adjustments, and assigned exceptions.
- Filters: priority, module, location, due date, assigned by, status.
- Sort default: critical, overdue, due today, then newest.
- Distinguish `task complete` from `notification read`.
- Each enrolled source must settle within the validated presentation deadline. A timeout, saturation, or exception names that source as unavailable, preserves healthy-source items, and returns a partial page with no total or continuation cursor.
- A partial page with no healthy rows must not use the complete-page all-clear state. It must explain that no actions are shown from the available sources and that work may still exist in an unavailable source.
- The presentation deadline is a technical availability control, not a freshness promise or user-facing service-level agreement. The underlying source record remains authoritative and independently reauthorizes every action.

## 7. Responsive behavior

- Desktop: KPI band + action queue + 2-column supporting widgets.
- Tablet: 2-column cards with task queue prioritized above charts.
- Mobile: 2-card KPI summary maximum; `Needs you` list first; bottom navigation and clear task CTAs.

## 8. Acceptance criteria

- Role sees only allowed widgets and data.
- Branch/warehouse context is visible and enforced.
- Every actionable card opens a relevant record or filtered list.
- No Phase II metrics appear as live figures without reliable data source.
- Mobile user can complete top task within three taps after dashboard open where practical.
