# OGFI ERP — Users, Roles, and Scope UI Specification

**Phase:** I  
**Primary users:** System Administrator, authorized HR/Admin, IT Administrator, auditors (read-only)  
**Purpose:** Manage application access using role-based permissions and explicit company/brand/location/department scope assignments.

---

## 1. Screen inventory

| ID | Screen | Purpose |
|---|---|---|
| IAM-01 | User List | Search users, status, role, location scope, last access |
| IAM-02 | User Detail | Identity, status, role assignments, scopes, access history |

User Detail’s Assigned Role Lifecycle register is assignment-grain and status-active, so scheduled and ended effective dates remain visible for lifecycle and revocation review. Each row labels assignment state (`CURRENT`, `FUTURE`, or `EXPIRED`) separately from role status. It is not the effective-permission authority view.
| IAM-03 | Invite / Create User | Controlled onboarding |
| IAM-04 | Role Library | View standard roles and permission summaries |
| IAM-05 | Role Detail | Permission matrix, restricted/admin controls |
| IAM-06 | Scope Assignment | Assign company, brand, location, department, project scope with dates |
| IAM-07 | Access Review | Periodic review, expired access, inactive users, risky conflicts |

Implementation note (`DEC-0108`): the Users registry uses server-owned name/email and
status filters with bounded URL-backed pagination and deterministic display-name/ID
ordering. The page shows an explicit restricted state before loading privileged data when
`core.tenant_role_administer` is absent; this preserves the service authorization boundary
and does not make roles company-bound. Role, organization, audit, and detail pagination
remain separate follow-up slices.

Implementation note (`DEC-0110`): Core Administration reads now require current-company
Manage scope in addition to tenant-wide role authority. The overview returns only the
selected company's organization records (plus tenant-wide approval rules), company
creation requires tenant-role authority before any duplicate lookup or write, and user
detail preflights active selected-company membership before loading the record. Cross-
company scope assignments are not returned from the selected-company detail view.

Implementation note (`DEC-0111`): the Role Library is now a server-owned, URL-backed
registry with bounded name/code and status filters, exact count/page parity, deterministic
`name ASC, id ASC` ordering, permission counts, and a three-permission preview. Role
detail retains the same tenant-role and selected-company Manage guard. User onboarding
uses a separate bounded active-role option catalog (first 100, with an explicit notice
when more roles exist); the full library remains available through the paginated Roles
workspace. Role permissions remain tenant-global and viewing a role never grants access.

Implementation note (`DEC-0110` remediation): direct company, location, permission,
audit-event, and user-detail routes repeat the tenant-role and selected-company Manage
preflight before loading detail data. Missing authority returns to the Administration
restricted state; audit export uses the same tenant-role boundary.

Implementation note (`DEC-0209`): the Users & Access registry labels its role column
`Current effective roles`. It previews only active, currently effective tenant-local or
global roles, shows up to eight names with an explicit `8+ roles` cap marker, and labels
inactive or role-less users truthfully. Scope assignments remain on User Access detail;
the tenant-level registry does not copy unvalidated scope IDs.

Implementation note (`DEC-0211`): Organization Scope visibly names the selected company
and labels its summary tab `Selected company summary`. Brand, Department, and Location
registries and create actions are selected-company scoped, not a tenant-wide company
directory; User Access remains authoritative for assigning user scope.

Implementation note (`DEC-0214`): Role Detail permission counts, matrix, drift, and
hidden enabled-code preservation use the tenant-local/global permission set. Unsupported
role-permission links show a read-only integrity warning and hide permission mutation
composers until an administrator reconciles the data; direct actions fail closed without
audit or writes.

Implementation note (`DEC-0113`): Audit Trail list, detail, and export use the same
tenant/company and bounded filter contract. The list uses deterministic keyset paging
(`occurredAt DESC, id DESC`) with explicit totals and next-page state. Detail and CSV
projections suppress actor contact/IP fields and recursively redact credential, token,
email, storage-key, and signed-URL fields without changing immutable audit rows.

Implementation note (`DEC-0223`): the Audit Trail `Export CSV` link is shown only
when both From and To filters are valid date-only values in non-reversed order. Until
then, the page shows a disabled explanation to match the route's required date-range
contract. The route remains authoritative for maximum span, row cap, authorization,
scope, and export audit events.

