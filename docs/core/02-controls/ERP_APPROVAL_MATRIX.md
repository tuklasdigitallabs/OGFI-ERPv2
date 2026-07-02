# OGFI ERP — Approval Matrix

**Document Type:** Configurable Approval Governance and Phase I Approval Matrix  
**System:** OGFI ERP — Multi-Brand, Multi-Branch Restaurant Operations Platform  
**Applies To:** Phase I foundation; forward-compatible with Phases II–V  
**Status:** Working Baseline — Industry Standard Defaults  
**Last Updated:** June 25, 2026  
**Related Documents:** `ERP_PRODUCT_BRIEF.md`, `ERP_PHASE_IMPLEMENTATION_PLAN.md`, `ERP_MODULE_MAP.md`, `ERP_ROLES_AND_PERMISSIONS.md`

---

## 1. Purpose

This document defines the baseline approval policies for OGFI ERP. It converts currently informal approvals — paper forms, Excel, chat messages, calls, and verbal decisions — into consistent, traceable, configurable workflows.

It is designed for a multi-brand, multi-branch restaurant group with centralized Head Office functions, a main warehouse, possible commissary operations, and future expansion projects.

The matrix is intentionally **configurable**. It establishes standard starting rules for OGFI while allowing future adjustment by company, brand, branch, department, transaction amount, budget status, category, supplier, urgency, and project.

This is not a fixed delegation-of-authority policy. The final named approvers and exact financial limits must be confirmed by OGFI management before production go-live.

---

## 2. Approval Design Principles

1. **No self-approval.** A requester, document creator, or beneficiary cannot approve their own request.
2. **Role-based authority; assignment-based scope.** A user may approve only if their role, company/brand/branch/department/project assignment, and applicable approval rule permit it.
3. **Configuration over hardcoding.** Amount limits, approvers, escalation times, category controls, and exceptions are maintained through administration settings.
4. **Segregation of duties.** High-risk transactions require independent review. One user should not request, approve, receive, adjust, and close the same financial or stock event.
5. **Budget and urgency affect routing.** Unbudgeted, emergency, high-risk, controlled-item, or above-threshold actions route to higher approval.
6. **Approvals create an auditable decision trail.** The system must record requester, approvers, actions, dates, remarks, delegation context, and material amendments.
7. **No silent override.** Changes to approved records must be handled through revision, cancellation, reversal, or change-control workflow.
8. **Approval must be actionable.** Approvers can approve, reject, return for revision, request clarification, or delegate where allowed without leaving the record page.
9. **Mobile-first for branch action.** Branch approvals and urgent stock controls must work on phone or tablet.
10. **Exceptions are allowed but controlled.** Emergency and operational exceptions require reason, evidence, and independent post-review.

---

## 3. Scope and Terminology

### 3.1 Organization scope

Approval rules may be assigned at one or more levels:

```text
Platform / Tenant
  → Company
    → Brand
      → Branch / Warehouse / Commissary / Project Site
        → Department / Cost Center
```

A lower-level rule may override a higher-level default only when its priority is explicitly configured and active.

### 3.2 Standard approver roles

| Role | Standard approval purpose |
|---|---|
| Branch Manager | First-level control of branch-originated operational and purchasing requests |
| Department Head | Functional ownership and business-need validation |
| Purchasing Manager | Supplier selection, purchasing policy, and PO review |
| Warehouse Manager | Warehouse inventory, transfer, and receiving-control review |
| Operations Manager | Branch operational, stock, food-cost, and wastage control |
| Accounting Manager | Financial control, budget review, accounting-policy review |
| Finance Officer | Finance review or processing support; final authority only when specifically configured |
| General Manager | Cross-functional and higher-value operating approval |
| CEO / Executive / Authorized Signatory | Final approval for strategic, high-value, capex, or exception transactions |
| Project Manager | Project owner review for project-related scope and readiness decisions |
| System Administrator | Workflow setup only; no default business approval authority |
| Auditor | Read-only inspection; no approval authority |

### 3.3 Transaction value

Unless a rule defines otherwise, **transaction value** means the total expected value of the document including applicable taxes, delivery charges, and committed cost components.

For stock transactions, the ERP should use the current approved inventory valuation method or latest approved unit cost to calculate estimated financial value.

### 3.4 Budget status

| Budget status | Meaning |
|---|---|
| Budgeted | Expense or purchase is within an approved budget and available remaining budget. |
| Partially Budgeted | Only part of the request is covered by available budget. |
| Unbudgeted | No approved budget line exists for the request. |
| Over Budget | A budget exists but remaining budget is insufficient. |
| Not Applicable | Budget review is not required for the transaction type or phase. |

### 3.5 Urgency classification

| Urgency | Definition | Default treatment |
|---|---|---|
| Normal | Requested with standard planning lead time | Standard route and reminders |
| Urgent | Delay may affect operations but does not create immediate critical failure | Standard route with shortened review target |
| Emergency | Immediate action is required to prevent service interruption, food-safety risk, safety risk, critical equipment failure, regulatory breach, or major stockout | Emergency route, mandatory reason/evidence, post-review |

