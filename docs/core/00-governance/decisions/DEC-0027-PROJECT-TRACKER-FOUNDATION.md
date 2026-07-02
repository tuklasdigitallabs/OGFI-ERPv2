# DEC-0027 — Project Tracker Foundation Boundary

## Metadata

- Decision ID: `DEC-0027`
- Title: Project Tracker foundation schema and authorization boundary
- Status: `Confirmed`
- Date: 2026-07-01
- Decision owner: Mithi
- Decision Chair: Codex
- Related phase/module: Phase 1.5 — Projects & Implementation Tracker

## Decision

Implement Phase 1.5 foundation as a narrow additive project-domain slice: `ProjectTemplate`, `Project`, `ProjectMember`, and `ProjectActivityEvent`, seeded project permissions, service-layer project authorization, and a scoped `/projects` foundation page. Defer tasks, comments, checklists, blockers, milestones, attachments, record links, calendars, and source-record summaries.

## Context

Phase 1.5 needs a Trello-like coordination layer without replacing purchasing, receiving, inventory, approval, or accounting records. The first production-shaped slice must establish company scope, restricted visibility, explicit membership, and append-oriented activity before task and source-link surfaces are exposed.

## Options Considered

### Option A — Four-table project foundation

- Summary: Add templates, projects, members, and activity only.
- Benefits: Establishes tenant/company/project controls with minimal schema risk.
- Failure modes: Later shared-engine work may require extension, but the boundary remains clean.
- Why selected: It satisfies the hard gates without locking in unresolved task/link/attachment semantics.

### Option B — Full Phase 1.5 schema now

- Summary: Add tasks, comments, blockers, milestones, links, and reporting in one migration.
- Benefits: More visible functionality sooner.
- Failure modes: High privacy, approval-boundary, and migration risk.
- Why rejected: Source-record link summaries, task status semantics, attachments, and notifications require separate controls.

### Option C — Keep mock only

- Summary: Leave `/projects` as preview UI.
- Benefits: No schema risk.
- Failure modes: No server-side authorization foundation and no real project registry.
- Why rejected: It does not advance Phase 1.5 controls.

## Hard-Gate Assessment

- Tenant/company isolation: Every new project-owned table includes `tenantId` and `companyId`.
- Authorization: Project reads and creates go through `projects.ts` service authorization.
- Restricted visibility: Restricted projects require explicit membership, project scope, or project management permission with company MANAGE scope.
- Source-record boundary: No PR/PO/receiving/transfer/inventory/approval mutation or source-record link payload is implemented in this slice.
- Audit/activity: Project creation writes membership and `ProjectActivityEvent` in the same transaction.
- Phase discipline: Tasks, links, attachments, calendars, and reporting remain deferred.

## Required Safeguards

- Do not add project task/link/comment/attachment behavior until restricted-project isolation tests and source-summary adapters are in place.
- Do not let project membership grant authority over controlled ERP records.
- Do not expose restricted projects in counts, search, exports, or dashboards unless the user is authorized.
- Do not hard-delete project foundation records.

## Implementation and Documentation Impact

- Code / architecture: New project domain service and `/projects` foundation page.
- Data / schema: New project foundation tables and enums.
- Workflow / permissions: New project permission codes and admin seed grants.
- UI / mobile: Foundation list/create page only; board/list/calendar/my-work remain previews.
- Reporting: No project reports in this slice.
- Tests / UAT: Authorization helper tests, route wiring tests, Prisma validation, typecheck, lint, and non-DB regression suite.

## Follow-up Actions

| Action | Owner | Due / trigger | Status |
|---|---|---|---|
| Add task, assignee, checklist, comment, blocker, milestone schema | Codex | Next Phase 1.5 slice | Complete via `DEC-0028` and `DEC-0029` |
| Add source-record link table and safe-summary adapters | Codex | After task foundation | Complete via `DEC-0030` and `DEC-0031` |
| Add project reports and exports | Codex | After task/link controls | Complete via `DEC-0033` and project report/export implementation evidence |

## Evidence

- `docs/phases/phase-01-5-projects-implementation/PROJECTS_IMPLEMENTATION_PRODUCT_SPEC.md`
- `docs/phases/phase-01-5-projects-implementation/data/PROJECTS_IMPLEMENTATION_DATA_EXTENSIONS.md`
- `docs/core/02-controls/ERP_ROLES_AND_PERMISSIONS.md`
- `docs/core/02-controls/SECURITY_AND_AUDIT_MODEL.md`
- Subagent deliberation from architecture, database, and security reviewers in the implementation session.
- Follow-up completion evidence is recorded in `DEC-0028`, `DEC-0029`, `DEC-0030`, `DEC-0031`, and `DEC-0033`.
