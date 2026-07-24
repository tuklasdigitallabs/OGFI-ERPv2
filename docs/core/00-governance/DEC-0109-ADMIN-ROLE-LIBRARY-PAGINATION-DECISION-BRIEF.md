# DEC-0109 — Administration Role Library Pagination Decision Brief

## Decision question

What is the next bounded implementation slice for Workspace 2 Administration after the Users-registry pilot?

## Why now

The Roles & Permissions tab still renders an unbounded tenant-wide role list and loads every role-permission relation through the overview service. The workspace-completion gate requires server-backed search, filters, pagination, and responsive list behavior for operational registers. The Users pilot explicitly deferred role pagination as a separate slice.

## Affected scope

- Phase I, Workspace 2 Administration, IAM-04 Role Library
- Authorized tenant administrators and read-only/auditor variants where existing service permissions allow access
- Tenant role records and permission-summary reads only; no role mutation semantics or schema changes

## Non-negotiable constraints

- Preserve tenant isolation and the existing `core.core_administer` plus `core.tenant_role_administer` service boundary.
- Role catalog records remain tenant-global; they are not silently company-bound.
- Preserve reason, audit, MFA, segregation-of-duties, and approval-role mutation controls.
- Do not deactivate, delete, or mutate roles in this slice.
- Do not use a paged role result as an incomplete initial-role dropdown; onboarding options need an explicit bounded/catalog contract.

## Options

### Option A — Role Library pagination and filters (candidate)

Add a server-owned role page contract with bounded URL-backed page, page size, name/code query, status filter, deterministic `name ASC, id ASC` ordering, exact count parity, and permission summaries. Load it only for the Roles tab while preserving a separately bounded active-role option source for user creation.

### Option B — Role detail assigned-user pagination

Bound the assigned-user list on `/admin/roles/[id]` first. This improves a detail surface but leaves the visible tenant-wide Role Library list and its unbounded permission join unresolved.

### Option C — Defer

Leave the role register unchanged while moving to another workspace. This preserves current behavior but fails the explicit Administration list gate and keeps an unbounded tenant-wide read.

## Required evidence before confirmation

- Independent product/UX and security review
- Source inspection of role list, permission summary, and onboarding option behavior
- Tests for tenant isolation, missing tenant-role authority, deterministic page boundaries, query/status parity, and URL state
- Typecheck, lint, full regression, authorization manifest, production build, and documentation alignment

## Decision owner

Decision Chair: parent agent. Formal record is created only after the recommendation is confirmed.

## Model note

The requested Code Spark and GPT-5.4 models are unavailable in the active toolset; the closest permitted GPT-5.6 fallback is being used without relaxing any hard gate.
