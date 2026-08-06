# DEC-0271 — UAT Master-Data Access and Opening-Cohort Eligibility

## Metadata

- Decision ID: `DEC-0271`
- Status: `Confirmed`
- Date: 2026-08-03
- Decision owner: OGFI Product Owner / Operations Owner
- Decision Chair: Parent agent
- Related scope: Phase I Inventory Control Pilot; Supplier Master; Item Master;
  Opening Inventory Cutover

## Decision

Use the existing, server-enforced Master Data Steward gate for the immediate
local UAT setup path: `core.administer` plus active selected-company `MANAGE`
scope. Do not grant that broad authority to operational personas merely to
work around a denied Supplier or Item screen.

Opening Inventory cohort creation must be offered only when the preparer's
current, live `inventory.opening_inventory.prepare` authority covers **every**
opening-stock endpoint in the sealed configuration. The creation service keeps
its transaction-time recheck. When no eligible revision is available, the UI
must state the safe scope/configuration reason rather than offering an action
that will fail after entry.

The role-matrix discrepancy for ordinary Supplier/Item view and limited
maintenance is confirmed as a production-readiness blocker, not resolved by
this decision. A later decision must define distinct ordinary view and
action-level maintenance permissions, their company/location semantics, default
role grants, confidentiality separation, lifecycle authority, migrations, and
negative authorization tests before representative-role UAT can claim coverage.

## Why

The approved role matrix grants broad Master Data visibility and limited
Purchasing/Warehouse maintenance, but the implementation currently requires
Core Administration authority for every Supplier and Item read/write. The
matrix does not precisely allocate sensitive Supplier lifecycle, legal/tax, or
commercial-field actions, and Item material changes/deactivation remain
deliberately fail-closed. Inventing permanent permission keys or granting
`core.administer` to branch/purchasing/warehouse testers would both weaken
least privilege.

Separately, the Opening Inventory page previously selected a sealed revision
based on the current location, although the creation service correctly required
preparation scope at all cohort endpoints. That was a visible eligibility
defect, not an authorization bypass.

## Hard controls retained

- Supplier confidential payment/reference-price data remains protected by the
  additive `purchasing.supplier_confidential.view` clearance; it never follows
  ordinary master-data visibility.
- Company, brand, location, role-assignment, effective-date, session, MFA,
  opening-count custody, approval segregation, immutable audit, isolated
  executor, and inventory-ledger controls are unchanged.
- A super-user label alone never bypasses a missing active role assignment,
  selected-company scope, or live location scope.
- Opening cohort creation, review, commands, and activation remain separate
  authorities. Creation is non-posting; only the isolated executor may create
  the atomic ledger effect after the documented approvals and command gates.

## Immediate UAT checks

1. Verify the setup account's active role assignment, effective permissions,
   selected company, Company `MANAGE`, and at least one active home Location
   scope. Do not infer authority from the display role name.
2. For Opening Inventory, grant the named preparer only `view` and `prepare`
   plus eligible scope at every cohort endpoint. Keep submitter, Operations
   reviewer, Accounting reviewer, command requester, and executor separated.
3. Treat Supplier/Item tests under the current gate as administrator setup
   validation only. They are not evidence that Purchasing/Warehouse/Branch
   least-privilege behavior matches the role matrix.

## Required follow-up

| Item | Status |
|---|---|
| Derive visible Opening cohort eligibility from every endpoint and retain the service recheck. | Implementing locally |
| Add a live UAT access preflight for role/permission/company/location drift. | Pending |
| Reconcile Supplier/Item role-matrix verbs into explicit server permissions and read-only/action projections. | Blocking representative-role UAT |
| Define Supplier accreditation, deactivation, legal/tax, and commercial maintenance authority. | Open policy |
| Test cross-tenant/company/location denial, confidential redaction, and opening scope/SOD/MFA cases. | Pending |

## Deliberation evidence

Independent Workflow, Security, and Backend reviewers were requested under the
repository protocol. Requested Code Spark/GPT-5.4-mini subagent models were
unavailable, so the closest permitted GPT-5.6 specialist fallback was used.
The challenge round agreed that configuration drift and the matrix/code mismatch
are distinct: safe immediate remediation is live-access verification plus the
Opening UI correction; permanent ordinary Master Data authorization needs its
own confirmed action mapping.
