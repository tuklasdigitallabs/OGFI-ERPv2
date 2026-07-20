# Phase 3 Decision Brief — Employee/Custodian Payee Payment Handoff

- Decision ID: `III-009`
- Status: Foundation implemented; production release and settlement still deferred
- Related blocker: `P3-BLOCK-001`
- Related phase/module: Phase 3 finance, cash advances, payment controls
- Decision owner: Finance / HR / Operations / IT
- Decision chair: Parent implementation agent

## Question

How should OGFI ERP represent and control payment handoff for employee or branch-custodian cash advances without misusing supplier-only AP payment requests?

## Why This Is Needed Now

Cash advances can be requested for employees or branch custodians, while the current AP/payment request path is supplier-oriented. Production payment handoff needs a confirmed architecture before cash advances can create downstream payment records.

## Current Facts

- Cash-advance foundation supports request, approval, offline issue markers, liquidation, closure, reversal, evidence metadata, audit, and outstanding exposure.
- Current cash-advance actions are intentionally non-posting: they do not create payment releases, AP settlement, bank reconciliation entries, official journals, or supplier-ledger mutations.
- `P3-BLOCK-001` keeps production payment release, settlement, bank mutation, journal posting, and final UAT policy deferred.
- `P3-BLOCK-002` keeps production evidence storage-provider approval, scan or scan-waiver approval, retention/recovery proof, and UAT deferred.
- `III-009` records the selected foundation direction: generic payee registry plus controlled source-linked non-supplier disbursement request.

## Non-Negotiable Constraints

- Do not treat employees or branch custodians as suppliers merely to reuse supplier AP payment requests.
- Preserve tenant, company, brand, location, department, requester, beneficiary, custodian, status, approval, and audit context.
- Enforce role and scope authorization server-side.
- Preserve no-self-approval and segregation of duties for money workflows.
- Do not silently mutate AP invoices, supplier ledgers, payment releases, bank balances, bank reconciliation, or journals.
- Keep downstream settlement, reversal, and recovery traceable and auditable.
- Keep the current foundation demonstrable while production payment handoff remains deferred.

## Options For Council Review

### Option A — Generic payee registry plus controlled disbursement request

Create a reusable payee identity layer for supplier, employee, custodian, and future external payee references, then create a payment/disbursement request that points to a payee and source record.

### Option B — Separate employee/custodian disbursement request

Keep supplier AP payment requests unchanged and add a separate employee/custodian disbursement request for cash advances and similar workforce/operations payments.

### Option C — Extend current supplier payment request

Make `PaymentRequest` support nullable supplier and alternate employee/custodian fields.

### Option D — Defer production handoff

Keep current cash-advance foundation non-settling and require manual finance handling outside ERP until payee architecture is approved.

## Preliminary Hard-Gate Concerns

- Option C risks weakening AP controls unless supplier-specific settlement logic is fully separated from employee/custodian payment logic.
- Option D is acceptable for demos and controlled-foundation UAT, but not for production go-live.
- Options A and B require migration, permissions, UI, audit, reporting, reversal, and UAT design before implementation.

## Evidence Needed For Confirmation

- Finance-owner approval of payee taxonomy and settlement boundary.
- HR/operations approval of employee/custodian visibility and privacy rules.
- Security review of payee master-data access and payment authority.
- Database review of migration/backward compatibility.
- QA scenarios for no-self-approval, wrong-scope denial, duplicate payment prevention, reversal/recovery, and no AP/supplier-ledger mutation.

## Parent-Chair Recommendation

Recommended direction: **Option A — generic payee registry plus controlled disbursement request**.

This is the best-practice F&B ERP direction because cash advances, petty-cash replenishments, supplier AP, employee reimbursements, branch custodian advances, and future non-supplier payments all need a common payment-control surface without pretending every payee is a supplier. The payee layer should represent the payment recipient identity and type, while source workflows remain the system of record for why money is owed or advanced.

### Recommended Target Shape

- Add a company-scoped controlled payee identity layer with explicit payee type, such as supplier, employee, branch custodian/user, and approved external party.
- Keep the existing supplier AP `PaymentRequest` path supplier-only until it can be migrated or wrapped without weakening AP controls.
- Add a source-linked disbursement request for non-supplier payments, initially cash advances and future employee/custodian reimbursements.
- Store only source record references and payment-control snapshots needed for audit. Do not duplicate cash-advance, HR, AP, bank, or accounting payloads as the source of truth.
- Preserve payment release as a separate controlled step after disbursement approval.
- Do not mutate AP invoices, supplier ledgers, bank balances, reconciliations, or official journals from cash-advance approval alone.

### Alternatives Considered

- **Option B — separate employee/custodian disbursement request** is safer than extending supplier AP, but it may create another silo once petty cash, reimbursements, and future non-supplier payees need the same controls.
- **Option C — extend current supplier payment request** is not recommended because `PaymentRequest` and `PaymentRelease` currently require `supplierId`; making that nullable risks mixing AP settlement rules with employee/custodian cash controls.
- **Option D — defer production handoff** remains acceptable for demos and controlled foundation UAT, but it is not acceptable for production finance go-live.

### Hard Gates Before Production Release

- Finance owner confirms payee taxonomy and which workflows may create production disbursement requests.
- HR/operations confirms employee/custodian visibility and privacy rules.
- Security review confirms payee creation, bank-detail visibility, and payment authority controls.
- Database review confirms additive migration strategy and backward compatibility with existing supplier payment requests and releases.
- QA/UAT proves no-self-approval, wrong-scope denial, duplicate handoff prevention, reversal/recovery, and no AP/supplier-ledger mutation.

## Current Recommendation Status

Option A is implemented as a controlled foundation under the user's best-practice F&B direction: cash advances can create a draft non-supplier disbursement handoff through a generic payee registry without reusing supplier-only AP payment requests. Council review was attempted again on 2026-07-08, but specialist subagents still routed to an exhausted GPT-5.3-Codex-Spark quota and returned no usable analysis.

This foundation is not production settlement. Payment release, bank mutation, journal posting, AP settlement, reversal/recovery policy, production evidence signoff, and final finance/security signoff remain deferred under `P3-BLOCK-001` and `P3-BLOCK-002`.
