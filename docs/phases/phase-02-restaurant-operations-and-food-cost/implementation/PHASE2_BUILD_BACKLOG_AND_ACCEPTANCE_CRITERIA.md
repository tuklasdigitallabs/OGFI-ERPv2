# Phase II — Build Backlog and Acceptance Criteria

**Status:** Planned backlog framework

## Objective

Connect controlled inventory to recipes, menu costing, food-cost analysis, daily branch execution, maintenance, incidents, and food-safety controls.

## Backlog Structure

Every build item must include:

- User story and business owner
- Role and scope affected
- Workflow reference
- Data entities and API impacts
- Screen specification and responsive behavior
- Validation and exception paths
- Audit, notification and reporting impact
- Unit, integration, role-permission and UAT acceptance criteria

## Required Epics

- Recipe and sub-recipe management (draft create, edit-by-new-version revision with ingredient append/remove/reorder, link-only sub-recipe lines, revision workbook export, controlled archive, and controlled version workflow implemented; bulk import/apply and recursive sub-recipe costing still staged)
- Recipe costing and version-history visibility for the current implementation slice
- Menu-item costing and version history
- Theoretical versus actual food-cost analysis
- Branch opening and closing controls
- Operational incidents and corrective actions
- Maintenance requests and equipment history
- Food-safety, temperature, sanitation and compliance logs

## Phase Acceptance Gate

The phase may proceed to UAT only when:

1. All priority workflows pass end-to-end tests.
2. Transactions preserve company, brand, location/project, department, requester, status and audit context.
3. Role and segregation-of-duties rules pass negative tests.
4. Mobile use cases work for relevant branch, warehouse, project or field users.
5. Reports, exports, notifications, exception handling and rollback behavior are verified.
6. Required master data, migration and configuration activities are completed.

## Pending Controlled Evidence Upload Slice

**Status:** Pending controlled implementation; current Restaurant Ops workflows capture evidence references, but uploaded files are not yet managed as ERP evidence records.

Build on the shared Evidence Attachment service from the Phase I pending slice before treating photos, documents, or spreadsheets as ERP-managed evidence. The Phase II integration should cover:

- branch opening/closing checklist evidence;
- food-safety photos, temperature-log support, corrective-action proof, and sanitation evidence;
- operational incident photos/documents and resolution evidence;
- maintenance request photos, completion proof, vendor/service documents, and downtime evidence;
- recipe/menu-costing support documents only where approved by policy, without replacing recipe/version source records;
- source-record authorization before view/download from reports, detail pages, dashboards, or exports;
- mobile-friendly camera/file capture for branch workflows;
- audit events for upload, view/download, archive, supersede, denied access, and validation failure;
- UAT proof for valid upload, invalid file type, oversized file, unauthorized download, archive/supersede reason, and audit trail.

Until this slice is implemented, Phase II evidence fields remain references to external proof, not ERP-managed uploaded files.

## Current Recipe CRUD Boundary

The current implementation includes recipe costing, menu-price visibility, food-cost analysis, exports, controlled draft recipe creation, edit-by-new-version revision drafts with existing-line edits, existing-line removal, appended scoped ingredient lines, appended link-only published sub-recipe/prep version lines, line reorder values, a read-only revision workbook export for large recipe planning, controlled recipe archive, controlled recipe-version workflow actions, and controlled menu-price decision records. The workbook is not an import or apply path. The implementation must not expose bulk maintenance, recursive sub-recipe cost flattening, hard deletion, or direct menu-price mutation outside the separate menu-price decision workflow.

Before remaining recipe CRUD can be built, the backlog item must define:

- bulk ingredient maintenance behavior, including large recipe usability, validation, and import/export diff handling;
- whether recursive sub-recipe cost flattening needs materialized snapshots, depth limits, and separate approval evidence;
- import/export maintenance rules for mass recipe updates;
- additional UAT cases for recursive sub-recipe cost flattening, denied access, invalid transition, concurrent edit, export consistency, and no inventory mutation.

## Current Operational Lifecycle Boundary

Branch operations, food-safety logs, incidents, and maintenance tickets now write both audit events and `OperationalStatusTransition` ledger rows for create, review, close, resolve, complete, cancel, and correction actions. Branch checklists and food-safety logs expose returned-record correction apply screens that write `OperationalCorrectionRecord`, audit, and `RETURNED` → `SUBMITTED` transition history before re-review. Incidents and maintenance tickets expose non-terminal detail correction screens that write `OperationalCorrectionRecord`, before/after audit history, and same-status correction transition rows without mutating linked source records. These rows preserve actor, scope, target entity, from/to status, reason, evidence reference, and idempotency key.

Remaining operational correction CRUD is limited to future policy expansion such as terminal-record reopen, structural source-link correction, or richer assignment/status transitions. Those corrections must continue to use `OperationalCorrectionRecord`, preserve original records, and avoid in-place mutation without a transition/audit trail.
