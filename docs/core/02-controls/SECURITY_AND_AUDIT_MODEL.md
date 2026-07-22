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

### 2.3 Tenant role administration

Role catalog and `UserRoleAssignment` administration use a dedicated tenant-level authorization boundary under `DEC-0043`:

- `core.tenant_role_administer` is required for role overview/details, role creation, direct assignment/deactivation, sensitive-role request/review, role-permission updates, and onboarding when `initialRoleId` is present;
- `core.administer`, company `MANAGE`, selected-company context, or target membership alone cannot substitute for that permission;
- the seeded `CONFIGURED_ADMIN` and `CONFIGURED_SUPER_USER` roles receive the permission;
- quick role assignment rechecks the role's live permissions while holding the role lock; allowlisted role codes are not directly assignable when any current permission is sensitive;
- adding sensitive authority to a role with an active, effective assignee is blocked pending a separately approved sensitive-role change workflow, including when a direct grant and permission change race;
- a pending sensitive-role request freezes permission changes for that role; approval reloads the active role and permission set while holding the role lock before it claims the request, creates the assignment, and records permission audit metadata;
- sensitive-role approval governs granting access, not revocation; an authorized administrator may deactivate the active assignment with reason, audit, privilege-epoch update, and session invalidation while self-mutation and active approval-route safeguards remain enforced;
- target-user actions additionally require the target to be active in the same tenant and to have an active, currently effective `COMPANY` scope for the operator's selected company or `LOCATION` scope to an active location in that company;
- this membership check constrains the eligible target and does not turn the tenant-global assignment into a company-scoped grant; and
- all checks are server-enforced, with non-enumerating denial and no business mutation on failure.

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
| Change low-risk user scope | Administrator access plus audit event |
| Administer role catalog or direct role assignment | Tenant-level `core.tenant_role_administer`; target-user actions also require active/effective selected-company membership; audit event required |
| Change high-risk scope | Controlled `HighRiskScopeRequest`, reason, evidence, separate reviewer, privileged MFA guard, audit, and session invalidation |
| Grant sensitive/admin/approver role | Controlled `SensitiveRoleRequest`, reason, evidence, separate reviewer, privileged MFA guard, audit, and session invalidation |

These are configurable but should never be removed casually just to reduce clicks.

---

## 4. Authentication and session security

Minimum requirements:

- Production uses tenant-qualified local identities under `DEC-0040`: organization login code, normalized email, and an Argon2id password credential. Demo email-only authentication is permitted only in isolated development/test and is rejected at production startup.
- Browser sessions use high-entropy opaque tokens; only token hashes are stored in PostgreSQL. Cookies are HttpOnly, SameSite, host-only, and Secure in production, with explicit idle and absolute expiry.
- Session rotation after runtime MFA or enrollment uses one compare-and-swap transaction with TOTP/recovery-code consumption and audit writes. It preserves the original absolute expiry; expired, locked, cross-tenant, inactive-user, and stale-privilege challenge sessions cannot become active. An explicit monotonic user privilege epoch invalidates stale sessions after role, scope, credential, MFA, user-status, or break-glass changes.
- Password and MFA attempts are admitted through fixed-cardinality, tenant-qualified PostgreSQL throttle windows for account and source-address digests. Admission uses atomic row locks, a database-authoritative `ACTIVE`/`PAUSED` key-policy generation, domain-separated signed one-time reservations, and canonical lock ordering. A rotation may accept an explicitly bounded previous key only until its recorded expiry; key identity reuse and unverifiable reservations fail closed.
- Password failures return the same normalized response for known and unknown accounts. Unknown-account submissions still pass through a bounded Argon2id work gate and dummy-hash verification, while pressure limits prevent hostile traffic from turning that equalization work into unbounded CPU consumption. Failed MFA attempts are audited without storing the submitted code and lock the short-lived challenge at the configured threshold.
- Authentication monitoring exposes aggregate-only health through a private token-protected route. Caddy applies exact-source and global authentication limits, publishes no application or metrics port publicly, and must replace—not trust—client-supplied forwarding headers under the approved single-hop topology. Raw account/source digests, bearer tokens, credentials, and tenant/company identifiers are prohibited from monitoring output and persistence-failure logs.
- Privileged local users must enroll an encrypted TOTP authenticator, retain individually hashed one-time recovery codes, complete runtime MFA during sign-in, and provide recent session-bound MFA assurance for guarded sensitive actions. The legacy `PrivilegedMfaEnrollment` register remains external-provider evidence only and cannot satisfy a local runtime challenge.
- Existing-account password or lost-device recovery requires a reason, identity-verification evidence, a request by one administrator, approval or rejection by a different MFA-assured administrator, session revocation, and audit history. Direct self-request or self-review is blocked. Approval and rejection use status compare-and-swap; approval, optional MFA revocation, privilege-epoch/session invalidation, activation issuance, and audit writes commit together.
- Activation and recovery links are sent directly through the configured SMTP transport to the target user's account email. Administrators never receive the raw link. Failed delivery is retained for MFA-guarded retry, and production startup fails closed when delivery configuration is incomplete.
- AES-GCM protected TOTP values carry an explicit key version. A reviewed rotation may make the immediately previous key/version available temporarily while protected values are re-encrypted; unavailable versions fail closed. Activation/recovery bearer tokens are never reversibly stored.
- Inactive sessions expire according to configurable idle and absolute limits. User deactivation and privilege changes revoke active application sessions transactionally; an external-provider follow-up record remains pending only when an external provider is configured.
- Break-glass assignments carry the approved end time, and authorization ignores an expired assignment even if reconciliation has not yet updated the grant record.
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

