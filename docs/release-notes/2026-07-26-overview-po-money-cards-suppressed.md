# OGFI ERP Release Notes — Overview PO money cards suppressed

**Release date:** July 26, 2026

**Audience:** Purchasing, receiving, branch management, operations, finance and accounting, and authorized support users

## What Changed

- Overview no longer shows the `PO commitment`, `Open PO exposure`, or `Received value` cards.
- Their broad lifecycle, currency, valuation, and reconciliation bases were not approved as authoritative, and their generic links did not open an exact matching population.
- The exact `Open POs` record count and read-only profile remain available. Eligible overdue PO items also remain visible in Overview exception work.
- The `Source views` tab labels the ordinary source-workspace destination `Purchase Orders`; it does not claim to report commitment, exposure, or a reconciled aggregate value.
- Ordinary Purchase Order and Receiving registers remain available under their existing permissions and selected scope, with currency and value details kept on the relevant records.

## What You Need To Do

- Do not interpret the missing money cards as zero commitment, exposure, or received value.
- Use `Open POs` for the exact open-record population, not for a money total.
- Open the authorized Purchase Order or Receiving record when you need its current lifecycle, currency, quantity, or value details.

## Important Notes

- No replacement Overview procurement money metric is approved.
- This change does not alter PO status, approval, issue, receiving, inventory, currency, financial value, permissions, or audit history.
- This note does not declare Overview, Workspace 1, or Phase I production-ready.

## Training Impact

No separate training course is required. Purchasing, operations, and finance users should receive a short briefing that Overview retains exact record-count and overdue-item visibility, while monetary review must use the authorized source records and their stated currencies.

## Learn More

- [Understanding the Dashboard, My Tasks, and Notifications](../knowledge-base/getting-started/understanding-the-dashboard-my-tasks-and-notifications.md)
- [Understanding Purchase Order Statuses](../knowledge-base/purchasing/understanding-purchase-order-statuses.md)

## Support

Report an unexpected Open POs count, overdue item, currency, or record value through the normal OGFI ERP support channel. Include the selected location, PO reference, and time observed; do not include sensitive record contents.
