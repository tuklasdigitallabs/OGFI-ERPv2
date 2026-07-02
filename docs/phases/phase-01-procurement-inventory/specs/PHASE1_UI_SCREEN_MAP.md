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
