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
- Page title, freshness label, optional date range, and export/refresh actions.
- Start with compact scope and freshness context, then an action-first `Today’s work` queue; show compact role-required KPI cards second, with analytics, reports, and other drill-down widgets secondary. The queue and every drill-down remain within the user’s authorized scope.
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
- The implemented `Receiving Follow-up` widget opens a closed, read-only `receiving-follow-up-v1` profile. Its dashboard count, bounded candidates, server-paginated list, constrained header search, and CSV export share the exact selected-location predicate confirmed in `DEC-0069`; client status, discrepancy, scope, tab, token, or reason inputs cannot redefine it.
- The implemented `Ledger Variance` widget opens the dedicated, read-only `ledger-variance-v1` reconciliation profile confirmed in `DEC-0070`. The card, three bounded candidates, 25-row server pages, additive search, and diagnostic CSV use one variance-only cache-to-ledger query for the selected active location. Both balance-view and ledger-view permissions are required. Trust-gate `block` withholds the numeric dashboard value but keeps warned diagnostic evidence available to authorized investigators.
- Empty widget state gives an accurate positive message such as `No overdue transfers in your assigned locations.`

## 6. My Tasks requirements

- Aggregate actionable items from approvals, receiving, transfers, counts, wastage, adjustments, and assigned exceptions.
- Filters: priority, module, location, due date, assigned by, status.
- Sort default: critical, overdue, due today, then newest.
- Distinguish `task complete` from `notification read`.

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
