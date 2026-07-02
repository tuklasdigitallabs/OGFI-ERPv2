# OGFI ERP — Development Standards

**Status:** Required engineering baseline  
**Purpose:** Keep the implementation maintainable, safe, and aligned with the approved product and workflow documents.

---

## 1. Core engineering rules

1. Make the smallest correct change that meets an approved requirement.
2. Read existing patterns before creating a new one.
3. Do not hardcode company names, branches, approval thresholds, suppliers, roles, locations, or workflow paths.
4. Do not bypass service-layer validation from UI code or scripts.
5. Every controlled state transition must have test coverage and an audit event.
6. Do not introduce new spacing values outside the shared design token scale.
7. Do not make a desktop-only screen for a workflow that branch or warehouse users must perform.
8. Never solve a data integrity problem with a hidden admin override.
9. Prefer configuration over code only when the rule is genuinely expected to vary by tenant/company/branch.
10. Keep product documents updated when a deliberate design decision changes scope or behavior.

---

## 2. Recommended repository structure

```text
/apps
  /web                 # Modern SaaS frontend
  /api                 # API service, if deployed separately
  /worker              # future-approved background worker; outside current no-queueing release
/packages
  /ui                  # shared design-system components and tokens
  /domain              # domain types, validation contracts, status enums
  /api-client          # generated/typed client where used
  /config              # shared lint/test/ts config
/docs
  /product             # product, phases, module map, roles, approvals
  /design              # component and UI specs
  /technical           # this architecture pack
  /workflows           # purchasing, inventory, receiving, wastage specs
/infrastructure
  /docker
  /compose
  /scripts
```

Organize backend code by domain module, not only by technical layer:

```text
/modules/purchasing
/modules/inventory
/modules/approvals
/modules/suppliers
/modules/organization
/modules/identity
/modules/audit
/modules/notifications
```

Within a module, use explicit boundaries for controller/API, service/business logic, repository/data access, DTO/validation, and tests.

---

## 3. UI implementation standards

The UI must follow `UI_IMPLEMENTATION_STANDARD.md` and the Design Specification Pack.

### Mandatory rules

- Use semantic design tokens, not raw hardcoded colors/spacing in feature components.
- Use the shared app shell, context switcher, record header, status pill, action queue, approval timeline, and audit timeline components.
- Keep company/brand/location context visible on all scoped operational screens.
- Every record detail must show status, owner/requester, next action, and audit access.
- Use responsive table-to-card behavior for mobile.
- Create loading, empty, no-access, error, and rejected/returned states as part of the feature—not later.
- Avoid long multi-step modal workflows on mobile; use focused full-screen steps where clearer.

---

## 4. Validation standards

### Client-side validation

Use for format guidance and immediate user feedback.

### Server-side validation

Required for all business rules, permissions, scope, status transitions, quantity constraints, approval eligibility, document links, and financial calculations.

Never trust client-calculated totals, approval eligibility, or available stock.

---

## 5. Testing strategy

### 5.1 Unit tests

Use for:

- amount and quantity calculations;
- UOM conversion;
- approval rule matching;
- status transition guards;
- scope resolution;
- inventory movement generation;
- low-stock suggestion logic;
- validation helpers.

### 5.2 Service/integration tests

Use for:

- PR submission and approval;
- PO creation and amendment;
- receiving accepted/rejected quantities;
- transfer dispatch and receipt;
- physical count variance handling;
- wastage/adjustment posting;
- role/scope denial;
- audit event creation;
- idempotency and concurrency behavior.

### 5.3 End-to-end tests

Phase I critical paths:

1. Branch PR → approval → PO → receiving → stock updated.
2. Main warehouse stock available → transfer request → dispatch → branch receipt.
3. Wastage submitted → approval → inventory movement posted.
4. Count submitted → variance reviewed → posting creates correct movement.
5. Unauthorized branch user cannot view another branch’s document.
6. Approver delegation works only inside assigned period/scope.
7. Mobile branch workflow can create/submit PR and receive delivery.

---

## 6. Definition of done for a feature

A feature is not done when the screen renders. It is done when:

- [ ] product/workflow requirement is met;
- [ ] role and scope authorization are enforced;
- [ ] validation and error messages are implemented;
- [ ] loading, empty, error, and no-access states exist;
- [ ] audit event is generated for critical action;
- [ ] attachments/evidence work where required;
- [ ] responsive/mobile behavior is tested if branch/warehouse users need it;
- [ ] automated tests cover key business rules;
- [ ] code is reviewed;
- [ ] docs are updated if behavior changed.

---

## 7. Code review checklist

Reviewers must ask:

1. Is scope enforced server-side?
2. Could this create duplicate records or duplicate stock movements on retry?
3. Does this preserve the document state machine?
4. Is a controlled record being edited when it should be reversed/cancelled/amended instead?
5. Does the audit trail capture enough evidence?
6. Is the UI consistent with the Modern SaaS component and spacing standards?
7. Is the next action visible to the user?
8. Is the workflow usable on the device the target role actually uses?
9. Are test cases present for normal, invalid, denied, concurrent, and retry behavior?
10. Does the change avoid unrelated refactoring?

---

## 8. Documentation rules

- Store product, workflow, design, and technical documents under `/docs` in the repository.
- Reference document IDs and controlled status names consistently.
- Update a decision log when changing a non-trivial architecture or workflow choice.
- Keep filenames stable once developers rely on them.
- Generated diagrams/screenshots should supplement, not replace, written business rules.
