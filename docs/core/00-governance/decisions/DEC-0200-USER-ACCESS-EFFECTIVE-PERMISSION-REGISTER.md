# DEC-0200 — User Access Complete Effective-Permission Register

## Metadata

- Decision ID: `DEC-0200`
- Title: User Access complete effective-permission register
- Status: `Confirmed — implementation checkpoint; PostgreSQL, browser, hosted, and UAT gates remain open`
- Date: 2026-07-25
- Decision owner: Parent agent
- Decision Chair: Parent agent
- Related phase/module: Phase I — Core Administration / User Access
- Related decision brief: Parent-led DEC-0200 deliberation (independent Product and Architecture review)
- Specialist fallback: GPT-5.6; requested Code Spark/GPT-5.4 deliberators were unavailable

## Decision

User Access → Roles provides a complete, read-only, URL-backed effective-permission register for the selected user. The server owns search, exact filtered and unfiltered totals, deterministic `code ASC, id ASC` ordering, stale-page clamping, clear-search recovery, and bounded page sizes from 10 to 100; the Overview remains a bounded preview.

The register is the union of permissions from currently effective active tenant/global roles and assignments. Each permission links to the authorized read-only Permission Access definition/granting-role view. The register does not mutate roles, assignments, or permissions, and the separate Assigned Roles lifecycle register remains authoritative for scheduled and ended assignments.

## Context

The Overview preview could not provide a complete access-review surface for users with many permissions, while an unbounded browser read or client-side union would be unsafe and inconsistent with Administration paging controls. The Roles workspace therefore needs a truthful complete register without turning review into a grant-control surface or conflating effective permissions with assignment lifecycle history.

## Options considered

### Option A — selected: read-only server-owned effective-permission register

- Summary: URL-backed Roles register with server search, exact totals, deterministic paging, effective-date predicates, and links to Permission Access.
- Benefits: Complete review surface; scalable high-cardinality reads; truthful filtered/unfiltered counts; preserves separation between effective access and assignment lifecycle.
- Failure modes: Incorrect role/assignment predicates could overgrant or omit permissions; duplicate permissions may appear without union/deduplication; stale page or filtered-empty states can mislead users.
- Why selected: Meets the parent decision, preserves authorization parity, is reversible, and keeps mutations in existing authorized controls.

### Option B — rejected: bounded Overview preview only

- Summary: Continue showing only a bounded effective-permission preview in Overview.
- Benefits: Smallest read and UI surface.
- Failure modes: High-cardinality permissions remain undiscoverable; reviewers cannot verify the complete effective union; preview totals can be mistaken for the full set.
- Why rejected: Does not satisfy the complete access-review requirement.

### Option C / defer — rejected: mutation-capable register or client-side full hydration

- Summary: Let the register edit access, or hydrate all roles/permissions in the browser and derive the union locally.
- Benefits: Fewer navigation steps, superficially simple client interaction.
- Failure modes: Expands authority without a reviewed mutation contract; risks tenant/scope bypass, stale or duplicated data, unbounded reads, and divergence from Permission Access truth.
- Why rejected: Violates read-only scope, server authorization, bounded-read, and audit controls. Any future mutation workflow requires a separate decision.

## Hard-gate assessment

- Tenant and company scope: Effective permissions use active tenant/global roles and assignments with the existing authorization-parity predicates; no cross-tenant records are included.
- Authorization: Read access remains server-enforced. Permission links target the existing authorized read-only Permission Access route; UI hiding is not the control.
- Audit and segregation: The register has no grant, revoke, or assignment mutation, so existing audited role controls and no-self-approval rules remain authoritative.
- Transaction and data integrity: Reads are server-owned and bounded; the permission union is deduplicated before paging. No inventory or money state is changed.
- Phase scope: This is a Phase I Core Administration access-review surface; no future module or new policy is introduced.
- Recovery/reversibility: URL query state, paging, and read-only projections can be reverted without data migration. PostgreSQL/query-plan, browser, hosted recovery, and UAT evidence are still required gates.

## Required safeguards

- Keep active-role, active-assignment, effective-start/end-date, tenant/global-role predicates aligned with authorization services.
- Deduplicate the permission union before applying deterministic `code ASC, id ASC` ordering and page limits; return exact filtered and unfiltered totals from the server.
- Clamp stale pages to the filtered page count, preserve selected-user/company context in URLs, and provide clear-search recovery for filtered-empty results.
- Enforce page-size bounds of 10–100 and server-side query validation; do not use browser slicing or unbounded nested hydration.
- Keep register rows and Permission Access links read-only; route all future mutations through separately authorized, audited controls.
- Verify duplicate/overlap, future/expired/inactive, cross-tenant, high-cardinality, count/page parity, authorization, responsive browser/mobile, hosted recovery, and UAT fixtures.

## Implementation and documentation impact

- Code / architecture: User detail service exposes a server-owned `permissionsPage`/effective union only for the Roles surface; non-Roles sections do not load the register query.
- Data / schema: No schema or migration change. Existing role, assignment, and permission records remain the source of truth.
- Workflow / permissions: No authority change. Permission Access remains a read-only definition/granting-role view; Assigned Roles remains the lifecycle register.
- UI / mobile: Roles is URL-backed and paginated with search, exact totals, stale-page handling, and permission links. Overview discloses its bounded preview; responsive browser/mobile validation remains open.
- Reporting: No new report or export.
- Knowledge base / training: Glossary, Users/Roles UI specification, administration guidance, and release notes describe the complete register and Permission Access distinction; Dunong should assess end-user help/release impact before release.
- Tests / UAT: Focused Core Admin tests pass 36/36. Web typecheck, lint, production build, disposable PostgreSQL, query-plan, browser/mobile, hosted recovery, and UAT gates remain open.

## Follow-up actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Run web typecheck, lint, and production build for the slice | Parent / QA | Before commit | Required |
| Execute disposable PostgreSQL overlap, deduplication, effective-date, tenant-isolation, and count/page-parity fixtures | QA / Engineering | Before UAT | Open |
| Verify responsive browser/mobile behavior and hosted recovery | QA / DevOps | Before release readiness | Open |
| Complete UAT evidence for high-cardinality effective-permission review | Parent / UAT | Before Phase I completion | Open |
| Assess end-user knowledge-base and training updates | Dunong | Before release | Handoff required |

## Evidence

- `docs/core/07-quality/CURRENT_PENDING_IMPLEMENTATION_PLAN.md` — DEC-0200 checkpoint and open validation gates.
- `docs/phases/phase-01-procurement-inventory/specs/users-roles-ui-spec.md` — User Access Roles register and Permission Access implementation notes.
- `apps/web/src/server/services/coreAdmin.ts` — effective-permission predicates, exact totals, deterministic paging, and role-surface projections.
- `apps/web/src/app/(app)/admin/users/[id]/page.tsx` — URL-backed Roles register, search, pagination, exact-total labels, and Permission Access links.
- `apps/web/src/server/services/coreAdmin.test.ts` — focused Core Administration contract assertions (36/36 passing).
- `docs/core/00-governance/decisions/DEC-0152-ADMIN-PERMISSION-ACCESS-BOUNDED-DETAIL.md` and `DEC-0192-PERMISSION-ACCESS-SUMMARY-TRUTH.md` — existing read-only Permission Access and truthful summary contracts.
- Parent-led independent Product and Architecture review; requested Spark/GPT-5.4 deliberators unavailable, GPT-5.6 fallback recorded above.

## Supersession

Not superseded. Any future decision that adds mutation, changes effective-role predicates, or changes Permission Access semantics must explicitly supersede this record.
