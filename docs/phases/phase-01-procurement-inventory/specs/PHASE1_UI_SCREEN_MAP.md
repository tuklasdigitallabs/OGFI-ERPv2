# OGFI ERP — Phase I UI Screen Map

**Document status:** Phase I implementation guide  
**Purpose:** Provide a compact build order and navigation map for all Phase I screens.

---

## 1. Primary modules

```text
Home / Dashboard
├── Tasks & Approvals
├── Purchasing
│   ├── Purchase Requests
│   ├── Quotation Comparison
│   ├── Purchase Orders
│   └── Suppliers
├── Inventory
│   ├── Stock Balances
│   ├── Ledger
│   ├── Receiving
│   ├── Transfers
│   ├── Physical Counts
│   ├── Wastage
│   └── Adjustments
├── Master Data
│   ├── Company / Brand / Location
│   ├── Departments / Cost Centers
│   ├── Items / Categories / UOM
│   └── Users / Roles / Assignments
├── Reports
└── Administration
    ├── Approval Rules
    ├── Notification Rules
    └── Audit Logs
```

---

## 2. Phase I screen build order

### Release 1 — Foundation

1. Authentication and session handling
2. Application shell and context switcher
3. User/profile and assignment handling
4. Company/brand/location master data
5. Item, category, UOM, supplier master data
6. Audit timeline and attachment uploader
7. Notification/task center

### Release 2 — Approval foundation

8. Task / approval queue
9. Approval timeline component
10. Approval decision panel
11. Delegation and escalation views
12. Approval Matrix administration

#### Bounded Inventory Control UAT Approval Worklist (`DEC-0270`)

The global Approval Inbox remains unavailable while
`APPROVAL_ROUTING_V1_ENABLED=false`. A distinct, explicitly partial UAT worklist
may be enabled only for live-eligible work in these exact families:
`PurchaseRequest`, `QuotationRecommendation`, `PurchaseOrder`,
`InventoryTransfer`, `StockCountAttemptReview`, `WastageReport`, and
`StockAdjustment`.

It must use server-side pagination, selected-record detail, and one mutually
exclusive action composer. The surface must state that it shows only eligible
in-scope Inventory Control UAT work, must not show global approval totals or imply
deferred families are clear, and must render a truthful unavailable/stale state
when access or current eligibility changes. The browser never supplies approval
scope, source facts, version, step, permission, or MFA authority. Server action
revalidation, source/lineage/step lock and CAS, family-specific segregation, and
sensitive inventory MFA remain mandatory. The worklist does not itself post stock
or create an approval ledger; source/audit history remains authoritative.

### Release 3 — Purchasing

13. Purchasing dashboard
14. Purchase Request list
15. Create/edit Purchase Request
16. Purchase Request detail
17. Quotation Comparison list/detail
18. Purchase Order list/detail
19. Supplier list/detail

### Release 4 — Inventory movement

20. Inventory dashboard
21. Stock balance list
22. Inventory ledger
23. Receiving queue/detail
24. Transfer list/detail
25. Wastage list/detail
26. Stock adjustment list/detail
27. Physical count list/entry/review

#### Inventory Pilot Setup Center (`DEC-0273`)

`/opening-inventory/setup` is a company-context workspace beside the Opening
Inventory cutover queue. It uses a paginated draft/revision queue, selected-record
detail, contextual actions, and six working sections: Endpoints, Items, Named
users, Routes, Readiness, and Activity. Candidate endpoints, items, users, rules,
and activity are server-paginated/searchable; changing company context reloads
the workspace and cannot submit prior-company selections.

The surface requires `inventory.pilot_configuration.view` plus a live assignment
and exact selected-company `MANAGE`; denied access reveals no configuration,
candidate, route, user, digest, or readiness detail. Draft create/edit/evaluate/
abandon/successor actions additionally require
`inventory.pilot_configuration.draft`. Seal requires
`inventory.pilot_configuration.seal`, fresh MFA, a reason, and a sealer who is
neither the creator nor latest editor. Baseline grants are limited to configured
ERP Administrator and System Super User roles, but the server never authorizes
from a displayed role label.

Draft sections edit exact endpoint capabilities, explicit high-risk Item IDs,
five distinct Opening actors, and one eligible route for each of the eight exact
families. Readiness blockers must be shown before seal. A sealed or abandoned
record is read-only and explains that correction requires a successor draft.
For `PurchaseRequest`, the Routes and Readiness sections must label the one
snapshot as **Standard / non-emergency** and show that the shared production
resolver was evaluated with `isEmergency=false`, selected `DEFAULT`, returned
`normal`, and used no fallback. A coexisting valid `PR_EMERGENCY` rule is not a
blocker, but the UI must state that emergency routing is not certified and has
no UAT credit; it must not offer the emergency rule as the pilot readiness
selection.

Sealed detail shows revision/digest, lineage, exact retained memberships,
seal-time actor/route evidence, and activity, while stating that live authority
and routing remain authoritative. A successor action copies the latest sealed
revision into a new draft for future cohorts only; existing cohorts remain
pinned. No Setup Center action activates a family, creates an approval/opening
cohort or command, or posts inventory. The workspace remains local-only and
**NO-GO**; no copy may imply emergency Purchase Request UAT or production
availability.

### Release 5 — Reporting and hardening

28. Phase I operational reports
29. Export controls
30. Empty/loading/error states review
31. Mobile/tablet review
32. Permission testing and audit review

---

## 3. Required shared screens

These screens/components must be created before module-specific screens to avoid inconsistent behavior:

- context switcher;
- record header;
- status chip;
- approval timeline;
- audit timeline;
- attachment uploader;
- standard filter bar;
- operational table;
- mobile record card;
- empty/loading/error states;
- confirm/reason dialog;
- notification and task center.

---

## 4. Cross-screen invariants

Every Phase I transactional screen must show:

- record ID;
- record status;
- Company / Brand / location scope;
- requester or owner;
- current approver / next action;
- created and last updated timestamps;
- attachments;
- audit history;
- accessible primary action;
- permission-aware action availability.
