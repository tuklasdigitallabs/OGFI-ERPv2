# OGFI ERP — API Conventions

**Status:** Phase I implementation baseline  
**Purpose:** Keep all modules consistent, secure, testable, and ready for later integrations.

---

## 1. API principles

1. APIs represent business actions and controlled state transitions, not only CRUD screens.
2. Every request is authenticated and authorization is applied server-side.
3. Every scoped query is filtered by tenant and the user’s assigned scope.
4. Commands validate business rules, apply optimistic concurrency where applicable, create audit events, and return actionable errors.
5. Controlled documents are not hard-deleted through public API endpoints.
6. APIs must support desktop, mobile, internal services, future integrations, and exports without duplicating business logic.

---

## 2. API style

Use REST-style JSON endpoints for Phase I with clear action endpoints for workflow transitions. GraphQL is not required initially.

Base path:

```text
/api/v1
```

Example resource routes:

```text
GET    /api/v1/purchase-requests
POST   /api/v1/purchase-requests
GET    /api/v1/purchase-requests/{id}
PATCH  /api/v1/purchase-requests/{id}
POST   /api/v1/purchase-requests/{id}/submit
POST   /api/v1/purchase-requests/{id}/approve
POST   /api/v1/purchase-requests/{id}/reject
POST   /api/v1/purchase-requests/{id}/return-for-revision
POST   /api/v1/purchase-requests/{id}/cancel
```

Do not expose generic endpoints such as `/approve-anything` without typed document behavior.

---

## 3. Request context

Every authenticated request establishes server-side context:

```json
{
  "tenantId": "resolved from session/token",
  "userId": "resolved from session/token",
  "roleAssignments": ["..."],
  "scopeAssignments": ["..."],
  "requestId": "generated per request"
}
```

The browser may send selected display context, such as active company or location, but the server validates that it is inside user scope.

Recommended headers:

```text
X-Request-Id: client-generated or server-generated correlation ID
Idempotency-Key: mandatory for retryable posting endpoints
X-Context-Company-Id: optional display/request context, server validated
X-Context-Location-Id: optional display/request context, server validated
```

---

## 4. Standard response shapes

### 4.1 Success response

