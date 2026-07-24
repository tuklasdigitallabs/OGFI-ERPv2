# Managing User Access And Controlled Scopes

**Audience / required role:** ERP administrators with Core Administration access; role administration also requires `Administer tenant-wide roles` access
**Applies to:** User roles, sensitive roles, location scopes, high-risk scopes, and Manage-level access
**Last verified against:** `DEC-0043`, `DEC-0108`, `DEC-0110`, `DEC-0111`; implemented Core Admin user onboarding and user detail services; tenant-role and selected-company Manage authorization, server-paginated Users and Roles registries, selected-company target checks, direct low-risk scope assignment, controlled high-risk scope request, controlled sensitive role request, approval, rejection, audit, and session revalidation tests

## Purpose

Use Core Administration to manage what a user can do and where they can do it. A role grants functions. A scope grants company, branch, warehouse, or other location access. Both are required for operational access.

Role assignments are tenant-wide. Selecting a company limits which users an administrator may act on; it does not make the assigned role belong only to that company. The role applies wherever the user also has an active scope, but it does not grant access to company records by itself.

High-risk scopes are not granted through quick assignment. Warehouse, commissary, central kitchen, head-office, project-site, temporary-site, and any `MANAGE` location access require a controlled request and a separate admin decision.

Sensitive roles are also not granted through quick assignment. Admin, approver, system, and sensitive-permission roles require a controlled role request, evidence reference, privileged MFA evidence, and a separate admin decision.

## Before You Begin

- Select the company in which the user should be managed.
- To view or change Administration records, you need both `Administer tenant-wide roles` access and active `Manage` scope for the selected company. Core Administration access or tenant-role authority without selected-company Manage scope is not enough.
- Direct links to company, location, permission, audit-event, and user-detail pages enforce the same two checks before loading the record. If either check fails, Administration shows its restricted state and does not disclose whether the requested record exists. Audit export also requires tenant-role authority.
- Audit Trail review is read-only and server-paginated. It shows only the selected-company events plus authorized tenant-wide events, with a deterministic next-page control. Detail and CSV output redact actor contact/IP fields and sensitive nested values; immutable audit history is never rewritten. Export uses the same filters and redacted projection as the visible registry.
- Organization Scope Locations is a selected-company, server-filtered registry. Search, status, and location type filters stay in the URL and use deterministic paging; direct location links recheck authorization. Initial-location onboarding uses a separate bounded active catalog and tells you when more locations exist. Company remains a summary; Brand, Department, and Location registries use bounded server pages.
- Organization Scope Brands is also a selected-company, server-filtered registry. Name/code and status filters stay in the URL and use deterministic paging; the location form uses a separate bounded active-brand catalog. Departments use the same pattern, with read-only budget, budget-line, and cost-center summaries; employee-assignment impact remains deferred.
- Target-user role changes also require the existing company administration access shown for the selected company.
- For a role grant, deactivation, request, or review, the target account must be active and must have a current active company assignment for the selected company or an active location assignment to an active location in that company. A default company alone is not an access assignment.
- If you create a user with an initial role, also select an initial active location in the selected company. The system creates the location membership and role together; it does not create a role-only user through this path.
- The Users registry is server-filtered by name/email and status and paginates the authorized tenant users. Search and status values remain in the URL while paging; they do not widen company or tenant scope. An empty page means no users match the current filters, not that another company has no users. The Administration overview shows organization records for the selected company only, with tenant-wide approval rules where applicable. User detail first verifies current selected-company membership; if the user is not authorized in that company, the page returns to the Users workspace without disclosing another company's account or scopes.
- The Roles & Permissions registry is server-filtered by role name/code and status and paginates the tenant-global role catalog. Each row shows a permission count and a short preview only; open the role detail to review or change its controlled permission set. Viewing a role never grants its permissions. The initial-role onboarding selector is a separate bounded convenience list; when it reports more roles, use the Roles workspace to find the complete catalog.

## Navigation Path

If Core Administration is still loading, wait for the register to appear. If a
read fails, use Try again; the error state does not expose records or grant a
fallback authority.

