# DEC-0283 — Location-aware low-stock thresholds

## Metadata

- Status: Confirmed implementation decision; not UAT or production admission
- Date: 2026-09-07
- Decision owner / Chair: Parent implementation agent
- Related phase: Phase I inventory and dashboard
- Confirmed brief: [Location-aware low-stock thresholds](../DECISION_BRIEF_LOW_STOCK_THRESHOLDS.md)
- Authorization: Parent confirmed the implemented bounded option and directed this formal record.

## Decision

Configure an explicit nonnegative threshold per item and inventory location, expressed in the item's base UOM. Compare it with recorded on-hand summed across that storage location's balance lots; equality is low stock. Display the live scoped signal on the dashboard, paginated register and matching CSV, with protected-count suppression and no automatic procurement or persistent notification job.

Thresholds apply to tracked inventory items such as recipe raw materials; they are not configured on approved recipes. Recipe availability, when the recipes/production scope is delivered, will be derived from the recipe's effective ingredient requirements and location stock, including approved substitutions and required quantities. It will not be maintained as a second manually entered threshold.

## Context and alternatives

Main Warehouse and SM North EDSA need independently configured monitoring; one company-wide item default cannot represent both. Existing balances measure recorded stock, not dispatch availability.

| Option | Outcome and failure modes |
|---|---|
| Explicit item/storage configuration and live recorded-on-hand signal | Selected. Fits current data and authorization. Incomplete configuration or missing balances could mislead operators; coverage and initialization explanations are mandatory. |
| Global default or fabricated threshold | Rejected. Gives unsupported monitoring coverage and obscures location differences. |
| Available-to-dispatch measure or automatic PR/PO | Rejected for this slice. Reservations, quarantine and in-transit availability are not modeled; procurement must retain warehouse-first controlled routing. |
| Persistent notification job | Deferred. No recipient, cadence, escalation or deduplication policy is introduced by dashboard reads. |

## Hard gates and safeguards

- Read access requires `inventory.balance.view` and active selected-location scope, with the existing company-MANAGE allowance. Quantity-bearing alert membership, counts, rows and CSV use the shared blind-count read fence. Denial/unavailability must not become zero alerts. The configuration editor loads no actual-stock facts.
- Configuration additionally requires `master_data.item.edit`, live authority and MANAGE at the selected location or company. No new permission or default grant is introduced. Require a reason, audit before/after state and compare expected version; competing changes fail stale rather than overwrite.
- Only active thresholds with active tracked items, base UOM, inventory location and parent location generate alerts. Sum all matching lot balance rows in the base UOM. Configured pairs without a balance row contribute recorded zero and are labeled for initialization/reconciliation; this does not establish physical stock.
- No threshold means no monitoring for that pair. Explicit zero is valid. No defaults are seeded. Setting/deactivating thresholds or reading alerts creates no movement, balance, PR, PO or persistent notification.
- Request Stock retains assigned-warehouse availability checking, transfer when stock is available, and Purchase Request when unavailable. Low stock does not bypass approval or create a Purchase Order.

## Implementation, data and rollback

`InventoryLowStockThreshold` is tenant/company scoped, unique per item/inventory-location pair, and pins the item base UOM through composite foreign keys. Threshold is `DECIMAL(18,6)`, nonnegative and non-NaN; version is positive. Input accepts up to 12 integer and six fractional digits. Active/deactivated configuration and timestamps preserve the record; changes are audited.

Migration `20260907130000_inventory_low_stock_thresholds` adds the table, scoped keys and indexes without modifying stock or seeding thresholds. Before rollback, preserve/export configuration and its audit history; revert application dependencies before dropping the additive table/indexes. Inventory and audit history must not be rewritten.

Service: `apps/web/src/server/services/lowStock.ts`. UI: `/inventory/low-stock`, with alerts/configured views, search, pagination, CSV, create/edit/deactivate, reason, pending/error/stale states and latest ten configuration changes. Dashboard exposes a live item/storage-pair count and review destination. This count is neither notification delivery nor complete stock coverage.

## Verification and follow-up

Unit and PostgreSQL test sources cover numeric validation, shared dashboard/list/export semantics, lot aggregation, zero/no-row/equality, eligibility, selected scope/MANAGE, audited concurrent version control, no stock mutation and combined-role blind-count denial. Test implementation alone is not a passing execution result. Final execution results remain to be recorded by the parent; browser/mobile UAT and production admission are not established here.

Required follow-up: approved owners configure actual item/storage thresholds in the admitted environment; QA verifies warehouse-first routing and named-role desktop/tablet/mobile journeys; Dunong updates role-based help and release/training impact. Existing Inventory Control Pilot admission, valuation, controlled-evidence and recount/settlement gates remain unchanged.