```json
{
  "data": {
    "id": "01HX...",
    "reference": "PR-2026-000001",
    "status": "PENDING_APPROVAL"
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

### 4.2 List response

```json
{
  "data": [
    {
      "id": "01HX...",
      "reference": "PO-2026-000021",
      "status": "OPEN"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 156,
    "nextCursor": null,
    "requestId": "req_..."
  }
}
```

### 4.3 Error response

```json
{
  "error": {
    "code": "INVENTORY_INSUFFICIENT_AVAILABLE_QTY",
    "message": "The source location does not have enough available stock to dispatch this transfer.",
    "details": [
      {
        "field": "lines[0].quantity",
        "reason": "Requested 20 kg; only 12 kg available."
      }
    ]
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

Errors must explain the actual business rule and a corrective path where possible. Avoid generic messages such as `Operation failed`.

---

## 5. Status codes

| HTTP status | Use |
|---:|---|
| 200 | successful query or action with response body |
| 201 | resource created |
| 202 | accepted for asynchronous processing |
| 204 | successful no-content operation where appropriate |
| 400 | invalid request structure or malformed input |
| 401 | unauthenticated |
| 403 | authenticated but not permitted within role/scope |
| 404 | resource not found within authorized scope |
| 409 | version conflict, duplicate reference, invalid state transition, idempotency conflict |
| 422 | valid request structure but failed business validation |
| 429 | rate limit exceeded |
| 500 | unexpected server failure |

---

## 6. Query conventions

### 6.1 Filtering

Use explicit filter parameters:

```text
?companyId=...
&brandId=...
&locationId=...
&status=PENDING_APPROVAL
&from=2026-06-01
&to=2026-06-30
&supplierId=...
&itemId=...
```

The backend must reject or silently limit filters outside user scope according to endpoint behavior. It must never return unauthorized data.

### 6.2 Pagination

Use cursor pagination for large, changing operational lists and audit/event feeds. Offset pagination is acceptable for stable small admin lists.

```text
?pageSize=25&cursor=...
```

Default page size: 25. Maximum: 100 unless a special export endpoint is used.

### 6.3 Sorting

```text
?sort=requiredDate:asc
?sort=createdAt:desc
```

Only allow a whitelist of indexed/safe sort fields.

### 6.4 Search

```text
?q=tomatoes
```

Search is scoped, permission-checked, and limited to intended searchable fields. It must not expose hidden document references through autocomplete.

---

## 7. Command and state-transition conventions

### 7.1 Explicit action endpoint pattern

```text
POST /{resource}/{id}/submit
POST /{resource}/{id}/approve
POST /{resource}/{id}/reject
POST /{resource}/{id}/return-for-revision
POST /{resource}/{id}/cancel
POST /{resource}/{id}/dispatch
POST /{resource}/{id}/receive
POST /{resource}/{id}/post
POST /{resource}/{id}/reverse
```

Action payload includes the required reason, remark, quantities, attachment references, and expected record version as applicable.

### 7.2 Optimistic concurrency

Every editable controlled record returns a `version` field.

```json
{
  "version": 7,
  "reason": "Corrected quantity after supplier confirmation"
}
```

If the document was modified by another user, return `409 CONFLICT` with enough information for the UI to offer refresh/review rather than overwriting changes.

### 7.3 Idempotency

The following endpoints require `Idempotency-Key`:

- create purchase request;
- submit PR;
- create PO;
- approve/reject/return action;
- post goods receipt;
- dispatch or receive transfer;
- post wastage;
- post stock adjustment;
- complete stock count;
- upload/import initiation.

Store idempotency results for a sensible retry window. A repeated request with the same key must return the original outcome, not create duplicate stock movements or approvals.

---

## 8. Key Phase I endpoint groups

### 8.1 Authentication and context

```text
GET  /me
GET  /me/scopes
POST /auth/login
POST /auth/logout
POST /auth/refresh
```

### 8.2 Administration/master data

```text
GET/POST/PATCH /companies
GET/POST/PATCH /brands
GET/POST/PATCH /locations
GET/POST/PATCH /departments
GET/POST/PATCH /cost-centers
GET/POST/PATCH /items
GET/POST/PATCH /uoms
GET/POST/PATCH /suppliers
GET/POST/PATCH /users
GET/POST/PATCH /roles
GET/POST/PATCH /approval-rules
```

### 8.3 Purchasing

```text
GET/POST        /purchase-requests
GET/PATCH       /purchase-requests/{id}
POST            /purchase-requests/{id}/submit
POST            /purchase-requests/{id}/cancel
POST            /purchase-requests/{id}/approve
POST            /purchase-requests/{id}/reject
POST            /purchase-requests/{id}/return-for-revision

GET/POST        /quotation-requests
GET/POST        /supplier-quotations
GET/POST        /purchase-orders
GET/PATCH       /purchase-orders/{id}
POST            /purchase-orders/{id}/submit
POST            /purchase-orders/{id}/send
POST            /purchase-orders/{id}/amend
POST            /purchase-orders/{id}/cancel
```

### 8.4 Receiving and inventory

```text
GET/POST        /goods-receipts
GET             /goods-receipts/{id}
POST            /goods-receipts/{id}/post

GET             /inventory/balances
GET             /inventory/movements
GET/POST        /inventory/transfers
POST            /inventory/transfers/{id}/submit
POST            /inventory/transfers/{id}/approve
POST            /inventory/transfers/{id}/dispatch
POST            /inventory/transfers/{id}/receive

GET/POST        /stock-counts
POST            /stock-counts/{id}/submit
POST            /stock-counts/{id}/approve
POST            /stock-counts/{id}/post

GET/POST        /wastage-reports
POST            /wastage-reports/{id}/submit
POST            /wastage-reports/{id}/approve
POST            /wastage-reports/{id}/post

GET/POST        /stock-adjustments
POST            /stock-adjustments/{id}/submit
POST            /stock-adjustments/{id}/approve
POST            /stock-adjustments/{id}/post
```

### 8.5 Cross-cutting

```text
GET /tasks
GET /notifications
POST /notifications/{id}/read
GET /audit-events?entityType=...&entityId=...
POST /attachments/upload-intents
POST /attachments/{id}/complete
GET /reports/... 
POST /exports
```

---

## 9. Authorization enforcement pattern

Every command must run these checks in this order:

1. Authenticate user.
2. Resolve tenant.
3. Load record within tenant.
4. Determine company/location/department/project scope.
5. Verify permission for action.
6. Verify scope assignment for record.
7. Validate expected current state.
8. Validate business rules.
9. Apply update in transaction.
10. Write audit event and create any in-scope post-commit in-app notifications.

This policy belongs in backend services/middleware, not in React components.

---

## 10. Attachment handling

Do not upload large files through regular JSON endpoints.

Recommended pattern:

1. Client asks for a signed upload intent.
2. Backend checks role, scope, record relationship, MIME type, and size limit.
3. Client uploads directly to object storage.
4. Client confirms upload.
5. Backend marks attachment ready and links it to document/audit event.

Attachment access uses signed, short-lived download URLs after authorization checks.

---

## 11. API documentation and testing

- Maintain OpenAPI documentation for all public/internal endpoints.
- Generate typed client contracts where practical.
- Add contract tests for inventory posting, approval actions, and error formats.
- Every endpoint must include authorization tests: allowed, denied by role, denied by scope, and cross-tenant denial.
- Every state transition endpoint needs happy path, duplicate retry, invalid status, and concurrent-update tests.
