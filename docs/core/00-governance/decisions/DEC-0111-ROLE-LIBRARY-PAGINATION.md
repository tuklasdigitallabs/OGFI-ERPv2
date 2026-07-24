# DEC-0111 — Role Library Pagination and Bounded Permission Preview

## Metadata

- Decision ID: `DEC-0111`
- Title: Role Library pagination and bounded permission preview
- Status: Confirmed
- Date: 2026-07-24
- Decision owner: Decision Chair
- Related phase/module: Phase I / Workspace 2 Administration / IAM-04 Role Library
- Related decision brief: `DEC-0109-ADMIN-ROLE-LIBRARY-PAGINATION-DECISION-BRIEF.md`

## Decision

Implement the Role Library as a server-owned, URL-backed paginated registry with bounded name/code and status filters, exact count/page parity, deterministic `name ASC, id ASC` ordering, permission counts, and a three-permission preview. Preserve tenant-global role semantics and require tenant-role authority plus selected-company `MANAGE` scope for the registry and role detail. Keep permission mutation, approval, MFA, audit, and session controls unchanged.

## Context

The prior Roles tab loaded every tenant role and every permission relation, rendered an unbounded list, and had no server-owned filter or pagination contract. The Users pilot and `DEC-0110` established the required authorization/read boundary. Independent Role Library review scored the bounded registry as the highest-value next Administration slice; security review required explicit projections, no capability implication, and direct-route guards.

## Options considered

### Option A — selected: bounded Role Library registry

- Summary: Add a server page contract, exact totals, deterministic ordering, filters, permission count/preview, explicit empty state, and URL-preserving pagination. Keep a separate bounded active-role option catalog for onboarding.
- Why selected: Directly satisfies the visible list gate while reducing unbounded permission reads and preserving existing mutation authority.

### Option B — rejected: paginate role detail assigned users first

- Summary: Improve the detail page while leaving the tenant-wide Role Library unbounded.
- Why rejected: It does not address the visible registry gate or the largest current read.

### Option C — rejected: defer

- Summary: Leave the role list unchanged.
- Why rejected: It preserves a known unbounded read and incomplete operational list behavior.

## Hard-gate assessment

- Tenant and scope isolation remain enforced by tenant-qualified service queries and selected-company `MANAGE` checks.
- `core.tenant_role_administer` remains mandatory; role URLs, previews, and counts never authorize a mutation.
- Role assignments remain tenant-global under `DEC-0043`; selected company is an eligibility/read boundary, not role ownership.
- Permission changes still use the existing reason, audit diff, MFA, segregation, privilege-epoch, session invalidation, and approval-role safeguards.
- No schema, financial, inventory, or workflow mutation is introduced.

## Required safeguards and evidence

- Shared count and row predicates, bounded page/page-size, query length validation, and deterministic ordering.
- Three-permission preview is explicitly incomplete; full permissions require authorized role detail.
- The onboarding selector uses a separate active-role catalog capped at 100 and discloses when more roles exist.
- Empty, restricted, and direct role-detail states must not enumerate role or permission data.
- Focused source/visible-surface tests, full web regression, authorization manifest, typecheck, lint, production build, and `git diff --check` are required. Disposable PostgreSQL authorization/query-plan, responsive browser, and hosted gates remain pending.

## Documentation impact

Updated the Users/Roles UI specification, administrator knowledge-base guide, glossary, release note, and pending implementation plan. The requested Code Spark and GPT-5.4 models were unavailable; the closest permitted GPT-5.6 fallback was used without relaxing any gate.

## Follow-up actions

| Action | Owner | Trigger | Status |
|---|---|---|---|
| Verify PostgreSQL count/row parity and authorization/no-query denial | QA/Security | Disposable database available | Pending |
| Verify desktop/tablet/mobile role filtering and pagination | UX/QA | Seeded browser harness available | Pending |
| Reassess organization, audit, role-detail assigned-user, and export pagination | Decision Chair/Product | After this checkpoint | Pending |
