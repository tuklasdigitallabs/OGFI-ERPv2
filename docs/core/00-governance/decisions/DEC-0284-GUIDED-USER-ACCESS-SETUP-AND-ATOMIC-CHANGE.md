# DEC-0284 — Guided user access setup and atomic access change

## Metadata

- Status: Confirmed
- Date: 2026-09-08
- Decision owner / Chair: Parent implementation agent
- Authority: User approved the simplified access UX recommendation; parent confirmed implementation and requested this record.
- Scope: Phase I Users & Access; existing role and controlled-scope governance

## Decision

Use guided Access Setup to either grant eligible access now or create an account without access. Expose assignment-level Change Access actions that atomically replace eligible role or branch-location access assignments with a required reason, stale-state checks, retry identity, audit linkage and session invalidation.

## Context and alternatives

| Option | Assessment |
|---|---|
| Guided setup and atomic assignment replacement | Selected. Makes ordinary branch onboarding and correction understandable while retaining existing server-enforced governance. |
| Separate manual revoke then grant | Rejected as the normal change experience: partial completion can leave unintended access or no usable assignment. Existing governed lifecycle operations remain available where applicable. |
| Direct permission toggles or unrestricted location/role assignment | Rejected. Would obscure role-derived permissions and bypass sensitive-role/controlled-location request boundaries. |

## Hard gates and safeguards

- Roles define action permissions; scope defines where and at what access level those permissions apply. Selecting Approve does not independently grant approval permission or bypass workflow eligibility and segregation.
- Direct setup offers only roles eligible under existing low-risk role policy and ordinary branch/operating locations. Sensitive roles and controlled locations use existing requests. MANAGE and warehouse, commissary/central-kitchen, Head Office, project and temporary-site scopes are not direct low-risk grants.
- Create without access must not silently assign a default role, branch or operational scope. An account with no usable scope receives safe access recovery guidance rather than a fabricated context or privileged fallback. Recovery does not itself grant access.
- Role replacement requires existing tenant-role administration and selected-company Manage authority. Location-access change retains existing selected-company scope-management authority. Target tenant/company membership, active records, direct-assignment eligibility, duplicate prevention and self-mutation restrictions remain server enforced. Roles involved in active approval-rule dependencies retain their existing block.
- Each change is one assignment-level transaction: lock target and assignment, compare expected role/access level, end the old assignment, create the replacement, retain linked audit history and reason, and advance the target user's privilege epoch to invalidate active sessions. A role and a location change are separate controlled commands, not an all-user wholesale replacement.
- Idempotency binds the submitted change and replay result; changed reuse fails conflict. Stale expected state fails without a partial revoke/grant. No direct permission toggles or new role grants are introduced.

## Failure modes and verification

Primary risks are accidental scope escalation, misunderstood role/access-level interaction, stale concurrent changes, lost-response duplicate replacement, no-scope lockout and incomplete audit/session invalidation. Verify negative direct-grant cases, selected-company and self-mutation denials, atomic rollback, CAS/replay conflicts, linked history, privilege epoch changes and safe no-scope recovery.

Implementation was reported complete by the parent. Source review inspected `AccessSetupForm.tsx`, `coreAdmin.ts` (`changeUserRoleAssignment`, `changeUserLocationScopeAccess` and direct-assignment guards), and the User Access detail surface. Execution results and named-role/browser UAT were not supplied for this documentation pass; this record is not production admission or evidence that those tests passed.

## Impact and follow-up

No new business permission, approval policy or database entity is established by this UX change. Existing role/scope assignment history and controlled requests remain authoritative. UI specifications and roles documentation describe the new guided and replacement actions. Dunong owns administrator help/release guidance; an explicit enablement gap records that handoff. No new policy gap was identified in the confirmed bounded design.

Rollback must preserve replacement/ended assignment history and audit events; do not restore access by deleting history or reversing privilege epochs. Disable the affected UI/action if required and use existing controlled access correction.

## Approved visual clarification — 2026-09-08

Safe roles and permissions retain default styling. Approval-required roles and permissions use the shared warning color plus an explicit label; color is never the sole signal. The role/permission editor and role detail/admin surfaces must explain the controlled-assignment requirement without implying a new permission policy or completed approval. Eligibility remains server-owned.

Source confirmation: warning treatment and controlled-assignment labels are present in `RolePermissionEditor.tsx` and related role/admin surfaces. This documentation clarification adds no authority and is not browser/accessibility UAT acceptance.

## Approved assignment-risk policy — 2026-09-08

The user approved the following matrix:

| Role and scope combination | Result |
|---|---|
| Safe role + ordinary branch + `VIEW` | Direct assignment |
| Safe role + ordinary branch + `OPERATE` | Direct assignment |
| Safe role + ordinary branch + `APPROVE` | Controlled request |
| Any role + ordinary branch + `MANAGE` | Controlled request |
| Any role + warehouse, Head Office, commissary / central kitchen, project, or temporary site | Controlled request |
| Sensitive role + any scope level | Controlled request |
| System role + any scope level | Controlled request |

Role designers may compose permissions freely. A role is safe for direct
assignment only when every active permission is explicitly classified as safe and
the role is not a system role. Unknown or unclassified permissions fail closed and
make the role approval-required. Role creation warns on approval-required
permissions; assignment identifies the reason or affected permissions where
available. The matrix is an assignment gate and does not grant permissions by
itself.

First-grant recovery for an active user without usable scope grants no default
authority and applies the same matrix and controlled-request rules.
