# Branch Expansion Lifecycle and Gate Workflow

## Purpose

Control progression from branch opportunity through project closure while preserving evidence, ownership, approvals, and risk visibility.

## Lifecycle

### 1. Opportunity / Site Evaluation

Inputs: candidate site, brand concept, initial commercial assumptions, mall/location information.

Exit gate: sponsor confirms whether to proceed to business case.

### 2. Business Case & Investment Approval

Inputs: business case, preliminary capex, target opening date, commercial assumptions, risk summary.

Exit gate: authorized investment/capex approval. The project tracker records the gate; Finance remains source of truth for financial approvals.

### 3. Lease, Legal & Permits

Inputs: lease documents, legal review, permit plan, authority requirements, submissions/deadlines.

Exit gate: required lease/legal/permit conditions reached for approved next action.

### 4. Design, BOQ & Technical Planning

Inputs: layout, design approvals, BOQ/technical plans, equipment plan, schedule baseline.

Exit gate: approved design/technical package and controlled procurement readiness.

### 5. Procurement & Contractor Award

Inputs: scoped packages, vendor/contractor selection, PO/contract links, delivery/install plan.

Exit gate: authorized award/procurement state for construction/fitting work.

### 6. Construction / Fit-Out

Inputs: mobilization, construction tasks, inspections, progress photos, defects/punch list, change/issue records.

Exit gate: construction completion and inspection acceptance criteria met.

### 7. Pre-Opening Readiness

Inputs: operations, HR, training, IT, equipment, inventory, marketing, compliance readiness checklists.

Exit gate: controlled opening-readiness approval.

### 8. Opening & Handover

Inputs: soft opening/grand opening plan, handover checklist, operating ownership, issue log.

Exit gate: branch/project handover completed and residual items assigned.

### 9. Post-Opening Stabilization

Inputs: defect closure, operational issue tracking, post-opening review, final cost/reconciliation links.

Exit gate: sponsor/project manager approves closure or archival.

## Gate rules

- Each gate has owner, required evidence, required reviewers/approvers, target date, status, and activity history.
- Failed or incomplete gates block the project from being represented as ready for the next phase.
- An Expansion project cannot move to `Completed` or `Archived` until all nine required lifecycle gates have been generated and achieved. This is enforced with the same project-version concurrency check used by lifecycle actions.
- An approved exception must record reason, approver, impact, expiry/review date, and remediation owner.
- Project phase movement does not alter financial or procurement records.