Implementation note (`DEC-0114`): Organization Scope now presents a server-owned
selected-company Locations registry with URL-backed search, status/type filters, exact
totals, deterministic name/ID ordering, and pagination. The initial-location selector
uses a separate bounded active catalog and discloses overflow. Company, Brand, and
Department lists use their own bounded selected-company registry contract.

Implementation note (`DEC-0115`): Brands now use a selected-company server registry with
bounded name/code and status filters, exact totals, deterministic name/ID ordering, and
pagination. Location creation uses a separate bounded active-brand catalog with overflow
disclosure. Departments use a bounded registry and retain read-only dependency summaries.

## 2. User detail requirements

Core Administration provides an explicit route loading state and a retryable,
user-safe error state for overview reads.

Implementation note (`DEC-0117`): Approval Rules uses a bounded selected-company
plus tenant-wide registry with transaction-type/status filters and deterministic
pagination. Rows show active state, priority, exact step count, and at most the
first three step/approver-type labels; full routing remains on the authorized
rule detail route.

Implementation note (`DEC-0225`): Approval Rules adds a bounded company-owned
lifecycle composer. Create and Revise build complete inactive immutable versions;
Activate performs an audited route-slot replacement; Deactivate requires an explicit
reason and warns that future submissions will fail until another valid version is
active. The composer exposes only supported transaction types, the default or
Purchase Request emergency template, and ordered role steps. Tenant-wide rules,
legacy named-user rules, arbitrary filter JSON, thresholds, groups, parallel steps,
delegation, and escalation are visibly read-only or unavailable with an explanation.
Every mutation rechecks Core Administration, tenant-role authority, selected-company
Manage scope, fresh runtime MFA in local authentication or verified privileged-MFA
evidence under external authentication, role eligibility, idempotency, and concurrency.

Implementation note (`DEC-0118`): User-detail role and location assignment
pickers are bounded, searchable option catalogs. Locations are active and
selected-company scoped; roles are active tenant-global options. Overflow is
disclosed and requires refinement, while existing referenced scopes remain
visible as history even when they are not selectable.

Implementation note (`DEC-0192`): Permission Access keeps the approved bounded
per-role user-preview contract. Preview disclosures are collapsed by default,
keyboard-accessible, and limited to five current-company previews per granting
role on the current role page; they are not an exhaustive effective-user list.
Granting roles include both tenant-local and tenant-global roles and visibly
label their provenance; the route remains read-only and does not link global
roles to tenant-owned mutation controls.

Implementation note (`DEC-0191`): Role Detail permission review uses a bounded,
URL-backed server matrix with code/action search and Sensitive, Overrides, and
Recommended Drift filters. The selected role's complete enabled-code set is
carried as hidden state for mutation so filtering or paging cannot disable
permissions that are not on the current page. Matrix counts are explicitly
page-local; role-level enabled/drift totals remain authoritative summary values.

Implementation note (`DEC-0200`): User Access Overview keeps a bounded effective-
permission preview, while the Roles section provides the complete read-only
effective-permission register for the selected user. The register is server-
owned, URL-backed, searchable, deterministically ordered, exactly counted, and
paginated. Its union uses only currently effective active tenant/global roles
and assignments; each permission links to the authorized Permission Access
definition/granting-role view, and no register control mutates access.

Implementation note (`DEC-0119`): Controlled Scope Requests and Controlled Role
Requests on User Detail are separate URL-backed paginated histories with
allowlisted lifecycle filters, exact totals, and newest-first deterministic
ordering. Review actions remain contextual and server-authorized.

Implementation note (`DEC-0120`): historical approved and rejected request rows
are summary-only. They show lifecycle, target/risk, actors, timestamps, and
whether reason/evidence was recorded. Pending rows retain the narrative and
permission context required for review; a separately authorized detail path is
still required for historical narrative access.

Implementation note (`DEC-0116`): Departments use a selected-company server
registry with bounded filters and paging. Rows retain read-only budget,
budget-line, and cost-center related-record counts; employee-assignment volume
remains deferred.

Show:

