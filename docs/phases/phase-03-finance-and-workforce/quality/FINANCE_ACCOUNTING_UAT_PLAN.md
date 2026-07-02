# OGFI ERP — Finance & Accounting UAT Plan

**Status:** Planning specification
**Purpose:** Define mandatory finance acceptance scenarios before any official-accounting production release.

## 1. UAT objectives

Validate that OGFI ERP can create correct, auditable, secure, reversible, and reconcilable financial records without breaking source workflows or allowing duplicate/unauthorized posting.

## 2. Required participants

- Finance owner / controller
- Accountant / AP representative
- Treasury / cash custodian representative
- Operations / branch representative
- Purchasing / receiving representative
- QA lead
- Security reviewer
- Release manager
- Project owner / executive approver

## 3. Core general-ledger scenarios

| ID | Scenario | Expected result |
|---|---|---|
| FIN-GL-001 | Create balanced manual journal draft | Draft validates only when debit = credit. |
| FIN-GL-002 | Attempt unbalanced journal | Posting blocked; no journal/source posting created. |
| FIN-GL-003 | Approve/post manual journal with required segregation | Posted journal becomes immutable with complete audit history. |
| FIN-GL-004 | Attempt to edit/delete posted journal | Blocked; no history loss. |
| FIN-GL-005 | Reverse posted journal | Linked reversal posts equal and opposite entries with reason/evidence. |
| FIN-GL-006 | Retry same automatic source event | Existing journal returned; no duplicate entry. |
| FIN-GL-007 | Simulate transaction failure during posting | No partial journal/source/audit state remains. |
| FIN-GL-008 | Post with missing account mapping | Controlled exception; no silent suspense posting. |
| FIN-GL-009 | Post across unauthorized scope | Blocked and safely audited. |

## 4. Period-close scenarios

| ID | Scenario | Expected result |
|---|---|---|
| FIN-PRD-001 | Post in OPEN period | Allowed only by policy/role. |
| FIN-PRD-002 | Routine post in SOFT_CLOSED period | Blocked or restricted according to configuration. |
| FIN-PRD-003 | Post in LOCKED period | Blocked. |
| FIN-PRD-004 | Authorized reopen request | Requires reason, approval, time-bounded scope, audit event. |
| FIN-PRD-005 | Re-lock after reopen | Required reconciliation/sign-off is captured. |
| FIN-PRD-006 | Attempt period bypass using backdated date | Blocked or routed to configured exception path. |

## 5. AP and payment scenarios

| ID | Scenario | Expected result |
|---|---|---|
| FIN-AP-001 | Invoice matches PO and receipt | Invoice can progress to AP/approval per policy. |
| FIN-AP-002 | Quantity/price mismatch beyond tolerance | Invoice enters exception/hold; payment blocked. |
| FIN-AP-003 | Duplicate supplier invoice number | Flag/block under configured rules; no duplicate AP liability. |
| FIN-AP-004 | Credit note against invoice | Credit is traceable and reduces balance through controlled posting. |
| FIN-AP-005 | User prepares and releases own payment | Blocked where segregation requires different users. |
| FIN-AP-006 | Payment exceeds remaining payable | Blocked. |
| FIN-AP-007 | Payment retry | No duplicate payment/journal. |
| FIN-AP-008 | Supplier bank detail recently changed | Required verification/approval rule enforced. |

## 6. Cash and bank scenarios

| ID | Scenario | Expected result |
|---|---|---|
| FIN-BNK-001 | Branch deposit matches bank statement | Reconciliation can close with traceable links. |
| FIN-BNK-002 | Missing deposit | Exception appears with owner and escalation. |
| FIN-BNK-003 | Duplicate bank statement transaction | Flagged; no duplicate reconciliation settlement. |
| FIN-BNK-004 | Cash shortage | Structured reason/evidence/approval path; no hidden balance edit. |
| FIN-BNK-005 | Preparer attempts own final reconciliation approval | Blocked when segregation configured. |

## 7. Reporting and reconciliation scenarios

| ID | Scenario | Expected result |
|---|---|---|
| FIN-RPT-001 | Trial balance | Debits equal credits and agree to posted GL. |
| FIN-RPT-002 | AP aging | Agrees to outstanding supplier invoice/credit/payment allocations. |
| FIN-RPT-003 | Supplier ledger | Traces to invoice, credit, payment, and journal records. |
| FIN-RPT-004 | P&L by branch/brand | Uses governed dimensions and reconciles to GL. |
| FIN-RPT-005 | Finance exception report | Includes open owned exceptions with status/age. |
| FIN-RPT-006 | Audit trace | Navigates source → journal → payment/reconciliation/close evidence. |

## 8. Security and audit scenarios

- Privileged user cannot bypass period/approval rules through API or UI.
- Cross-company/brand/location data access is denied.
- Audit history is append-only and includes actor/time/action/source.
- Attachment permissions follow source scope.
- Manual journal justification and approval evidence cannot be removed after posting.
- Sensitive bank-account details are masked/permission-controlled as defined by policy.

## 9. UAT exit criteria

Do not authorize official-accounting go-live until:

1. All critical scenarios pass.
2. No unresolved critical data-integrity, authorization, duplicate-posting, period-control, or reconciliation defect remains.
3. Finance owner signs off on real representative transactions.
4. Reconciliation evidence is retained.
5. Backup/restore and rollback/fallback procedures are verified for the release scope.
6. Opening-balance/cutover reconciliation is approved if production books are being established.
7. Required training and user guides are available for the actual released functionality.
