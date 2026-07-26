# OGFI ERP Release Notes — Overview recent stock updates suppressed

**Release date:** July 26, 2026

**Audience:** Inventory, warehouse, storekeeping, branch management, operations, and authorized support users

## What Changed

- Overview no longer shows the `Updated this week` or recent stock-updates signal.
- The removed value used the last update time of mutable stock-balance cache rows. That timestamp does not reliably describe posted inventory-movement activity, and the ordinary Inventory list was not an exact drilldown for the value.
- Ordinary `Inventory → Stock Balances` and `Inventory → Ledger` remain available under their existing permissions and selected-location scope.

## What You Need To Do

- Do not treat the missing Overview signal as confirmation that no inventory activity occurred.
- Use Stock Balances for current quantities. Use the Inventory Ledger for posted movement history when your role has ledger access.

## Important Notes

- This change removes a potentially misleading summary only. It does not change inventory quantities, movements, posting, approvals, permissions, or audit history.
- A movement-based replacement card or new inventory-activity definition has not been approved.
- This note does not declare Overview, Workspace 1, or Phase I production-ready.

## Training Impact

No separate training course is required. Brief inventory and branch-management users that current quantities belong in Stock Balances, posted activity belongs in the authorized Inventory Ledger, and the removed card must not be treated as a zero-activity indicator.

## Learn More

- [Understanding the Dashboard, My Tasks, and Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)
- [Viewing Stock Balances](../knowledge-base/warehouse-inventory/viewing-stock-balances.md)

## Support

Report unexpected inventory quantities or movement history through the normal OGFI ERP support channel. Include the selected location and time observed; do not include sensitive record contents.
