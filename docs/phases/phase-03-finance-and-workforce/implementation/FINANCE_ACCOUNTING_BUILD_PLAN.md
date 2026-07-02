# OGFI ERP — Finance & Accounting Build Plan

**Status:** Planning only
**Purpose:** Define the safest staged sequence for building an official accounting system of record without destabilizing existing procurement, inventory, projects, or working application code.

## 1. Build preconditions

Do not begin finance code until all are complete:

- Finance & Accounting Decision Council completed.
- Confirmed decision record for accounting system of record is present.
- Current repository compatibility review completed.
- Finance owner, accountant/controller, and implementation owner assigned.
- Open policy decisions are identified and categorized as build blocker, configurable baseline, or later release.
- Existing procurement, receiving, inventory, approval, audit, and project data boundaries are mapped.
- Backups, staging environment, migration rehearsal approach, and restore test plan are available.

## 2. Delivery principle

Build finance as a modular domain. Do not add finance rules directly into purchase, inventory, project, or UI components.

```text
Source domain
→ governed financial event
→ finance posting service
→ general ledger / subledger
→ reconciliation / close
→ reports
```

No release should introduce a broad “post to accounting” button without controlled source eligibility, mapping, idempotency, audit, authorization, period checks, and reversal behavior.

## 3. Safe workstreams

### Workstream A — Discovery and design

Deliverables:

- Actual code/data path map
- Finance source-event inventory
- Gap/conflict register
- Approved chart-of-accounts ownership model
- Finance decision council outcome
- Initial posting-rule catalogue
- Source-to-journal traceability matrix
- Opening-balance and cutover outline
- Threat model and fraud/control scenarios
- UAT and reconciliation test plan

No production code or migration during this workstream without separate approval.

### Workstream B — Finance foundation

Build only after Workstream A approval:

- Finance authorization and role/scope policy integration
- Chart of accounts and account classes
- Fiscal years and accounting periods
- Finance dimensions and validation
- Journal draft/posted/reversal model
- Posting-attempt/idempotency model
- Audit event and attachment integration
- Controlled configuration for posting rules
- Test harness for balancing, period, and authorization rules

Gate: no source-domain integration yet until the GL foundation is independently tested.

### Workstream C — Accounts Payable and controlled postings

- Supplier invoice capture
- PO/receipt/invoice matching
- Invoice exceptions/holds/credits
- Payment request and release workflow
- AP subledger
- Financial events for invoice liability and payment settlement
- Duplicate invoice/payment safeguards
- AP aging and supplier ledger
- Reconciliation tests to GL

Gate: no live payment release until roles, approval, posting, reversal, and audit tests pass.

### Workstream D — Cash, bank, close, and core reports

- Bank accounts and statement intake
- Deposit evidence and branch cash exceptions
- Bank reconciliation
- Finance exception center
- Period close checklist and state transitions
- Trial balance, general ledger, AP reports, initial P&L/balance-sheet layouts
- Close/reopen/re-lock UAT

### Workstream E — Extended accounting

- AR and collections
- POS/branch sales reconciliation
- Fixed assets/depreciation
- Project/capex accounting
- Landed-cost allocation
- Shared-cost allocations
- Payroll journal integration
- Tax/compliance support and adviser validation

## 4. Mandatory implementation controls

Every finance work item must state:

- Source document/event
- Business owner
- Accounting owner
- Roles and segregation requirements
- Accounting dimensions
- Posting trigger
- Posting rule/version
- Idempotency strategy
- Transaction boundary
- Failure/retry behavior
- Period behavior
- Reversal/correction behavior
- Audit/attachment behavior
- Reports/reconciliation impact
- Tests and UAT evidence
- Migration/cutover impact

## 5. Explicit non-goals for first implementation increments

Do not begin with:

- Full tax automation
- Multi-currency or FX
- Complex consolidation
- AI-posted journals
- Uncontrolled Excel journal import
- Bank API integration
- Full payroll engine
- Broad financial dashboards before reconciliation works
- Retrofitting all historical activity without an approved cutover plan

## 6. Approval gates

| Gate | Required approval |
|---|---|
| Documentation compatibility | User / project owner |
| Finance design decision council | Product + Finance leadership |
| Logical data model | Architect + database + finance owner |
| Schema/migration plan | User + technical owner + finance owner |
| First auto-posting rule | Finance owner + controller + QA/security review |
| Payment release workflow | Finance leadership + security + QA |
| Period-close workflow | Controller/accountant + QA |
| Production finance pilot | Executive + finance owner + release manager |
| Official books go-live | Executive + finance owner + accountant/adviser sign-off |

## 7. First safe coding milestone

Only after approval:

> A finance administrator can configure a chart-of-accounts sandbox and an OPEN accounting period; an authorized accountant can prepare a balanced manual journal draft; a separate reviewer can approve it; the system posts one immutable journal with audit history; the journal can be reversed through an authorized flow; no production operational records are changed.

This milestone validates the ledger core before procurement, inventory, payments, or bank integration creates real financial consequences.

## 8. Definition of done for each finance increment

- Scope agreed and documented
- Role/scope/segregation tests pass
- Ledger invariants pass
- Duplicate/retry/concurrency tests pass where relevant
- Reversal and error paths pass
- Reports reconcile
- Migration/cutover effects understood
- Documentation and knowledge-base items updated
- Deployment/rollback/restore plan approved where production data is affected
