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
| IAM-03 | Invite / Create User | Controlled onboarding |
| IAM-04 | Role Library | View standard roles and permission summaries |
| IAM-05 | Role Detail | Permission matrix, restricted/admin controls |
| IAM-06 | Scope Assignment | Assign company, brand, location, department, project scope with dates |
| IAM-07 | Access Review | Periodic review, expired access, inactive users, risky conflicts |

## 2. User detail requirements

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
