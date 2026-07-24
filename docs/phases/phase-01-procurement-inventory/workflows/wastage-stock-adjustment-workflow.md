# Wastage and Stock Adjustment Workflow — Phase I
**Document ID:** wastage-stock-adjustment-workflow  
**Version:** 0.1  
**Date:** 25 June 2026  
**Applies to:** Wastage, Spoilage, Expiry, Staff Meals, Complimentary Use, Damage, Stock Adjustments, Count Variances, Backdating, Reversals

---

## 1. Purpose

This workflow controls every inventory reduction or correction that is not ordinary supplier receiving or internal transfer. It gives OGFI factual visibility over food / stock loss, authorized non-sale consumption, system corrections, evidence, approval, and value impact.

Wastage and stock adjustment are separate processes. Wastage records a real operational loss or authorized consumption. Adjustment corrects the inventory ledger. They must not be used interchangeably.

---

## 2. Scope

### In scope
- Spoilage, expiry, damage, quality reject, preparation loss, burnt / overcooked stock
- Staff meals, complimentary items, test / R&D use where stock needs controlled reduction
- Stock adjustment increase, decrease, correction, reclassification, opening balance
- Physical-count variance posting
- Backdated correction control
- Reversal workflow
- Approval, evidence, audit, exception reporting

### Out of scope
- Recipe-level theoretical food cost
- POS-linked void / complimentary validation
- Automated fraud detection
- General-ledger journal creation
- Full incident-management process beyond optional reference link

---

## 3. Definitions

| Term | Meaning |
|---|---|
| Wastage | Actual inventory loss or authorized non-sale consumption, recorded with reason and evidence. |
| Stock Adjustment | Controlled correction of recorded stock due to count variance, data error, opening balance, or approved reclassification. |
| Count Variance | Difference between physical count and system quantity at approved cutoff. |
| Reversal | Opposite movement that neutralizes a posted transaction without erasing history. |
| Backdated Transaction | A record effective before current controlled operating period. |
| Material Threshold | Configurable peso / quantity / percentage limit requiring stronger evidence or approval. |

---

## 4. Roles

| Role | Responsibility |
|---|---|
| Branch / Kitchen Staff | May report operational wastage where authorized; cannot self-approve. |
| Storekeeper / Inventory Custodian | Verifies items, lot / expiry, quantity, and submits reports. |
| Branch Manager | Reviews branch reason, evidence, and accountability. |
| Warehouse Manager | Reviews warehouse wastage and corrections. |
| Operations Manager | Reviews material or repeat operational loss. |
| Finance / Accounting | Reviews material value impact and manual corrections. |
| Auditor | Read-only compliance review. |

No user may be both creator and final required approver on the same report.

---

## 5. Wastage Categories

Initial configurable groups:

| Group | Examples |
|---|---|
| Spoilage / Expiry | spoiled, expired, near-expiry disposal, improper storage |
| Receiving / Quality | supplier quality reject, damaged on arrival, wrong item return |
| Preparation / Production | trimming loss, burnt, overcooked, failed batch, contamination |
| Damage | broken packaging, accident, equipment-related loss |
| Authorized Consumption | staff meal, complimentary item, tasting, test kitchen / R&D |
| Customer / Service | customer return, remake due to quality issue |
| Operational | power interruption, refrigeration issue, branch closure |
| Other | Requires detailed narrative and stronger approval |

Reason codes, evidence rules, and thresholds are configurable by location, category, value, and wastage type.

---

## 6. Wastage Workflow

```text
Loss / authorized use identified
  → Draft Wastage Report
  → Item, quantity, reason, location, lot/expiry, evidence recorded
  → Submit
  → Approval routing
  → Approved report
  → Post negative stock movement
  → Update balance
  → Report and trend review
```

### 6.1 Create Wastage Report

**Allowed users:** authorized branch and warehouse users.

Required header:
- Location and department
- Reporter and report time
- Wastage type and reason code
- Remarks where policy requires

Required line:
- Item and inventory source location
- Quantity and UOM
- Lot / expiry where tracked
- Estimated value
- Line-level reason if different
- Photo / evidence where required