Repeated denied operations follow `DEC-0050`: server-derived, tenant-qualified closed dimensions are counted atomically in bounded 5/15/60-minute windows. The first denial is written as immutable evidence; one idempotent immutable final summary is appended only when a completed window contains more than one denial. Actual workflow actions remain individually audited. Audit persistence failure must never permit the denied action, and repeated failures may emit only bounded, redacted operational logs.

### 6.3 Immutability rules

- `AuditEvent`, `ProjectActivityEvent`, and `InventoryMovement` are protected history under `DEC-0049`. PostgreSQL rejects every `UPDATE`, `DELETE`, and `TRUNCATE` against these tables through unconditional `ENABLE ALWAYS` statement triggers. There is no application-callable bypass.
- Ordinary application transactions may `SELECT` and append new rows. Corrections append a new audit/activity event or an authorized linked inventory reversal movement; they do not rewrite or erase the original row.
- Hosted staging and production separate a non-login object owner, a controlled login migrator that assumes only that owner, and a membership-free login runtime. The application receives only the runtime credential. The runtime has only `SELECT` and `INSERT` on protected history and cannot own protected objects, read `_prisma_migrations`, alter or disable guards, create schemas/databases, or assume the owner/migrator role.
- Migration, ownership/grant reconciliation, and append-only contract verification run through the controlled Hostinger deployment path. A missing trigger, ownership/grant drift, exposed administrative or migrator credential, failed mutation denial, failed positive insert, or available escalation path is a release **NO-GO**.
- Automated integration tests and demo resets rebuild only uniquely named, positively marked disposable databases. They must not delete or truncate protected history in shared, staging, production, live, pilot, or UAT databases.
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

- Store attachment metadata and workflow state in PostgreSQL and encrypted file bytes outside the database. Under `DEC-0046`, production uses a dedicated internal evidence broker on the same Hostinger VPS; only the broker owns the private evidence mount and versioned AES-256-GCM keyring. `local-private` is allowed only for local development and controlled UAT and must fail closed in hosted environments.
- Proxy bounded upload streams through the application to a short-lived, server-authorized exact opaque quarantine key/version. Browsers never receive filesystem paths, broker credentials, arbitrary-key write authority, listing authority, or encryption-key access. Downloads remain permission-checked per source record and write download audit events.
- Validate file type, extension, detected content signature, checksum, and size. The initial allowlist is PDF, JPEG, PNG, WebP, and UTF-8 `.txt` files with an exact MIME-to-extension match. CSV, active-script/document extensions, and ZIP-based Office formats remain unavailable until their format-specific risks are explicitly controlled. Company quota and host disk/inode watermarks must fail closed before resource exhaustion can affect PostgreSQL.
- Store original filename, opaque object key, immutable object version, declared/detected MIME, plaintext checksum, encrypted stored checksum, AES-GCM key version, and lifecycle timestamps for traceability. All scan checks, availability transitions, downloads, retention, recovery, and audit references address the exact immutable version.
- Restrict attachment visibility by tenant, company, document scope, and role. Users with task or workflow visibility alone do not automatically receive source-record evidence access.
- Require attachment purpose labels: invoice, delivery receipt, quotation, photo evidence, supplier document, approval support, payment proof, close support, workforce document, other.
- Malware scanning is mandatory in production. The broker streams the authenticated exact version privately to ClamAV using `INSTREAM`; only an exact clean result with a current signature database and matching PostgreSQL state may become available. Threat, unsupported, access-denied, failed, missing, stale, timeout, and indeterminate results remain quarantined and unavailable; no production scan waiver is allowed.
- Use a bounded 60-second systemd timer plus PostgreSQL advisory locking, row leases, capped batches, retry/backoff, and compare-and-set transitions to recover durable uploads and reconcile pending scans. Do not rely on post-response work, Redis, or a queue for this release.
- Host filesystem retention and legal hold are application-enforced controls, not WORM or Object Lock. Root compromise and same-disk loss remain disclosed residual risks. Independently recoverable encrypted off-VPS backup and a paired PostgreSQL/evidence/key-inventory restore rehearsal within approved RPO/RTO are production activation gates.
- Legal hold is a preservation-only, company/source-scoped action requiring separate `evidence.legal_hold.set` authority plus recorded authority, case reference, reason, actor, timestamp, and audit. The confidential retention register requires `evidence.retention.view`; neither permission grants download or source-record access. Disposition remains unavailable until the retention/disposition policy and authority are approved.

---

## 9. Data protection and privacy baseline

- Use TLS for all browser-to-server and service-to-service traffic.
- Encrypt managed database/storage at rest using provider controls.
- Do not write passwords, raw access tokens, complete personal records, or sensitive document contents into application logs.
- Apply data minimization in exports; include only fields required by the selected report.
- Restrict high-risk exports by permission and audit them.
- Use environment-secret management; never commit credentials to source control.
- Separate production data from development and test data. Development must use synthetic or anonymized data.

### Phase II Recipe Costing Boundary

The current recipe/menu-costing implementation may read scoped recipe versions, menu prices, supplier price history, UOM conversion evidence, sales imports, and inventory-ledger evidence for costing analysis and exports. It also supports controlled draft recipe creation, edit-by-new-version revision drafts, controlled recipe archive, controlled recipe-version workflow actions, and controlled menu-price decision records.

Broad ingredient add/remove editing and bulk recipe maintenance remain gated by the approved implementation sequence. Enabled recipe create/revision/archive, recipe-version, and menu-price workflow actions must write audit events with actor, scope, reason where required, before/after metadata, and must not post inventory, sales, finance, or approval-source records from recipe screens.

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
