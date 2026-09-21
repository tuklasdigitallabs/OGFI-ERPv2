# Decision brief — simple user access assignment UX

- **Question:** How should user creation and role/scope assignment reduce clicks while preserving authorization, approval, and audit controls?
- **Why now:** Internal setup exposed a tedious deactivate/re-add flow, sensitive-role confusion, and a no-scope user that could not be opened for recovery.
- **Affected scope:** Phase I Core Administration; users, roles, company/location scopes, sensitive-role and high-risk-scope requests; branch staff, warehouse staff, Purchasing, managers, and administrators.
- **Current facts:** Roles carry permissions; scope assignments are append-only and audited; sensitive roles require controlled requests; target users currently need active company/location membership before Manage Access opens.
- **Non-negotiables:** Server authorization, no self-approval, tenant/company/location isolation, auditable assignment history, atomic/idempotent mutations, and no bypass of sensitive-role or high-risk-scope review.
- **Options:** A) retain separate deactivate/reassign forms; B) add a unified access composer that performs audited successor assignment and routes sensitive changes to requests; C) allow direct user permissions and editable assignment rows.
- **Required evidence:** Current User Access UI, `coreAdmin.ts`, role sensitivity catalog, roles/permissions and security/audit specifications, and focused authorization tests.
- **Owner/deadline:** Parent decision chair; recommendation presented for human approval before implementation.