---

## 4. Configurable Rule Engine

### 4.1 Rule inputs

The approval engine must support rules based on:

- Transaction type and subtype
- Company
- Brand
- Branch, warehouse, commissary, project site, or project
- Department and cost center
- Requester role or employee group
- Amount threshold and currency
- Budget status
- Item, expense, or inventory category
- Controlled / high-risk item flag
- Supplier status or supplier category
- Urgency classification
- Project stage
- Exception indicator
- Named approver, role approver, or approval group
- Effective start and end dates

### 4.2 Rule precedence

When more than one rule applies, the system should resolve routes in this order:

1. **Legal, regulatory, or mandatory control rule**
2. **Transaction-specific exception rule**
3. **Emergency rule**
4. **Project or controlled-item rule**
5. **Branch / warehouse / project-specific rule**
6. **Brand-specific rule**
7. **Department or cost-center rule**
8. **Company-level default rule**
9. **Platform fallback rule**

The active rule should be visible to authorized users in the record’s approval panel, including the reason it applied.

### 4.3 Approval steps

Each approval step should support:

- One named approver
- A role-based approver resolved from current assignments
- Any one of a defined approval group
- All members of a defined approval group
- Sequential approval
- Parallel approval
- Optional review / acknowledgement
- Conditional step based on the record values
- Delegated approver
- Escalated approver

### 4.4 Approval outcomes

| Outcome | Meaning | System effect |
|---|---|---|
| Approve | Approver authorizes the record at their step | Advances to the next required step or approved status |
| Reject | Approver does not authorize the record | Record becomes rejected; requester is notified |
| Return for Revision | Information, documents, quantity, supplier, or rationale must be corrected | Record returns to requester/editable status; resubmission creates a new approval cycle |
| Request Clarification | Approver requests input while retaining the approval task | Record remains in review; comments and attachments are required |
| Delegate | Approver transfers authority for a defined period under a recorded delegation | Task is reassigned to valid delegate |
| Escalate | System or authorized user moves a delayed item to the next configured authority | Original task remains visible in audit history |
| Cancel | Authorized user stops the workflow before completion | Record is cancelled with reason and, where required, approval |
| Reverse / Void | Authorized user neutralizes a posted or completed operational/financial effect | Creates counter-records or reversal audit trail; never silently erases history |

---

## 5. Baseline Financial Thresholds

The following amounts are starting defaults only. They must be configurable per company and may be refined after OGFI maps actual authority levels.

| Tier | Transaction value | Default approval requirement |
|---|---:|---|
| Tier 1 | Up to ₱10,000 | Branch Manager or Department Head, depending on origin |
| Tier 2 | ₱10,001–₱50,000 | Department Head + Finance / Accounting review where money is committed |
| Tier 3 | ₱50,001–₱200,000 | Department Head + Accounting Manager + General Manager |
| Tier 4 | Above ₱200,000 | Department Head + Accounting Manager + General Manager + CEO / Executive |
| Special | Any amount | Higher route for capex, new supplier, controlled item, emergency exception, unbudgeted request, contract/lease, or policy override |

### 5.1 Threshold handling

- The system must use the **highest applicable rule**; it cannot split a request to avoid approval limits.
- Related requests that appear intentionally divided may be flagged for review based on same requester, supplier, category, branch, or date range.
- Currency conversion, if introduced later, must use the company’s configured conversion policy.
- A configurable “material change” percentage and value threshold should determine whether a revised document must restart approvals.

### 5.2 Recommended material-change default

A document should require reapproval when an approved change causes any of the following:

- total value increases by more than **10%**;
- total value increases by more than **₱5,000**;
- supplier changes;
- controlled/high-risk item changes;
- delivery location changes;
- urgent/emergency classification changes;
- budget status changes from budgeted to partially budgeted, unbudgeted, or over budget;
- quantity or specification changes that materially affect operations.

These thresholds must be configurable by transaction type.

---

## 6. Standard Lifecycle and Service Levels

### 6.1 Common approval statuses

```text
Draft
→ Submitted
→ In Review
→ Approved
→ Rejected / Returned for Revision
→ Completed / Closed
```

Where appropriate:

```text
Cancelled
→ Reversed
→ Superseded
→ Archived
```

### 6.2 Default response targets

| Workflow classification | First reminder | Second reminder | Escalation target |
|---|---:|---:|---:|
| Normal | 24 hours | 48 hours | 72 hours |
| Urgent | 8 business hours | 16 business hours | 24 business hours |
| Emergency | 1 hour | 2 hours | 4 hours or configured immediate escalation |
| Project milestone / contractual | Configurable by milestone due date | Configurable | Escalate before due date based on risk window |

The system should support in-app notifications first, with optional email and other channels later. The exact use of business hours versus calendar hours must be configurable by company and branch operating calendar.

### 6.3 Reminder and escalation safeguards