Department registry rows are selected-company scoped and paginated. Their
budget, budget-line, and cost-center counts are read-only related-record
summaries; employee-assignment impact is deferred.

Approval Rules is also paginated. It includes rules for the selected company
and tenant-wide rules, shows bounded transaction-type/status filters, and keeps
only a capped first-three-step preview in the list. Open View Rule for the full
authorized routing definition; the list does not grant mutation or approval
authority.

User-detail assignment pickers are bounded searchable catalogs. Location choices
are active records in the selected company; role choices are active tenant-global
roles. When more than 100 options match, refine the server-side search rather
than assuming the first page is complete. Existing assigned or requested scope
records remain visible in history even when they are no longer selectable.

Controlled Scope Requests and Controlled Role Requests are separate paginated
histories. Use the lifecycle status filter and page controls to review older
requests; a visible request row does not itself authorize approval or rejection.

`Admin` → `Core Administration` → `Users` → open a user

If your account has Core Administration access but not `Administer tenant-wide roles`, Core Administration shows an explicit restricted state and loads no users, roles, scope, or audit records. The same restricted boundary applies when tenant-role authority is present but selected-company Manage scope is absent. Ask an independent administrator to grant the documented authority and selected-company scope; neither permission alone is a substitute.

## Steps

Choose the section below for the access task you need to complete. Do not use a role assignment to replace a missing company or location scope.

## Quick Assignment

Use `Assign Scope` only for low-risk active branch/location access that is eligible for quick setup.

Use `Assign Role` only for roles that the page marks as available for quick setup. Sensitive roles are intentionally hidden from quick role assignment and must use the controlled role request path.

The system evaluates the role's current permissions at the time of assignment. An allowlisted role stops being eligible for quick setup if it contains a sensitive permission. A role's permissions cannot change while a controlled role request is pending, and a sensitive permission cannot be added while the role has an active assignee; resolve the controlled request before changing that role's permission design.

1. Open the user detail page.
2. Select `Assign Scope`.
3. Choose the location.
4. Choose `VIEW`, `OPERATE`, or `APPROVE`.
5. Enter the assignment reason.
6. Select `Assign Scope`.

The system creates an active scope assignment, writes audit history, and refreshes the target user's privilege epoch so stale sessions must revalidate.

## Controlled Scope Request

Use `Request Controlled Scope` for high-risk locations or `MANAGE` access.

1. Open the user detail page.
2. Select `Request Controlled Scope`.
3. Choose the location.
4. Choose the requested access level.
5. Enter the business reason.
6. Enter an evidence reference, such as an approval note, ticket, incident, rollout plan, or support reference.
7. Submit the request.

The request remains pending until another authorized admin approves or rejects it.

## Controlled Role Request

Use `Request Controlled Role` for admin, approver, system, or sensitive-permission roles.

1. Open the user detail page.
2. Select `Request Controlled Role`.
3. Choose the role.
4. Enter the business reason.
5. Enter an evidence reference, such as an approval note, ticket, controls signoff, rollout plan, or security review.
6. Submit the request.

The request remains pending until another authorized admin approves or rejects it.

## Approving Or Rejecting

1. Open the target user's detail page.
2. Review the controlled request, requested scope or role, reason, evidence reference, and requester.
3. Select `Approve` or `Reject`.
4. Enter the review reason.
5. Submit the decision.

Scope approval creates the actual scope assignment in the same controlled action. Role approval creates the actual role assignment in the same controlled action. Rejection records the decision and does not grant access.

## Revoking An Active Role

An authorized administrator may select `Deactivate Role`, enter the required deactivation reason, and confirm the action. This applies to both quick-assigned and controlled sensitive roles: the controlled approval requirement governs granting sensitive access and must not prevent later revocation. The system preserves the assignment history, records the revocation, refreshes the target user's privilege epoch, and invalidates active sessions.

## Controls And Warnings