Validation:
- User has location scope.
- Item is active and tracked.
- Quantity is positive and UOM conversion is valid.
- Lot / expiry provided for tracked item.
- Available stock sufficient unless approved negative-stock exception.
- Reason code valid for selected wastage type.
- Evidence satisfies policy.

### 6.2 Evidence default

Suggested baseline:
- Expiry, damage, quality reject, high-value loss: photo required.
- Amount above threshold: photo plus manager comment.
- Staff meal / complimentary / test use: reason, user / event reference required; photo configurable.
- Power interruption / refrigeration loss: photo plus incident reference.
- Other: detailed narrative and enhanced approval.

### 6.3 Submit and approve

On submit, system calculates quantity and value impact, resolves approval policy, creates Approval Instance, locks material data, notifies approvers, and writes audit events.

Default approval logic remains configurable:
- routine low-value loss: Branch / Warehouse Manager;
- material or repeat loss: manager + Operations;
- high-value, sensitive, unusual, or repeated loss: manager + Operations + Finance;
- incident-related loss: Operations and Finance visibility.

Approver may approve, return, reject, request more evidence, delegate under policy, or allow SLA escalation. Return and reject require remarks.

### 6.4 Post wastage

After final approval:
1. Revalidate stock and lot / expiry.
2. Create negative `wastage` movement.
3. Update balance cache.
4. Set report to `posted`.
5. Notify requester and relevant manager.
6. Preserve full audit history.

Posted reports cannot be edited. Correction requires reversal and, if necessary, corrected replacement report.

---

## 7. Stock Adjustment Workflow

`DEC-0019` introduced non-posting `StockAdjustment` and `StockAdjustmentLine` foundation records. `DEC-0023` adds the controlled Phase I slice for manual `INCREASE` and `DECREASE` adjustments: approval is required, approval is non-posting, a separate authorized post action writes inventory movements, and posted adjustments are corrected through full-document reversal. Opening balance, count-variance posting, reclassification, backdating, finance/accounting entry, and partial reversal remain deferred until separate confirmed implementation slices.

```text
Discrepancy / correction identified
  → Draft Stock Adjustment
  → Reason, evidence, quantity, value impact
  → Submit
  → Approval routing
  → Approved adjustment
  → Authorized post positive / negative movement
  → Update balance through inventory ledger service
  → Audit and reporting
  → Reversal if posted adjustment is wrong
  → Audit history preserved
```

### 7.1 Allowed adjustment types

| Type | Valid use |
|---|---|
| Increase | Verified missing receipt / correction, verified stock discovery; implemented for approval, posting, and reversal under `DEC-0023` |
| Decrease | Verified overstated balance or controlled correction; implemented for approval, posting, and reversal under `DEC-0023` |
| Reclassify | Future controlled release only |
| Opening Balance | Future controlled release only |
| Correction | Documented data-entry error, linked to original record where possible |
| Count Variance | Future controlled release only; no count-variance posting in the `DEC-0023` slice |

Adjustment must not conceal ordinary wastage, supplier shortage, or transfer loss. Use the correct workflow for those events.

### 7.2 Create adjustment

Required header:
- Location
- Adjustment date and type
- Reason code and narrative
- Source count session / source reference where applicable
- Requester
- Supporting attachment where policy requires

Required line:
- Item
- Lot / expiry where tracked
- System quantity snapshot where relevant
- Positive or negative adjustment base quantity
- Value impact and line reason as needed

Validation:
- Authorized reason and scope.
- Reviewed stock counts remain eligible for a future linked `COUNT_VARIANCE` adjustment, but generation is currently disabled pending immutable recount recovery, attempt-lineage migration, and production evidence under `DEC-0098`; direct count-variance movement posting remains deferred.
- Opening balance is blocked in this slice and requires a separate cutover decision.
- Quantity cannot be zero.
- Decrease does not reduce stock until approval is complete and a separate authorized posting action succeeds.
- Backdating is not implemented in this slice.

### 7.3 Approve and post

Approval and posting are implemented for manual `INCREASE` and `DECREASE` Stock Adjustments under `DEC-0023`.