- An escalation does not erase the original assigned approver.
- Escalated approval authority must be configured; the system must not automatically bypass a required Executive approval.
- A user cannot intentionally reassign an item to themselves to create a self-approval path.
- Repeated overdue items should appear on manager and Executive dashboards.

---

## 7. Phase I Approval Matrix

Phase I covers the foundation, approval engine, supplier master data, purchasing, receiving, inventory, transfers, stock counts, wastage, stock adjustments, dashboards, notifications, attachments, and audit trails.

### 7.1 Matrix legend

- **Originator**: role normally allowed to create and submit.
- **Reviewer**: validates completeness, operational need, supplier/purchasing logic, or finance control.
- **Approver**: authorizes progression based on the active rule.
- **Verifier**: confirms factual completion, receipt, count, or resolution.
- **Mandatory evidence**: documents, photos, comments, and supporting records required before action.
- **Configurable**: the route is a baseline; it must be editable in the ERP.

---

### 7.2 Purchase Request (PR)

**Purpose:** Request goods, services, repairs, supplies, equipment, or other purchases before a purchase order or authorized direct purchase.

| Attribute | Baseline |
|---|---|
| Originators | Branch Manager, Assistant Restaurant Manager, Supervisor, Storekeeper, Restaurant Accountant, Department staff with requester permission |
| Required scope | Company, branch/project/location, department, cost center, request date, required date, category, purpose |
| Mandatory evidence | Item/specification, quantity, unit, required date, business reason; attachment for non-standard or high-value request |
| Standard route | Requester → Immediate Manager / Branch Manager → Department Head → Finance review where required → GM / Executive by threshold or exception |
| Budgeted request | Branch/Department validation → Finance review if threshold/category requires it |
| Unbudgeted / over-budget request | Branch/Department validation → Accounting Manager → General Manager → Executive by threshold or policy |
| Controlled / high-risk item | Purchasing Manager and/or Accounting Manager review is required in addition to amount-based route |
| Completion condition | Approved PR creates or becomes eligible for quotation/PO processing |
| Rejection / revision | Must include reason; requester may edit and resubmit as a new approval cycle |
| Cancellation | Requester can cancel before purchasing action unless workflow policy requires manager approval; after PO creation, cancellation must coordinate with PO cancellation |

**Default conditional routing**

| Condition | Additional or modified route |
|---|---|
| Branch-originated routine request up to Tier 1 | Branch Manager approval; Department Head if requester is the Branch Manager |
| Value within Tier 2 | Department Head + Finance / Accounting review |
| Value within Tier 3 | Department Head + Accounting Manager + General Manager |
| Tier 4 or higher | Department Head + Accounting Manager + General Manager + CEO / Executive |
| Emergency | Emergency Purchase workflow; cannot skip post-review |
| No approved budget / over budget | Accounting Manager + General Manager; Executive if configured by threshold |
| Capex / equipment / renovation | Finance + General Manager + Executive regardless of amount |
| New category / non-standard item | Purchasing Manager review |
| Supplier nominated by requester | Purchasing review required; requester cannot unilaterally select supplier |
| Requester is final standard approver | Route must skip self and go to next valid independent authority |

---

### 7.3 Emergency Purchase Request

**Purpose:** Permit a controlled purchase when immediate action is needed to prevent critical operational interruption, food-safety risk, safety risk, regulatory risk, or material revenue loss.

| Attribute | Baseline |
|---|---|
| Originators | Branch Manager, Assistant Restaurant Manager, designated Operations Manager, designated Storekeeper with Branch Manager confirmation |
| Required conditions | Emergency reason category, impact description, supplier/source, estimated cost, proof of urgency, required-by time |
| Mandatory evidence | Photo/video where relevant, incident reference where applicable, supplier quotation or price evidence where practicable, receipt after purchase |
| Pre-purchase approval | Branch Manager or Operations Manager; if requester is Branch Manager, Operations Manager or next independent authority |
| Post-purchase review | Purchasing Manager / Officer confirmation + Finance / Accounting review + higher approval based on threshold or exception |
| Completion condition | Receipt/proof uploaded; purchase recorded; inventory received or expense documented; post-review completed |
| Prohibited use | Convenience purchases, routine late planning, avoidance of standard sourcing, repeated forecastable demand, or splitting a planned purchase |
| Monitoring | Emergency purchase frequency and value appear on dashboards by branch, requester, category, and supplier |

**Emergency approval route**

```text
Requester
→ Branch Manager or Operations Manager pre-approval
→ Purchase / immediate action
→ Receipt and supporting evidence upload
→ Purchasing post-review
→ Finance / Accounting review
→ General Manager / Executive where threshold or exception applies
```

**Default emergency controls**

- The user must choose a defined emergency reason category.
- The system should require a written explanation of why standard purchasing could not be used.
- Repeated emergency purchases of the same item/category trigger a warning and management review.
- The ERP should flag emergency purchase requests submitted after the purchase timestamp without valid delegated authority.
- Emergency status does not exempt the transaction from budget, audit, supplier, receiving, or inventory controls.

---

