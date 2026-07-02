# OGFI ERP — Wastage and Adjustments UI Specification

**Phase:** I  
**Primary users:** Storekeepers, Branch Managers, Warehouse users, Operations, Finance, approvers  
**Purpose:** Record stock loss and controlled corrections with reasons, evidence, approval where implemented, and clear inventory-impact visibility.

---

## 1. Screen inventory

| ID | Screen | Purpose |
|---|---|---|
| WST-01 | Wastage & Adjustment List | Track reports by type, status, location, reason, and value |
| WST-02 | Log Wastage | Submit spoilage/damage/expired/staff meal/test usage where policy allows |
| WST-03 | Create Stock Adjustment | Request controlled inventory correction |
| WST-04 | Wastage / Adjustment Detail | Review context, evidence, approval, ledger outcome, audit history |
| WST-05 | Review Queue | Approver review for high-risk or pending entries where approval workflow is implemented |

Stock Adjustment screens in the `DEC-0019` foundation slice are non-posting. They capture scoped adjustment requests and lines for documentation, review, export, and audit only. They must not expose approval, posting, opening-balance, count-variance posting, backdate, or reversal actions until those behaviors are separately implemented.

## 2. Wastage requirements

Required fields:

- Company/brand/location and storage sublocation where applicable
- Item, UOM, quantity, estimated value/cost context
- Wastage reason code
- Date/time discovered or occurred
- Responsible reporter
- Photo/attachment where configured
- Evaluated policy flags, evidence-required state, and policy snapshot where configured
- Notes and related incident/receiving/count reference where applicable
- Approval route/status

Allowed reason codes are master data; no uncontrolled free-text reason as the primary classification.

## 3. Adjustment requirements

- Adjustment type: increase/decrease/reclassification only through controlled policy.
- Source reason code and explanation.
- Quantity/value impact, location, item, and reference record.
- Supporting evidence where configured.
- User must not edit historic ledger balance directly.
- No approval route is created for Stock Adjustment in the `DEC-0019` foundation slice.
- Opening balance, count-variance posting, backdating, and reversal are not available Stock Adjustment actions in the foundation slice.

## 4. Statuses

```text
Wastage:
Draft → Submitted → Pending Review → Approved → Posted → Closed
                  ↘ Returned / Rejected
Cancelled / Reversed with reason and audit history

Stock Adjustment foundation:
Draft → Submitted / Cancelled

Future Stock Adjustment release:
Pending Review → Approved → Posted → Closed
              ↘ Returned / Rejected
Reversed with reason and audit history
```

## 5. Approval and evidence behavior

- High-value, repeated, damaged, expired, or exception reasons may require photo evidence and higher approval.
- High-value and repeat-loss policy matches appear as factual review flags; missing required evidence blocks submission server-side.
- Reporter cannot self-approve if policy separates duties.
- Approval screen shows recent wastage/adjustment history for same item/location when permitted, to identify repeat issues.
- Stock Adjustment approval is integrated for manual `INCREASE` and `DECREASE` adjustments under `DEC-0023`; approval does not post stock.

## 6. Inventory impact

- Posting creates immutable inventory movement only once.
- Wastage typically reduces stock; manual adjustment direction depends on authorized type.
- Postings must be traceable to report number, approval, source user, and evidence.
- Reversal creates a reversing transaction, not an overwritten record.
- Stock Adjustment records update balances only after approval and a separate authorized Post Adjustment action writes `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` movements.

## 7. Mobile behavior

- Camera attachment and search/scan first.
- Large quantity/UOM input.
- Clearly show current source location.
- `Submit for Review` is the normal primary action where review workflow is implemented; `Post` appears only when user is authorized and workflow permits.
- Stock Adjustment screens must not show backdate, opening-balance, count-variance posting, reclassification, or partial-reversal actions in this slice.

## 8. Acceptance criteria

- Required reason/evidence rules block invalid Stock Adjustment submission; approval is non-posting, posting is separate and permissioned, and reversal is used for posted correction.
- Posting-enabled wastage reconciles inventory movement, balance, report, and audit record.
- Manager can identify pending, rejected, repeated, and high-value wastage quickly.
- Stock Adjustment submission records scope, requester, item, quantity impact, reason, evidence where configured, and audit history; approval is non-posting, while separate authorized posting/reversal creates linked inventory movements.