- `Administer tenant-wide roles` is a separate high-risk control. Core Administration access, company Manage scope, or being able to see a user does not replace it.
- A role assigned from one selected-company context is not restricted to that company. The user's active scopes still determine which company and location records they can access.
- The system blocks a target-user role action when the target account is inactive, its company or location assignment has not started, has ended, is inactive, or belongs outside the selected company.
- An admin cannot request scope access for themselves from this screen.
- The requester or target user cannot approve or reject the controlled scope request.
- An admin cannot request a controlled sensitive role for themselves from this screen.
- The requester or target user cannot approve or reject the controlled role request.
- High-risk scope request approval re-checks tenant, company, target user, location, active status, and duplicate active assignments.
- Sensitive role request approval re-checks tenant, company, target user, role active status, duplicate active assignments, privileged MFA evidence, and approval-rule protection.
- Direct quick assignment remains blocked for high-risk and `MANAGE` scope changes even if someone tries to bypass the UI.
- Direct quick assignment remains blocked for sensitive/admin/approver/system roles even if someone tries to bypass the UI.
- A role code that was previously eligible for quick assignment does not remain eligible after it gains a sensitive permission, and direct assignment cannot race with a sensitive permission change.
- Role-library search and pagination do not change role authority or company scope. The server rechecks tenant-role authority and selected-company Manage scope for the registry and role detail, including direct URLs.
- Every request, approval, rejection, and resulting scope or role assignment writes audit history with reason, evidence, actor, target user, selected access or role, and DEC-0036 reference.
- Controlled scope and controlled role approval change the target user's privilege epoch, requiring stale demo sessions to sign in again before protected access continues.
- Changing a role's permission set refreshes the privilege epoch of every active, effective assignee of that role. Their existing sessions must revalidate before protected access continues; expired assignments are not refreshed.
- Role and scope changes do not post inventory, approve transactions, or create financial entries. They change future access only.

## If A Role Action Is Unavailable Or Denied

1. Confirm that the correct company is selected.
2. Ask a configured administrator or configured super user to confirm that your role includes `Administer tenant-wide roles`. Do not treat company Manage scope as a substitute.
3. Ask an authorized administrator to confirm that the target account is active and has a current active company assignment for the selected company or an active location assignment in that company.
4. If the message says that the selected user is no longer available, do not assume the account was deleted and do not disclose or search for membership in another company. Recheck the selected-company context and the target's authorized membership.
5. If the action concerns your own role or a sensitive role, use the separate controlled request and reviewer process. Self-service and self-review remain blocked.
6. If the target legitimately needs membership first, complete the appropriate scope-assignment process before retrying the role action. Do not create a duplicate account or grant broader access merely to bypass the denial.

## What To Check

Historical approved and rejected requests show a safe summary and indicate whether
reason or evidence was recorded. Detailed narrative and sensitive permission labels
remain visible only while a request is pending review; the authoritative audit
record retains the complete history.

When approving or rejecting a high-risk location request, OGFI rechecks the target
user's current company/location membership at commit time. A request already handled
by another reviewer, or whose target membership is no longer valid, fails safely and
does not create an assignment.

- The target user, location, and access level match the actual operational need.
- The evidence reference is traceable outside the ERP when needed.
- Pending requests do not duplicate an existing active assignment.
- Approved requests show the new active scope assignment.
- Approved controlled role requests show the new active role assignment.
- Rejected requests remain visible in request history and do not create access.

## Expected Result

A permitted direct assignment becomes active, or a controlled request remains pending for a separate decision. The action and its reason are recorded in audit history. A denied action does not create, change, or deactivate a role assignment.

## What Happens Next

After a role or scope change, the target user's previous session may need to revalidate before the new access takes effect. Confirm access using the user's intended company and location context; do not test by broadening the user's scope.

## Related Articles

- [Activating And Recovering Local Accounts](./activating-and-recovering-local-accounts.md)
- [Session Invalidation And Reauthentication](./session-invalidation-and-reauthentication.md)
- [Why Can't I See My Branch, Warehouse, Or Request?](../troubleshooting/why-cant-i-see-my-branch-warehouse-or-request.md)