### 7.4 Supplier Accreditation, Activation, and Material Supplier Changes

**Purpose:** Ensure suppliers are approved, traceable, and reviewed before they are available for purchasing.

| Attribute | Baseline |
|---|---|
| Originators | Purchasing Officer, Purchasing Manager, authorized Finance or Warehouse user for data submission only |
| Required data | Legal name, tax/registration details, contact details, category, payment terms, delivery coverage, required documents, bank/payment data where applicable |
| Mandatory evidence | Registration documents, tax documents, quotation or commercial proposal, certifications where required, bank details validation where applicable |
| Standard route | Purchasing Manager → Accounting Manager / Finance review → General Manager or Executive for strategic/high-risk supplier |
| High-risk suppliers | Food safety critical, sole source, high-value, related-party, import, construction, or supplier with banking changes require elevated review |
| Completion condition | Supplier becomes Active / Approved in Supplier Master |
| Rejection / revision | Missing documents, failed validation, commercial concern, or policy non-compliance |
| Deactivation | Purchasing Manager initiates; Finance and affected operations are notified; open POs are reviewed before deactivation |

**Material changes requiring review**

| Change | Minimum control |
|---|---|
| Legal entity or tax information | Purchasing + Finance review |
| Bank / payment information | Finance verification; dual-control where available |
| Supplier status from inactive to active | Purchasing Manager approval |
| Supplier category added for controlled items | Purchasing + Operations/QA or Finance, as configured |
| Payment terms exception | Accounting Manager + General Manager |
| Sole-source designation | Purchasing Manager + Department Head + Finance / GM as configured |
| Related-party flag | Accounting Manager + Executive review |

---

### 7.5 Quotation Comparison and Supplier Selection

**Purpose:** Document the commercial basis for selecting a supplier and ensure cost, quality, delivery, and policy considerations are visible.

| Attribute | Baseline |
|---|---|
| Originators | Purchasing Officer, Purchasing Manager |
| Trigger | Approved PR requiring sourcing, quotation comparison, supplier change, or non-contract purchase |
| Mandatory evidence | At least the configured number of quotations, supplier comparison, delivery lead time, item specification, commercial rationale |
| Standard route | Purchasing Manager → Requesting Department Head / Branch Manager confirmation → Finance review for threshold or exception → GM/Executive by threshold |
| Standard quotation count | Three quotations for non-routine/non-contracted purchases, subject to configurable exceptions |
| Exception route | Sole source, emergency, franchise-mandated supplier, contract supplier, or low-value routine purchase must record reason |
| Completion condition | Selected supplier is authorized for PO creation |
| Audit rule | Award rationale and rejected quotations remain attached to the record |

**Default exceptions to three-quotation rule**

- Approved contract-price supplier
- Franchise-mandated supplier
- Approved sole-source supplier
- Emergency purchase
- Low-value routine purchase below configurable limit
- Standard replenishment under a current approved purchasing agreement
- Category with a documented limited market

An exception must include a reason and the authorizing approval required by the active rule.

---

### 7.6 Purchase Order (PO)

**Purpose:** Commit the company to purchase approved goods or services from an approved supplier.

| Attribute | Baseline |
|---|---|
| Originators | Purchasing Officer, Purchasing Manager; authorized direct-PO users only where configured |
| Prerequisite | Approved PR or approved direct-purchase authority; selected supplier; valid supplier status |
| Mandatory evidence | PR reference, quotation comparison or exception, supplier, items, quantity, prices, tax/charges, delivery location, required date, terms |
| Standard route | Purchasing Manager review → Finance / Accounting review if threshold, budget, or exception requires → GM / Executive where required |
| Low-value routine PO | May auto-approve from an approved PR if system policy and supplier/item controls allow |
| High-value / exception PO | Must follow full amount and exception route |
| Completion condition | PO status becomes Approved / Released; supplier notification is recorded |
| Amendment | Material changes restart approvals; non-material changes require a reason and controlled amendment log |
| Cancellation | Requires Purchasing Manager plus the appropriate authority based on PO status/value; supplier cancellation notice logged |

**PO-specific controls**

- A PO must identify destination branch, warehouse, commissary, or project site.
- Supplier must be active and approved for the relevant category unless an authorized exception applies.
- Unit price increases above configured variance against last purchase price trigger a review warning.
- PO creation must not exceed approved PR amount without amendment/reapproval.
- A PO cannot be marked fully closed until receiving is complete, cancelled balance is approved, or service completion is verified.
- A PO creator cannot be the only final approver of the same PO.

---

### 7.7 Receiving Report and Delivery Discrepancy

**Purpose:** Confirm factual receipt of goods or services and create a controlled basis for inventory stock-in, supplier follow-up, and later invoice matching.

