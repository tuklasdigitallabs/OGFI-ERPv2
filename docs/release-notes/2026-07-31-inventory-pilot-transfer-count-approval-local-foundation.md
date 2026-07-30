# OGFI ERP Release Note — Inventory Pilot Transfer And Count Approval Local Foundation

**Release date:** July 31, 2026
**Audience:** Branch Managers, Storekeepers, Warehouse staff, Operations Managers, approval users, and System Administrators
**Affected locations / roles:** None in production or UAT. This is a local implementation notice only.

## What changed

- The local build now contains a conditional approval foundation for transfers admitted to an activated Inventory Control Pilot cohort. Such a transfer would move to `PENDING_APPROVAL` on submission, then to `REQUESTED` only after final approval. A returned transfer can be corrected and submitted again; rejection is terminal.
- The local build now contains a conditional, approve-only count-review foundation for admitted stock-count attempts. Such a count would move through Approval Inbox review and become `REVIEWED` only after final approval. Return, rejection, and direct count-page review are not alternative routes for an admitted count.
- Transfer and count approval, return, rejection, and cancellation are non-posting controls. They do not create inventory movements, change stock balances, or create a Stock Adjustment.
- Segregation checks are built into the local behavior: a transfer requester cannot approve the transfer, its approver cannot dispatch or receive it, and a count creator, assigned counter, or count-line entrant cannot approve that count.
- A submitted admitted count may be cancelled only through the controlled pending-cancellation action. The session, immutable attempt, and pending approval close in one transaction with a required reason; submitted quantities, evidence, scope, and actor lineage remain immutable.

## What you need to do

- Continue using the current approved workflows. This foundation is disabled by default and does not make a new Approval Inbox route available for production or UAT use.
- Do not treat a pilot badge, location selection, role, or deployment setting as approval-route authority. A future authorized rollout must admit each record through server checks for the exact active cohort.

## Important notes

- This is not a production activation, deployment announcement, UAT authorization, or Phase I GO decision.
- Under the current default-off behavior, non-pilot records continue on their existing legacy paths.
- An emergency release disable can deny new pilot admissions. It cannot downgrade an already admitted transfer or count to an uncontrolled legacy path or remove the record's approval controls.
- Cancelling a pending admitted record closes its pending approval route and preserves the record, reason, actor, timestamp, and audit history. It does not post stock.
- Local database acceptance now passes the exact 143-migration ledger and all 24 transfer/count workflow, concurrency, scope, segregation, immutable-evidence, custody, and rollback cases. This evidence supports the default-off implementation only and is not a deployment or activation notice.

## Learn more

- [Creating Transfer Requests](../knowledge-base/warehouse-inventory/creating-transfer-requests.md)
- [Running Stock Counts](../knowledge-base/warehouse-inventory/running-stock-counts.md)
- [Phase I Warehouse And Storekeeper Quick Start](../training/phase-i-warehouse-storekeeper-quick-start.md)

## Support

Use the approved OGFI ERP support channel. Include the selected company and location, record reference, current status, action attempted, and the exact on-screen message. Do not share passwords or confidential evidence.
