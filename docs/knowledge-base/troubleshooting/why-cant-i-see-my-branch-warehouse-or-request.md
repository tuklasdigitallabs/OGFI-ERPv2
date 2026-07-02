# Why Can't I See My Branch, Warehouse, Or Request?

**Audience / required role:** All users and support administrators  
**Applies to:** Company, brand, branch, warehouse, and request visibility  
**Related phase/module:** Phase I / Access Control and Scope  
**Last verified against:** implemented role, permission, active location, and scope-assignment controls

## Purpose

Use this article when a user cannot see an expected branch, warehouse, stock record, Purchase Request, transfer, count, wastage report, adjustment, approval, dashboard card, or export row.

OGFI ERP uses role plus scope. A role controls what a user can do. Scope controls where they can do it. Hiding or showing records is not only a menu setting; service-layer authorization also checks company, location, role, permission, and record status.

## Common Reasons

- The user is signed in under the wrong account.
- The wrong location is selected in the ERP header.
- The user does not have an active scope assignment for that branch, warehouse, brand, or company.
- The user has a role but not the specific permission for the module.
- The branch, warehouse, item, supplier, or request is inactive, cancelled, rejected, or outside the current workflow state.
- The record belongs to another company, brand, location, department, or project scope.
- The request is visible only to the requester, assigned approver, scoped manager, or permitted module user.

## What The User Should Check

1. Confirm the signed-in user name.
2. Confirm the ERP header location.
3. Try the module list filter, such as status or search.
4. Open the dashboard or list that normally contains the record.
5. Ask an authorized administrator to verify active role and scope assignments.

## What An Administrator Should Check

1. Confirm the user account is active.
2. Confirm the role assignment is active.
3. Confirm the required permission exists in the user's role.
4. Confirm the scope assignment covers the correct company, brand, branch, warehouse, or location.
5. Confirm the location and source record are active and belong to the expected company.
6. Confirm the user is allowed for that workflow step, not only for the menu.

## Important Controls And Warnings

- Do not give broad company-wide access just to solve one missing record.
- Do not ask another user to share screenshots or exported files if the requester is not authorized.
- Do not bypass scope checks by using direct links.
- Direct URL access is still checked by the service layer.
- Important records are not hard-deleted; missing records are usually caused by scope, status, filter, or permission context.

## Related Articles

- Signing in and selecting your location
- Understanding statuses, audit history, and attachments
- Why can't I approve this request?
- How to export a report
