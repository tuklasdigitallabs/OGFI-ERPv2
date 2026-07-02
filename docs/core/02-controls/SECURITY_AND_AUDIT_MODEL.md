# OGFI ERP — Security, Authorization, and Audit Model

**Status:** Phase I implementation baseline  
**Purpose:** Protect multi-branch operational data while preserving accountability for money, approvals, stock, and supplier commitments.

---

## 1. Security goals

The ERP must prevent users from:

- viewing data outside their assigned company, brand, branch, warehouse, department, or project scope;
- approving their own restricted financial or inventory transactions where segregation rules apply;
- silently changing posted inventory or approval history;
- downloading attachments outside authorized scope;
- bypassing approval, reason, or evidence requirements through direct API calls;
- creating duplicate business transactions through refresh/retry behavior;
- changing user permissions without audit evidence.

---

## 2. Authorization model

Authorization is the combination of:

```text
Permission (what can the user do?)
+ Scope assignment (where can the user do it?)
+ Record state (is the action valid now?)
+ Separation-of-duties policy (should this user be blocked anyway?)
```

### 2.1 Role and scope example

```text
Purchasing Officer
- can create and edit POs
- scope: all OGFI branches and warehouse
- cannot approve a PO if the approval policy requires independent finance/executive approval

Branch Manager
- can submit PRs and branch wastage
- scope: Yakiniku Like · SM Mall of Asia
- cannot view other branches or warehouse cost records unless explicitly assigned
```

### 2.2 Scope types

- Tenant
- Company
- Brand
- Location
- Department
- Cost center
- Project

Scope rules cascade downward only when explicitly defined. For example, company scope may include all company locations, but a location assignment does not include other locations.

---

## 3. Segregation of duties baseline

The system should enforce these standard controls by default:

| Activity | Default restriction |
|---|---|
| Create PR | Requester may create for permitted scope |
| Approve PR | Requester cannot approve own PR unless explicit emergency override policy permits it |
| Create PO | Purchasing role required |
| Approve PO | PO creator cannot provide final approval where independent approval is required |
| Receive delivery | Receiver cannot approve supplier payment or final discrepancy resolution alone |
| Dispatch transfer | Source custodian may dispatch but not confirm destination receipt |
| Receive transfer | Destination custodian confirms receipt; cannot be same user as dispatch unless controlled exception exists |
| Submit wastage | Reporter may submit; approval/review follows value/rule threshold |
| Post stock adjustment | Requires authorized approval; requester and poster separation is configurable by risk tier |
| Change approval rule | Admin access plus audit event; no silent change |
| Change user scope/role | Administrator access plus audit event and optional second approval for high-risk tenants |

These are configurable but should never be removed casually just to reduce clicks.

---

## 4. Authentication and session security

Minimum requirements:

- Passwords are hashed with Argon2id or equivalent modern password hashing.
- Secure, HttpOnly, SameSite cookies are used for browser sessions.
- Session rotation occurs after authentication and privilege changes.
- Rate limit login, password reset, upload intent, search, and public-facing endpoints.
- MFA capability should be planned for administrators and executive roles, even if not enabled in Phase I.
- Inactive sessions expire according to configurable policy.
- User deactivation revokes active sessions promptly.
- Do not include sensitive role/scope assumptions exclusively in a browser token; validate server-side.

---

## 5. Approval security

Every approval decision must record:

- document type and reference;
- approval rule and step;
- actual actor;
- delegated-from user, if applicable;
- timestamp;
- decision: approved, rejected, returned for revision, skipped by authorized policy, expired;
- mandatory remarks when rejected, returned, or overridden;
- current version of the document;
- request ID for traceability.

### 5.1 Approval escalation

Reminder and escalation jobs may create tasks/notifications, but must not auto-approve monetary, inventory, or supplier commitments unless a future policy specifically defines an authorized auto-action.

---

## 6. Audit model

### 6.1 Events that must be audited