| Attribute | Baseline |
|---|---|
| Originators / receivers | Storekeeper, Warehouse staff, designated Branch receiver, authorized Restaurant Accountant for service receipt |
| Prerequisite | Approved PO or authorized emergency/direct purchase reference |
| Mandatory evidence | Supplier delivery document, received quantities, accepted/rejected quantities, receiving date/time, receiver identity; photo where required |
| Standard approval | No standard pre-approval for normal receipt; independent verification applies to discrepancies, overrides, and non-PO receipt |
| Completion condition | Accepted goods create inventory movement; rejected/short/excess quantities create discrepancy record |
| Independent control | Receiver cannot be the only person approving a material discrepancy or non-PO receipt |
| Service receipt | Department owner or authorized requester verifies service completion before payment workflow can proceed |

**Discrepancy routing**

| Condition | Required action / route |
|---|---|
| Short delivery | Receiver records discrepancy → Purchasing notified → PO remains open for balance, replacement, credit, or closure decision |
| Excess delivery | Receiver records excess → Purchasing decides accept/return → Finance notified if accepted value differs |
| Damaged / quality-rejected delivery | Receiver records photo/evidence → Purchasing + Operations/QA or Branch Manager review → return/replacement action |
| Unit-price mismatch on document | Receiving may record receipt but flags Finance/Purchasing review before invoice/payable progression |
| Non-PO receipt | Branch Manager / Department Head + Purchasing + Finance review; treated as exception |
| Material receiving adjustment | Warehouse Manager / Branch Manager + Purchasing or Finance approval based on value and category |
| Backdated receipt | Requires reason and Warehouse/Finance approval as configured |

---

### 7.8 Warehouse-to-Branch Transfer

**Purpose:** Move approved stock from central warehouse or commissary to a receiving branch while preserving custody, quantity, valuation, and audit trail.

| Attribute | Baseline |
|---|---|
| Originators | Warehouse Storekeeper, Warehouse Manager, authorized Branch requester through replenishment request |
| Prerequisite | Approved branch replenishment request or transfer policy; available stock at source; valid destination |
| Mandatory evidence | Transfer number, source, destination, item lines, quantities, dispatch date/time, sender, receiver, transport evidence where applicable |
| Standard route | Branch request approval if required → Warehouse Manager authorization → Sender dispatch → Destination receiver confirmation |
| Completion condition | Receiver confirms accepted quantity; inventory decreases at source and increases at destination |
| Independent control | Sender and receiver must be different users; destination receiver cannot confirm before dispatch |
| Discrepancy | Quantity/quality discrepancy creates a transfer exception requiring review |
| Cancellation | Permitted only before dispatch; post-dispatch requires reversal/return-transfer workflow |

**Default additional controls**

- Transfers to branches should respect approved replenishment levels when such rules are introduced.
- Controlled/high-value items may require dual verification at source or destination.
- Transfer status should clearly distinguish `Draft`, `Authorized`, `Dispatched`, `Partially Received`, `Received`, `Disputed`, `Cancelled`, and `Reversed`.
- Unconfirmed dispatched transfers should appear on warehouse and branch dashboards.

---

### 7.9 Branch-to-Branch Transfer

**Purpose:** Permit an exceptional or planned stock movement between branches with both branch owners accountable.

| Attribute | Baseline |
|---|---|
| Originators | Branch Manager, Storekeeper with Branch Manager approval |
| Prerequisite | Need at destination, available stock at source, valid transfer reason, branch scope permission |
| Mandatory evidence | Transfer reason, item list, quantities, source/destination, urgency, transport method, sender/receiver |
| Standard route | Source Branch Manager → Destination Branch Manager → Operations Manager when threshold, controlled category, or exception requires |
| Completion condition | Destination confirms receipt; source and destination inventory ledgers post matched movements |
| Default treatment | Allowed but controlled; should not replace planned warehouse replenishment |
| Discrepancy | Operations Manager and Warehouse Manager review where material |
| Cancellation | Before dispatch only; after dispatch use return/reversal workflow |

**Escalated conditions**

- Transfer of controlled/high-value item
- Transfer above configured value
- Transfer to resolve recurring stockout
- Inter-brand transfer with different cost centers
- Transfer during stock count lock period
- Transfer from a branch with negative/insufficient stock
- Transfer without destination acknowledgment

These conditions should require Operations Manager and/or Finance review based on configuration.

---

### 7.10 Wastage, Spoilage, Staff Meal, Complimentary Use, and Return to Supplier

**Purpose:** Capture stock loss, non-sale consumption, or return events so inventory and food-cost controls remain reliable.

| Attribute | Baseline |
|---|---|
| Originators | BOH Supervisor, FOH Supervisor, Storekeeper, Branch Manager, designated Kitchen Staff with supervisor validation |
| Required data | Location, item, quantity, unit, reason code, event date/time, estimated value, linked incident/quality issue where relevant |
| Mandatory evidence | Photo for configurable categories/value threshold; remarks; item batch/expiry where tracked |
| Standard route | Branch Manager → Operations Manager for material/repeated/high-risk waste → Finance / Accounting review where threshold or policy requires |
| Routine low-value wastage | Branch Manager approval, subject to category/value controls |
| Material / repeated wastage | Branch Manager + Operations Manager + Finance / Accounting review |
| Completion condition | Approved record posts inventory movement and becomes available in waste analytics |
| Staff meal / complimentary use | Must use defined reason/category and may require Branch Manager approval; cannot be entered as generic wastage |
| Return to supplier | Purchasing involvement required; receiving/inventory evidence and credit/replacement tracking required |