- Name, business email, status, employment/department reference where available
- Role assignments and effective dates
- Company/brand/location/department scope
- Approval eligibility and delegated approvals
- Last login / last activity as permitted
- Access change history
- Disable/reactivate state

## 3. Role model

- Roles define functional permissions; scope assignments define where permission applies.
- Standard roles are managed centrally; custom tenant roles may be added only under controlled policy.
- UI must summarize high-risk permissions: approve, post inventory adjustment, manage roles, export sensitive data, edit approval templates.

## 4. Segregation-of-duties checks

Warn and require review where a user has conflicting access, such as:

- Create and final approve own money request.
- Receive and approve a receiving discrepancy without control separation where policy requires separation.
- Manage approval templates and approve affected high-risk transactions.
- Maintain supplier payment/bank data and authorize payment-related workflow in later phases.

Warnings do not replace the server-side enforcement rules.

## 5. Access lifecycle

```text
Invited → Active → Temporarily Suspended / Expired → Inactive
```

- Inactive/expired users cannot sign in or act on new transactions.
- Historical creator/approver references remain intact.
- Scope and role changes are effective dated and audit logged.

## 6. Acceptance criteria

- Administrator cannot grant permissions beyond their own administrative authority without approved role policy.
- Scope filtering changes immediately/according to effective date and is enforced in API/data access.
- Access changes trigger audit event and notification where configured.
- User list/export does not expose sensitive HR data beyond authorized scope.

## 7. Core Administration navigation

The Core Administration index uses URL-backed workspace tabs for Users & Access,
Roles & Permissions, Organization Scope, Approval Rules, and Audit Trail. The
selected tab loads only its server-owned register and required option catalogs;
inactive sections are not queried or represented as zero-valued metrics. Filters,
pagination, denied states, and create actions remain within the selected
workspace context.
> Administration implementation note (DEC-0193): Break-Glass Access is a server-paginated, filterable queue. Lifecycle actions are performed in a selected-record TaskSheet; bounded target catalogs fail closed with an explanatory disabled state when refinement is required.

## DEC-0284 — Access Setup and Change Access

Create User uses guided Access Setup: choose grant eligible access now or Create without access, enter identity and a reason, then supply eligible role, branch/operating location and access level when granting access. Explain roles as allowed actions and location/access level as their scope; never present direct permission toggles. Sensitive roles and controlled locations clearly direct administrators to the existing request workflow. Creating without access must not silently choose a default location or role.

User Access detail offers eligible assignment-level Change role and Change access level controls with current context, replacement selection and required reason. In the direct path, ordinary branch assignments expose View and Operate for safe roles. Approve always uses the controlled request path; Manage and controlled location types (warehouse, Head Office, commissary / central kitchen, project, or temporary site) also use controlled requests. Sensitive and system roles use controlled requests at every access level. Preserve old assignment history, show actionable stale/duplicate/idempotency/access errors, and require refresh/review after stale state. Exact retries must not create another replacement. Explain that changed access invalidates the target user's active sessions.

The role selector shows all active roles with one of these labels: Quick setup,
Approval required, or System role. Safe roles retain the default visual treatment;
approval-required roles use the shared warning treatment and a text label. When an
approval-required role is selected, the form replaces direct assignment with
Request role approval and identifies the reason where available. The server owns
eligibility; visual treatment never replaces authorization. Role builders warn
when a permission is approval-required and classify any unknown or unclassified
permission as approval-required until explicitly reviewed.

A signed-in account without usable scope receives safe no-scope recovery guidance instead of an assumed company/location or operational access. The recovery state grants no authority. Existing restricted, loading, empty and error states remain explicit. Named-role desktop/tablet/mobile acceptance and enablement remain separate from source implementation completion.

### DEC-0284 — role and permission visual classification

Safe, directly assignable roles and permissions retain the default visual styling. Approval-required roles and permissions use the shared warning color treatment together with an explicit approval-required or controlled-access label. Color alone must never communicate the restriction. Explain when approval applies to role assignment; do not imply that editing a permission itself grants user access or completes approval.

Apply this distinction consistently in the role/permission editor, role detail and related administration surfaces. Derive the label from the existing server-owned eligibility classification; visual styling does not replace authorization or change which roles/permissions require controlled assignment. Existing unrelated error, stale and draft-change indicators retain their own meanings.
