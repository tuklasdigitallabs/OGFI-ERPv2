# OGFI ERP — Stock Counts UI Specification

**Phase:** I  
**Primary users:** Storekeepers, warehouse staff, Branch Managers, Operations, Finance reviewers  
**Purpose:** Plan, execute, review, and approve physical stock counts without hiding variance or damaging ledger integrity.

---

## 1. Screen inventory

| ID | Screen | Purpose |
|---|---|---|
| CNT-01 | Stock Count List | View planned, in-progress, submitted, approved, and overdue counts |
| CNT-02 | Create / Schedule Stock Count | Define location, scope, count type, counters, and date |
| CNT-03 | Count Entry | Enter physical counts by item/location/lot where applicable |
| CNT-04 | Count Review | Compare system vs physical count and review variances |
| CNT-05 | Variance Approval / Posting | Approve or reject controlled adjustment outcome |

## 2. Count types

- Full count
- Category count
- Cycle count
- Spot check
- High-value / critical item count
- Opening inventory count

Count type, location, item scope, assigned counters, due date, and policy must be visible.

## 3. Count entry requirements

- Show item code/name, UOM, storage location, count fields, optional lot/expiry split, and count status.
- Hide system quantity from blind counts when policy requires independent count integrity.
- Allow pause/resume draft count with user/time audit.
- Provide search, category filters, scan support where available, and mobile-first item cards.
- Require reason/comment for a manual item addition or exception count.
- Show Start, Entry, and Submit controls only to the recorded assigned counter and only for the current first-pass state. Explain future schedule, another counter's assignment, incomplete lines, and an empty snapshot instead of showing an action that will fail.
- A blind assigned counter does not receive system quantity, variance, reviewer notes, adjustment context, or variance-bearing audit facts merely because the user also holds review permission.

## 4. Review and variance

Show:

- System quantity
- Counted quantity
- Variance quantity
- Unit cost/value where permitted
- Variance reason
- Prior count / last movement context
- Required evidence or recount indicator
- Approval route and status

Count Variance review facts remain reviewer-gated, but Count Variance adjustment generation and dashboard/task activation are disabled during the immutable recount-recovery rollout. The count detail must explain this disabled state; no replacement adjustment action may be shown. Do not post variance directly from count entry.

## 5. Statuses

```text
Draft → Scheduled → In Progress → Submitted → Under Review → Approved → Posted / Closed
                         ↘ Recount Required → In Progress
Rejected / Cancelled only with reason and audit history
```

## 6. Mobile behavior

- Fast count input with large controls and keyboard/scan support.
- Avoid table-only layout; use item cards with visible UOM and location.
- Clearly show whether count is saved as draft, submitted, or offline/queued.

## 7. Acceptance criteria

- Count scope is locked to authorized location.
- Variance is calculated consistently from ledger/system balance snapshot.
- Count Variance posting is not enabled in the current release; the eventual path must write controlled inventory movement and audit event only after the recovery and approval gates pass.
- Count report reconciles to item-level evidence; posted-adjustment reconciliation is deferred until Count Variance activation.
- Count start and inventory posting use the same canonically ordered inventory-location serialization boundary, so a racing movement is either included before cutoff or blocked by an active freeze.
- My Tasks exposes at most one assigned first-pass Start, Enter, or Submit action and does not expose recount, review, cancellation, or variance work.