- authentication success/failure for sensitive events;
- user, role, and scope changes;
- approval rule creation/edit/activation/deactivation;
- controlled document create, edit, submit, approve, reject, return, cancel, amend, close, reverse;
- PO send/re-send;
- receiving post and discrepancy resolution;
- transfer dispatch and receipt;
- stock count start, submit, approve, and post;
- wastage and adjustment submit/approve/post;
- attachment upload/link/remove;
- export of sensitive reports;
- configuration changes affecting workflow, inventory, and financial controls.

### 6.2 Audit event requirements

```text
who did it
what changed
when it happened
where it happened / request source where available
which company/branch/warehouse/project it affected
before and after state where safe and useful
why it happened, when a reason is required
related record and human-readable reference
```

### 6.3 Immutability rules

- `audit_events` are append-only.
- There is no standard UI or API to edit/delete an audit event.
- Corrections produce another event explaining the corrective action.
- Retention policies should preserve operational and financial audit history according to company/legal requirements.

---

## 7. Inventory integrity and fraud-resistance controls

1. Direct balance edits are forbidden.
2. Every posted stock change maps to an inventory movement with source document reference.
3. Posting uses database transactions and row-level concurrency control where needed.
4. Negative stock is disabled by default. Any exception must be logged, authorized, and visible in exception reports.
5. High-value wastage requires reason, quantity, estimated value, and attachments where required by policy.
6. Physical count variance must retain original snapshot, counted quantity, reviewer, and posting reference.
7. Transfer dispatch and receipt are separate confirmation events.
8. Reversals reference the original movement and do not overwrite it.
9. Backdated stock transactions require explicit reason, authorization, and audit classification.

---

## 8. Attachment and document security

- Store attachment metadata in PostgreSQL and file bytes in S3-compatible object storage.
- Use server-generated short-lived upload/download URLs.
- Validate file type and size before upload intent.
- Store checksum and original filename for traceability.
- Restrict attachment visibility by tenant, document scope, and role.
- Require attachment purpose labels: invoice, delivery receipt, quotation, photo evidence, supplier document, approval support, other.
- Optional enhancement: malware scan and quarantine before attachments become downloadable.

---

## 9. Data protection and privacy baseline

- Use TLS for all browser-to-server and service-to-service traffic.
- Encrypt managed database/storage at rest using provider controls.
- Do not write passwords, raw access tokens, complete personal records, or sensitive document contents into application logs.
- Apply data minimization in exports; include only fields required by the selected report.
- Restrict high-risk exports by permission and audit them.
- Use environment-secret management; never commit credentials to source control.
- Separate production data from development and test data. Development must use synthetic or anonymized data.

---

## 10. Security testing requirements

Before Phase I release, verify:

1. Cross-tenant access is blocked for every major endpoint.
2. Cross-branch access is blocked for branch-limited users.
3. A requester cannot self-approve when policy blocks it.
4. Duplicate submit/approve/receive calls do not create duplicate documents or movements.
5. A user cannot post a receipt or adjustment after status changes make it invalid.
6. Audit records appear for all listed critical actions.
7. Attachments cannot be downloaded after user scope is removed.
8. Expired delegation cannot approve transactions.
9. Permission change is visible in audit history.
10. Error messages do not expose internal database/schema details.


---

## Projects & Implementation Tracker — Security and Audit Addendum

### Access model

Project access is evaluated using company scope, project scope, membership, role, and restricted-project flag. API and service authorization must verify project access before any project, task, attachment, comment, activity, risk, or linked-record summary is returned.

### Linked-record privacy

Project links store references and display only a sanitized, permission-checked summary. A user who can view a project but lacks access to the underlying Purchase Order, approval, or inventory record must not receive confidential amounts, attachments, or details through the project tracker.

### Required audit events

Log project creation, archive, member changes, visibility changes, template application, status changes, task create/edit/assign/complete/reopen/cancel, due-date changes, checklist changes, blocker changes, milestone changes, attachments, comments, linked-record changes, exports, and report access where configured.

### Risk controls

- Blocked tasks require a reason and record the user/time of the block.
- Restricted project visibility changes require a reason and elevated permission.
- Activity is append-oriented. Corrections create new activity events rather than silently rewriting history.
- Attachments follow the same malware scanning, storage policy, retention, and authorization model as other ERP attachments.