**Default escalation conditions**

| Condition | Additional approval or review |
|---|---|
| High-value item | Operations Manager + Finance / Accounting |
| Repeated same item/reason above threshold | Operations Manager review; alert to Branch Manager |
| Food-safety / expiry-related waste | Operations / QA review and corrective-action reference |
| Suspected theft, unexplained loss, or count discrepancy | Operations Manager + Accounting Manager; incident investigation path |
| Wastage during stock count or after close | Warehouse/Operations review |
| Wastage above branch’s daily/weekly configurable limit | Operations Manager and Finance review |
| Return to supplier | Purchasing Manager approval / confirmation |

---

### 7.11 Stock Adjustment

**Purpose:** Correct an inventory ledger only when a controlled reason exists and count, receiving, transfer, or system discrepancies have been investigated.

| Attribute | Baseline |
|---|---|
| Originators | Storekeeper, Warehouse Manager, Branch Manager, authorized Inventory Controller |
| Prohibited use | Routine correction for missing documentation, unrecorded usage, or avoidance of transfer/receiving processes |
| Required data | Location, item, adjustment direction, quantity, estimated value, reason code, source reference, evidence |
| Mandatory evidence | Count sheet, discrepancy analysis, photo where applicable, remarks; linked PR/PO/receiving/transfer/waste reference when relevant |
| Standard route | Branch/Warehouse Manager → Operations Manager → Accounting Manager / Finance for material value or high-risk items |
| Completion condition | Approved adjustment creates inventory movement and audit record |
| Independent control | Originator cannot be sole approver; count verifier should be independent for material adjustments |
| Backdating | Requires reason and elevated review |

**Adjustment routing by value/risk**

| Condition | Minimum route |
|---|---|
| Minor adjustment within local tolerance | Branch or Warehouse Manager |
| Above configured value tolerance | Branch/Warehouse Manager + Operations Manager |
| High-value, controlled, pilferage-prone, or repeated variance item | Operations Manager + Accounting Manager / Finance |
| Adjustment from system defect or migration error | System Administrator evidence + Operations/Finance business approval |
| Negative stock correction | Warehouse/Operations review; system should flag root cause |
| Backdated adjustment | Warehouse/Branch Manager + Accounting Manager or Finance |
| Adjustment after period close | Accounting Manager approval; may require reversal and repost in current period depending on finance policy |

---

### 7.12 Physical Inventory Count and Variance Approval

**Purpose:** Capture physical counts, compare them to system balance, investigate variances, and post only approved corrections.

| Attribute | Baseline |
|---|---|
| Originators / counters | Storekeeper, warehouse staff, branch inventory team |
| Required controls | Count schedule, count freeze/lock where applicable, counter and verifier identity, blind count option where configured |
| Mandatory evidence | Count sheet or mobile count records, recount evidence for material variance, variance explanation |
| Standard route | Counter submits → Independent verifier confirms → Branch/Warehouse Manager reviews → Operations/Finance reviews material variances |
| Completion condition | Approved count variance creates approved adjustment or count close record |
| Independent control | Counter and verifier should be different users for material/high-risk categories |
| Dashboard | Missing counts, late counts, and high variances appear on management dashboards |

**Variance thresholds**

| Condition | Minimum action |
|---|---|
| Within tolerance | Branch/Warehouse Manager review and count closure |
| Above value or percentage tolerance | Recount + Branch/Warehouse Manager + Operations Manager |
| High-value / controlled item variance | Recount + Operations Manager + Accounting Manager / Finance |
| Repeated variance at same branch/item | Root-cause action required; Operations Manager alerted |
| Negative variance during locked period | Requires count reopening authority and documented reason |
| Large positive variance | Must investigate unrecorded receiving/transfer before posting stock increase |

---

### 7.13 Backdated Transactions

**Purpose:** Allow limited correction of genuine late entries without compromising the integrity of inventory and financial period controls.

| Attribute | Baseline |
|---|---|
| Eligible records | Receiving, transfer confirmation, wastage, stock adjustment, count correction; other document types as configured |
| Originators | Authorized user with relevant transaction permission |
| Mandatory evidence | Backdate reason, actual event date, discovered date, source document/photo, impact explanation |
| Standard route | Relevant operational manager → Accounting Manager / Finance when period or valuation impact applies |
| Prohibited use | Convenience, concealment of late action, avoiding cutoff controls, or changing prior approved decisions without audit |
| Completion condition | Approved backdated transaction posts with both event date and entry/approval timestamps preserved |

**Default time windows**

| Timing | Default treatment |
|---|---|
| Same open operating day | Manager review as configured |
| Prior open period | Operations/Warehouse Manager + Finance review |
| Closed accounting period | Accounting Manager approval; may require current-period adjustment instead of historical repost |
| Long-dated exception | General Manager / Executive approval as configured |