Approval considers type, sign, value, category, location, source evidence, count linkage, backdate status, repeated pattern, and requester role.

Baseline:
- minor count-derived adjustment: Branch / Warehouse Manager;
- material count variance: manager + Operations + Finance;
- manual adjustment not linked to count: Operations / Finance review;
- opening balance: Finance + authorized executive / project owner;
- backdated correction: Finance plus manager / executive as configured.

Final approval makes a manual or linked count-derived adjustment eligible for posting but does not change inventory. Posting must create `adjustment_in` or `adjustment_out` movement through the inventory ledger service, update balance only through that service, mark the record `posted`, preserve source movement lineage, and log all actions. Direct `count_variance` movement types remain future controlled scope.

---

## 8. Physical Count Variances

Count variance should originate from Physical Count workflow whenever possible:
1. Count session stores system balance at cutoff and actual count.
2. System calculates quantity and value difference.
3. User provides reason / narrative per threshold.
4. Count or variance is approved.
5. Future controlled release posts count-variance movement or generates linked adjustment after approval. The `DEC-0023` Stock Adjustment slice does not post count variance.

Material or repeated variance may require recount, verifier sign-off, investigation task, Operations / Finance notification, and inclusion in branch dashboard.

---

## 9. Backdating

Backdated Stock Adjustment is not implemented in the `DEC-0023` slice.

Backdated posting can distort operational and finance reporting. Default rules:
- Current open business period only unless user has backdate permission.
- Backdated wastage / adjustment requires reason, evidence, visible backdate flag, additional approval, effective business date, and system-posting timestamp.
- Closed accounting periods cannot be changed without explicit reopen authority.
- Reports identify effective date, posting date, reason, and approver.

---

## 10. Reversal

Use reversal when posted wastage or adjustment is wrong.

Stock Adjustment reversal is implemented for posted manual `INCREASE` and `DECREASE` adjustments under `DEC-0023`. It is a full-document reversal that writes opposite `REVERSAL` movements linked to the original adjustment movements.

Required:
- Original document and movement reference
- Reason
- Authorized role and policy approval
- Opposite movement
- Lot / expiry preservation where relevant
- Optional linked corrected transaction

Original record remains immutable. Reversal cannot exceed original transaction without a separate authorized adjustment.

---

## 11. Exception Controls

Flag for review:
- loss above threshold;
- repeated same-item / same-branch wastage;
- repeat reports by same reporter;
- manual adjustment not linked to count or source document;
- high-value reductions;
- unusual backdate;
- incomplete evidence;
- negative balance result;
- frequent reversals;
- expiry loss that should have been detected earlier.

Flags are factual prompts for review, not accusations.

---

## 12. Reporting

Exportable reports:
- Wastage by branch, warehouse, brand, item, category, reason, user, date, and value
- Wastage trend / repeated-reason report
- Expired stock report
- Staff meal / complimentary / test-use report
- Adjustment report by type, reason, item, value, user, and approver
- Count variance report
- Backdated record report
- Reversal report
- High-value / incomplete-evidence exception report
- Approval turnaround report

---

## 13. Phase I Acceptance Criteria

1. Authorized user reports wastage with item, quantity, location, reason, and required evidence.
2. Self-final-approval is prevented.
3. Wastage does not post before policy approval.
4. Posted wastage writes traceable negative inventory movement.
5. Stock adjustment foundation records require type, reason, evidence where configured, quantity impact, scope, requester, and audit history.
6. Stock adjustment submit creates approval instances; approval is non-posting.
7. Posting approved manual increase/decrease adjustments writes source-linked `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` movements and updates balances only through the ledger service.
8. Opening balances, direct count-variance movement posting, reclassification, and backdating remain future controlled releases; count-generated adjustments still require Stock Adjustment approval and separate posting.
9. Posted wastage and posted manual stock adjustments cannot be directly edited; correction requires reversal.
10. Material actions have actor, timestamp, and reason in audit trail.
11. Lists filter and export by company, brand, location, item, category, reason, user, approver, status, date, and value.
12. Branch teams can report routine wastage from tablet / mobile without desktop dependence.
