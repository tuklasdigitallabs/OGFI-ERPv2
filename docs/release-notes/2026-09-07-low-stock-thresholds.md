# Low-stock monitoring by branch and warehouse

**Audience:** Branch and warehouse teams, Operations, Purchasing, and administrators.  
**Status:** Implemented local feature under DEC-0283; named-role browser/mobile UAT and operational release signoff remain separate gates.

## What changed

The dashboard's **Low-stock alerts** links to `/inventory/low-stock`. The workspace provides **Low-stock alerts**, **Configured thresholds**, search, pagination, export, and authorized threshold setup/edit/deactivation with a reason and recent audit activity.

Thresholds belong to individual item/storage pairs. Configure Main Warehouse and SM North EDSA independently. Low stock means summed recorded on-hand is at or below the active threshold in base UOM. No defaults are seeded. No threshold means no monitoring coverage, and a configured pair without balance rows requires initialization or reconciliation.

Viewing requires stock-balance view permission and selected-location scope. Editing also requires item-edit permission and location/company MANAGE authority. Protected blind-count views suppress quantities and alert counts; unavailable must not be interpreted as zero.

Recorded on-hand does not deduct reservations, quarantine, or stock in transit. Alerts do not create persistent notifications or automatically create PRs, POs, or transfers. Check assigned warehouse availability and follow the existing controlled replenishment workflow.

## UAT preparation

Use an isolated test environment and owner-approved test quantities; do not change live stock to manufacture an alert.

1. Prepare a named manager with configuration authority, a scoped read-only user, and a user without access. Confirm separate Main Warehouse and SM North EDSA scope assignments.
2. Confirm the test item's active status, base UOM, and each location's storage. Record known test balances through approved test workflows; do not edit balances directly.
3. Set explicit thresholds separately in both locations. Verify that configuring Main Warehouse does not configure SM North EDSA.
4. Test recorded on-hand below, equal to, and above threshold; include multiple lots and a configured item/storage pair with no balance rows. Confirm the no-balance warning.
5. Reopen and edit a threshold, deactivate it, and check the reason/audit activity. Verify a stale editor is rejected and read-only users cannot save.
6. Compare dashboard, alerts, configured view, search, pagination, and CSV. Confirm protected blind-count and access-denied states reveal no alert counts or stock quantities. Check desktop and mobile task usability.
7. Confirm no PR, PO, transfer, inventory movement, or persistent notification is created by monitoring or configuration. Record results and unresolved issues before seeking UAT signoff.

## Help

[Monitoring Low Stock and Setting Thresholds](../knowledge-base/warehouse-inventory/monitoring-low-stock-and-thresholds.md) explains navigation, permissions, quantities, recovery messages, and next actions.
