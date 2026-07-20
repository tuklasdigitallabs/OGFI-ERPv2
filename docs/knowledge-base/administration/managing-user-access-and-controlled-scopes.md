# Managing User Access And Controlled Scopes

**Audience / required role:** ERP administrators with Core Administration access  
**Applies to:** User roles, sensitive roles, location scopes, high-risk scopes, and Manage-level access  
**Last verified against:** implemented Core Admin user detail, direct low-risk scope assignment, controlled high-risk scope request, controlled sensitive role request, approval, rejection, audit, and session revalidation controls

## Purpose

Use Core Administration to manage what a user can do and where they can do it. A role grants functions. A scope grants company, branch, warehouse, or other location access. Both are required for operational access.

High-risk scopes are not granted through quick assignment. Warehouse, commissary, central kitchen, head-office, project-site, temporary-site, and any `MANAGE` location access require a controlled request and a separate admin decision.

Sensitive roles are also not granted through quick assignment. Admin, approver, system, and sensitive-permission roles require a controlled role request, evidence reference, privileged MFA evidence, and a separate admin decision.

## Navigation Path

`Admin` → `Core Administration` → `Users` → open a user

## Quick Assignment

Use `Assign Scope` only for low-risk active branch/location access that is eligible for quick setup.

Use `Assign Role` only for roles that the page marks as available for quick setup. Sensitive roles are intentionally hidden from quick role assignment and must use the controlled role request path.

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

## Controls And Warnings

- An admin cannot request scope access for themselves from this screen.
- The requester or target user cannot approve or reject the controlled scope request.
- An admin cannot request a controlled sensitive role for themselves from this screen.
- The requester or target user cannot approve or reject the controlled role request.
- High-risk scope request approval re-checks tenant, company, target user, location, active status, and duplicate active assignments.
- Sensitive role request approval re-checks tenant, company, target user, role active status, duplicate active assignments, privileged MFA evidence, and approval-rule protection.
- Direct quick assignment remains blocked for high-risk and `MANAGE` scope changes even if someone tries to bypass the UI.
- Direct quick assignment remains blocked for sensitive/admin/approver/system roles even if someone tries to bypass the UI.
- Every request, approval, rejection, and resulting scope or role assignment writes audit history with reason, evidence, actor, target user, selected access or role, and DEC-0036 reference.
- Controlled scope and controlled role approval change the target user's privilege epoch, requiring stale demo sessions to sign in again before protected access continues.

## What To Check

- The target user, location, and access level match the actual operational need.
- The evidence reference is traceable outside the ERP when needed.
- Pending requests do not duplicate an existing active assignment.
- Approved requests show the new active scope assignment.
- Approved controlled role requests show the new active role assignment.
- Rejected requests remain visible in request history and do not create access.