---

### 7.14 Cancellation, Reversal, and Approved-Document Amendment

**Purpose:** Stop, correct, or replace records without losing auditability or leaving inventory/financial commitments unclear.

| Transaction | Default cancellation / reversal route |
|---|---|
| Draft PR | Requester may cancel; reason required where configured |
| Submitted PR | Requester requests cancellation → current approver or Branch/Department Manager confirms |
| Approved PR with no PO | Requester / Purchasing requests cancellation → Department Head; Finance if budget reservation exists |
| PO before supplier release | Purchasing Manager; Finance/GM if value or budget status requires |
| PO after supplier release but before receipt | Purchasing Manager + Department Head; supplier cancellation evidence required; Finance notified |
| PO with partial receipt | Purchasing Manager + Finance/Accounting; close remaining balance, replacement, return, or credit action required |
| Receiving report | Cannot be deleted; correction via discrepancy, return, or reversal workflow |
| Dispatched transfer | Cannot be cancelled; use receipt, dispute, return transfer, or reversal workflow |
| Approved wastage | Correction through reversal/adjustment with Operations/Finance approval as applicable |
| Stock adjustment | Reverse via counter-adjustment; original remains visible |
| Closed stock count | Reopen only with authorized manager approval and reason |
| Supplier activation | Deactivate rather than delete; open documents reviewed |

**Amendment rule**

Material amendments must create a new revision number and restart approval from the configured point. The system must retain:

- original approved record;
- amendment reason;
- changed fields and before/after values;
- new approval route and actions;
- link between superseded and active revision.

---

## 8. Non-Financial but High-Risk Approval Controls

Some actions can cause material risk even without a purchase amount. They should use configurable approval routes.

| Action | Minimum control |
|---|---|
| Supplier bank/payment detail change | Finance verification and audit record |
| Item master creation for controlled item | Purchasing/Warehouse ownership; Finance/Operations review as configured |
| Unit of measure conversion change | Inventory/Finance review; impacts costing and ledger |
| Inventory item deactivation | Warehouse/Purchasing review; open transactions checked |
| Item cost override | Finance / Purchasing review |
| User role or scope assignment change | IT Administrator initiates; authorized manager approval for sensitive access |
| Approval matrix rule change | System Admin configures; Executive/GM or policy owner approval; version history required |
| Document-numbering or fiscal setting change | System Admin + Accounting Manager review |
| Export of confidential data | Limited to authorized roles; audit log |
| Attachment deletion/replacement | Controlled by document policy; original version retained where material |

---

## 9. Delegation of Approval Authority

### 9.1 Delegation requirements

Delegation may be used when an approver is on leave, unavailable, temporarily reassigned, or otherwise unable to act.

A delegation record must include:

- delegating approver;
- delegate;
- transaction types and scope;
- effective start and end date/time;
- maximum amount or authority limit;
- reason;
- approval of the delegation where required;
- automatic expiry.

### 9.2 Delegation restrictions

- A delegate cannot approve their own request.
- Delegation cannot bypass final Executive/Authorized Signatory approval where policy requires a named person.
- A delegate must have equivalent or higher base role permissions and relevant scope.
- Delegation to a direct requester on a pending transaction is prohibited.
- All actions must clearly show `Approved by [Delegate] on behalf of [Original Approver]`.

### 9.3 Default delegation approval

| Delegated authority | Default approver for delegation setup |
|---|---|
| Branch Manager authority | Operations Manager |
| Department Head authority | General Manager |
| Purchasing Manager authority | General Manager or Executive |
| Accounting Manager authority | General Manager or Executive |
| General Manager authority | CEO / Executive |
| Executive authority | Authorized Signatory / Board-defined policy; not auto-delegated by the ERP |

---

## 10. Escalation and Exception Management

### 10.1 Escalation route

```text
Assigned Approver
→ Reminder
→ Second Reminder
→ Escalation to configured manager / alternate approver
→ Dashboard red flag
→ Executive visibility for repeatedly overdue material items
```

### 10.2 Exception cases requiring elevated review

- Request exceeds normal approval threshold.
- Request is unbudgeted or over budget.
- Supplier is new, inactive, sole-source, related-party, or has changed bank details.
- Purchase is emergency or retrospectively entered.
- Price variance exceeds configured tolerance.
- Controlled or high-value item is involved.
- Stock adjustment, wastage, or variance exceeds tolerance.
- Transaction is backdated.
- An approved record needs cancellation, amendment, or reversal.
- Required supporting document is missing.
- A user requests an override of a system control.

### 10.3 Override policy

Overrides must never be silent. The system must capture:

- overridden control;
- rationale;
- authorizing role/user;
- supporting evidence;
- effective scope and duration if ongoing;
- related transaction/reference;
- audit timestamp.

A control override should expire automatically unless renewed through a new approval.

---

## 11. Approval Screen Requirements

Every approval page or mobile approval panel must show, without requiring navigation to another page:

- document number and current status;
- company, brand, branch/warehouse/project, department, and cost center;
- requester and request date;
- total amount and budget status where relevant;
- supplier and price comparison information where relevant;
- key items, quantities, and required-by date;
- attachments, photos, and comments;
- prior approval actions;
- current step, next approver, and SLA due time;
- variance, exception, and control flags;
- clear actions: Approve, Reject, Return for Revision, Request Clarification;
- a required remarks field for rejection, return, override, and exception approval.

The layout must use the shared ERP spacing token for consistent desktop/tablet/mobile readability.

---

## 12. Dashboard and Reporting Requirements

### 12.1 Approver work queue

Each approver should see:

- items awaiting their decision;
- urgency;
- due time and overdue status;
- amount, branch/location, requester, and transaction type;
- exception flags;
- quick approve/reject/revise actions subject to permission.

### 12.2 Management control dashboard

Management should see:

- pending and overdue approvals by role, branch, department, and transaction type;
- approval cycle time;
- emergency purchases by branch/category/supplier;
- unbudgeted and over-budget requests;
- PO value awaiting approval;
- receiving discrepancies;
- open transfers and aging;
- wastage value and unusual trends;
- stock adjustments and count variances;
- repeated approval bypass attempts or overrides;
- supplier status changes;
- cancelled, reversed, and amended documents.

### 12.3 Audit reporting

Auditors and authorized management must be able to filter by:

- transaction type;
- date range;
- company, brand, branch, warehouse, department, cost center, or project;
- requester, approver, delegate, or actor;
- approval status/outcome;
- amount/value threshold;
- exception type;
- supplier, item, or category;
- backdated, emergency, override, cancellation, or reversal indicator.

---

## 13. Configuration Data Required in the ERP

The administration interface must support the following configuration records:

- transaction type and subtype;
- approval matrix rule;
- rule priority;
- scope filters;
- amount ranges;
- budget-status condition;
- urgency condition;
- category/control flag condition;
- approval step sequence;
- approver role, approval group, or named approver;
- whether step is `any one`, `all`, `parallel`, `sequential`, or `optional`;
- delegation eligibility;
- reminder/escalation timings;
- required attachments/evidence;
- material-change threshold;
- exception policy;
- effective date range;
- active/inactive status;
- version number and change history.

Changes to approval configuration must be auditable and should require formal policy-owner approval.

---

## 14. Go-Live Decisions Still Required

The following items are intentionally left configurable but must be confirmed before production rollout:

1. Named approvers and backup approvers per department, branch, warehouse, and project.
2. Final financial thresholds by transaction type and company policy.
3. Budget holders, budget categories, and whether budget reservation begins at PR or PO.
4. Controlled/high-value item list and variance tolerances.
5. Required quotation count by purchase category and value.
6. Emergency purchase reason codes and maximum allowed retrospective time.
7. Required supporting documents and photo requirements by category.
8. Stock count frequency, period-close rules, and count tolerance thresholds.
9. Supplier accreditation document checklist and related-party policy.
10. Notification channels and business-hour calendars.
11. Authorized signatories and Executive delegation policy.
12. Record-retention period and attachment policy.

---

## 15. Phase I Acceptance Criteria

Phase I approval controls are ready for pilot when:

1. Every PR, PO, transfer, wastage report, stock adjustment, and inventory count can resolve an approval route from configured rules.
2. A requester cannot approve their own transaction.
3. Branch users cannot access transactions outside their assigned branch scope.
4. Amount, budget status, urgency, category, and location can change the route as configured.
5. Delegation, reminders, and escalation work without deleting the original approver history.
6. Rejection, return-for-revision, cancellation, amendment, reversal, and backdating retain a complete audit trail.
7. Material changes restart approval when policy requires.
8. Receiving discrepancies and unconfirmed transfers are visible to responsible managers.
9. Wastage, stock adjustment, and physical-count variance controls prevent unapproved inventory posting.
10. Management dashboards show pending, overdue, emergency, exception, and high-value actions.
11. Config changes are versioned and limited to authorized administrators/policy owners.
12. Pilot users can complete their approval actions on supported mobile and tablet devices.

---

## 16. Operating Principle

> The ERP must make it easy to approve the right thing quickly, difficult to bypass the right control, and impossible to hide how a decision was made.

This Approval Matrix is the baseline for Phase I. It should be reviewed after the first pilot branch/warehouse cycle, then refined through configuration rather than code changes.


---

## Projects & Implementation Tracker — Approval Boundary

The Phase 1.5 tracker does not create a separate generic approval engine for ordinary task completion. Where a project requires a formal decision, it must either:

1. use an existing configured ERP approval workflow through a linked controlled record; or
2. use an explicitly configured project gate with named authorized approvers and documented evidence requirements.

Examples of project gates may include project charter approval, template approval, project closure, restricted-visibility change, or milestone sign-off. A task card must not be used to bypass a Purchase Order, budget, supplier, inventory, or other financial/controlled approval route.
