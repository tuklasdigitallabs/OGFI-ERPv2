# Phase II — UAT Scenarios

**Status:** Planned UAT framework

**Deferred go-live blockers:** [Phase 2 deferred go-live blockers](../../../core/07-quality/PHASE2_DEFERRED_GO_LIVE_BLOCKERS_FOR_UAT.md) records the Phase 2 release blockers parked for actual user UAT. These items are not passed, resolved, waived, or approved for production go-live until reviewed with evidence and owner signoff.

## Required UAT Coverage

- Happy-path transaction execution
- Rejection, return-for-revision, cancellation and reversal paths
- Role and location/project access boundaries
- Approval delegation, escalation and overdue behavior
- Attachment, photo and document evidence
- Audit log completeness
- Export and reporting reconciliation
- Desktop, tablet and mobile execution where relevant
- Duplicate-submission, network-retry and concurrent-update protection

## Required Sign-Off Roles

- Business owner for the phase
- Finance / Accounting when financial impact exists
- Operations or Branch representative when operational impact exists
- IT / Security owner
- Executive sponsor or delegated release authority

## Implemented Workflow UAT Scripts

### Recipe Costing And Version History

1. Open `Recipes and Menu Costing` as an authorized restaurant-operations user.
2. Search by recipe name, item code, and menu item; filter by type and status.
3. Open a recipe detail and confirm the selected costing version, ingredient lines, yield, serving, price basis, and version history are visible.
4. Create a draft recipe with recipe code, type, yield, serving, target food cost, and ingredient lines.
5. Confirm the new draft opens in detail view, remains unpublished, and does not change menu price, POS, inventory, finance, or approvals.
6. Export the filtered recipe costing register and confirm the CSV preserves the same search/type/status filters.
7. Confirm permitted users see only server-allowed recipe-version actions for the selected status.
8. Create a menu-price decision for a linked menu item, move it through submit/review/approve/apply, and confirm the applied action inserts a new effective-dated price.
9. Export the recipe revision workbook from the detail page and confirm it includes existing source lines, planning columns, template rows for new ingredient and link-only sub-recipe lines, and no import/apply action.
10. Create a recipe revision draft from the current costing version, change yield/serving or line quantities, remove an existing ingredient line, append a new ingredient line from the scoped catalog, append a published sub-recipe/prep version line, change line order values, and confirm the published costing basis does not change until the new version is submitted, approved, and published.
11. Attempt to archive a recipe with an open draft/review/approved version and confirm the action is blocked with a user-safe error.
12. Archive a recipe with no open version, provide a reason, and confirm the recipe lifecycle status changes to `ARCHIVED` without changing menu prices, POS, inventory, finance, or approvals.
13. Confirm bulk import/apply and recursive sub-recipe cost flattening remain unavailable in this slice.

Acceptance evidence:

- Unauthorized users are redirected away from recipes.
- Exported rows match the filtered list and do not mutate recipes, inventory, or prices.
- The revision workbook export is read-only, audited, preserves source recipe/version context, includes planning columns for large recipe review, and does not mutate recipes, recipe lines, inventory, or prices.
- Draft recipe creation requires `restaurant.recipe.manage`, creates one draft version and ingredient lines, and writes audit history.
- Revision draft creation requires `restaurant.recipe.manage`, supports existing-line quantity/prep edits, existing-line removal, appended scoped ingredient lines, appended published sub-recipe/prep version links, and line reorder values, supersedes the source version only after the normal publish flow, and writes audit history.
- Recipe archive requires `restaurant.recipe.archive`, blocks open recipe versions, requires a reason, soft-archives the recipe, and writes audit history.
- Version history identifies the current costing basis without replacing historical versions.
- Recipe-version workflow actions write transition history and audit records.
- Menu-price decisions do not change menu price until the authorized apply action.
- Bulk import/apply and recursive sub-recipe cost flattening remain unavailable until covered by approved workflow and separate UAT.

### Food-Cost Analysis

1. Open `Food Cost Analysis` for a branch with posted sales import data.
2. Select a business date, filter sales rows by search/status, and filter actual-ledger evidence by search/movement type.
3. Confirm theoretical cost is derived from posted sales and recipe costing.
4. Confirm actual cost uses posted outbound inventory movements only.
5. Confirm visible-sales and visible-ledger summary cards change with the active filters while the full-date summary cards remain unchanged.
6. Export CSV and confirm business date, sales filters, actual-ledger filters, filtered sales totals, and filtered actual-ledger totals are preserved.

Acceptance evidence:

- Menu-item actual cost is not allocated by assumption.
- Missing actual ledger is shown as pending evidence, not silently treated as zero.
- CSV includes actual-cost source, movement count, filtered sales totals, filtered evidence row count, filtered actual quantity, and filtered actual cost.

### Branch Operations

1. Open `Branch Operations` for a branch user.
2. Create a branch checklist with business date, shift, checklist name, structured lines, results, severity, notes, and evidence reference.
3. Confirm the new checklist opens in detail view and appears in the queue.
4. Filter by business date, shift, status, and evidence/search text.
5. Open a checklist detail and verify line results, severity, notes, evidence references, and source context.
6. Review a submitted checklist with review date, outcome, and review note.
7. Return another submitted checklist for correction with a correction reason and evidence reference.
8. Correct the returned checklist lines, provide a correction reason/evidence reference, and resubmit for review.
9. Close a reviewed or exception-open checklist with a close reason.
10. Export the filtered checklist report.

Acceptance evidence:

- Users see only their authorized location scope.
- Only users with `restaurant.branch_operations.create` can create branch checklists.
- Only users with `restaurant.branch_operations.review` can review checklists.
- Creation writes audit history and does not post inventory, create incidents, close maintenance tickets, approve records, or create finance changes.
- Evidence references visible in list rows also appear in export.
- Branch review blocks self-review, records audit history, and does not post inventory, approve adjustments, or replace incident/maintenance records.
- Branch return-for-correction creates an `OperationalCorrectionRecord`, moves the source checklist to `RETURNED`, records audit history and transition history, and does not overwrite checklist lines.
- Branch correction apply is allowed only from `RETURNED`, updates the controlled checklist line values, creates an applied `OperationalCorrectionRecord`, records before/after audit history, moves the checklist back to `SUBMITTED`, and does not post inventory, approve adjustments, or replace incident/maintenance records.
- Branch close requires a reason, records audit history, blocks invalid status closure, and does not post inventory, approve adjustments, or replace incident/maintenance records.
- Create, review, correction, and close actions also create `OperationalStatusTransition` rows with actor, scope, from/to status, reason or evidence where applicable, and idempotency key.

### Food Safety

1. Open `Food Safety` for a branch user.
2. Create a food-safety log with business date, log type, title, structured readings, result, severity, corrective action, and evidence reference.
3. Confirm the new log opens in detail view and appears in the queue.
4. Filter by business date, log type, status, and evidence/search text.
5. Open a log detail and verify station readings, expected ranges, exception severity, corrective action, and evidence reference.
6. Review a submitted or exception-review log with review date, outcome, and review note.
7. Return another submitted or exception-review log for correction with a correction reason and evidence reference.
8. Correct the returned readings, provide a correction reason/evidence reference, and resubmit for review.
9. Close a reviewed or exception-open log with a close reason.
10. Export the filtered food-safety report.

Acceptance evidence:

- Users see only authorized location data.
- Only users with `restaurant.food_safety.create` can create food-safety logs.
- Only users with `restaurant.food_safety.review` can review food-safety logs.
- Creation writes audit history and does not create incidents, post wastage, adjust stock, approve records, or create finance changes.
- Exceptions remain compliance source records and do not create inventory or incident changes automatically.
- Review blocks self-review, records audit history, and does not create inventory, wastage, incident, or finance changes automatically.
- Food-safety return-for-correction creates an `OperationalCorrectionRecord`, moves the source log to `RETURNED`, records audit history and transition history, and does not overwrite readings.
- Food-safety correction apply is allowed only from `RETURNED`, updates the controlled reading values, creates an applied `OperationalCorrectionRecord`, records before/after audit history, moves the log back to `SUBMITTED`, and does not create inventory, wastage, incident, or finance changes automatically.
- Food-safety close requires a reason, records audit history, blocks invalid status closure, and does not create inventory, wastage, incident, or finance changes automatically.
- Create, review, correction, and close actions also create `OperationalStatusTransition` rows with actor, scope, from/to status, reason or evidence where applicable, and idempotency key.
- Export preserves date/type/status/search filters.

### Incidents

1. Log a new operational incident from the incident queue using category, severity, incident date, summary, due date, corrective action, evidence reference, and optional read-only source record link.
2. Confirm the new incident opens in detail view and appears in the queue.
3. Correct an open incident detail with a correction reason/evidence reference and verify the status remains non-terminal.
4. Resolve an open incident with resolution date, corrective action, and evidence reference.
5. Cancel another open incident with a cancellation reason.
6. Filter by incident date, status, severity, and search text.
7. Export the filtered incident corrective-action report.

Acceptance evidence:

- Only users with `restaurant.incident.create` can log incidents.
- Only users with `restaurant.incident.create` can correct non-terminal incident details.
- Only users with `restaurant.incident.resolve` can resolve incidents.
- Creation writes an audit event and does not mutate food-safety, maintenance, inventory, approval, or finance records.
- Correction writes an applied `OperationalCorrectionRecord`, before/after audit history, and same-status transition history, blocks terminal-status correction, and does not mutate food-safety, maintenance, inventory, approval, or finance records.
- Resolution writes an audit event, blocks duplicate resolution, and does not mutate food-safety, maintenance, inventory, approval, or finance records.
- Cancellation writes an audit event, requires a reason, blocks terminal-status cancellation, and does not mutate food-safety, maintenance, inventory, approval, or finance records.
- Create, correct, resolve, and cancel actions also create `OperationalStatusTransition` rows with actor, scope, from/to status, reason or evidence where applicable, and idempotency key.
- Source-record links must reference an authorized same-scope source record or creation is blocked with a controlled validation error.
- Export preserves incident date/status/severity/search filters.

### Maintenance

1. Create a new maintenance ticket using requested date, asset, area, category, priority, title, description, due date, downtime, corrective action, evidence reference, and optional read-only source incident link.
2. Confirm the new ticket opens in detail view and appears in the queue.
3. Correct an open ticket detail with a correction reason/evidence reference and verify the status remains non-terminal.
4. Complete an open ticket with completion date, downtime, corrective action, and evidence reference.
5. Cancel another open ticket with a cancellation reason.
6. Open another ticket for the same asset and verify same-location asset history is visible.
7. Filter by requested date, status, priority, and search text.
8. Export the filtered maintenance SLA/downtime report.

Acceptance evidence:

- Only users with `restaurant.maintenance.create` can create tickets.
- Only users with `restaurant.maintenance.correct` can correct non-terminal maintenance ticket details.
- Only users with `restaurant.maintenance.complete` can complete tickets.
- Creation writes an audit event and does not approve purchasing, post inventory, mutate incidents, or create finance records.
- Correction writes an applied `OperationalCorrectionRecord`, before/after audit history, and same-status transition history, blocks terminal-status correction, and does not approve purchasing, post inventory, mutate incidents, or create finance records.
- Completion writes an audit event, blocks duplicate completion, and does not approve purchasing, post inventory, mutate incidents, or create finance records.
- Cancellation writes an audit event, requires a reason, blocks terminal-status cancellation, and does not approve purchasing, post inventory, mutate incidents, or create finance records.
- Create, correct, complete, and cancel actions also create `OperationalStatusTransition` rows with actor, scope, from/to status, reason or evidence where applicable, and idempotency key.
- Source incident links must reference an authorized same-scope incident or creation is blocked with a controlled validation error.
- History is same-location and same-asset only.
- Export preserves requested date/status/priority/search filters.

### Dashboard, Reports, And Notifications

1. Open dashboard `Overview`, `Analytics`, `Reports`, and `Notifications` tabs.
2. Confirm Phase II cards link to their source modules: recipes, food-cost analysis, branch operations, food safety, incidents, and maintenance.
3. Run project, approval, and restaurant-operations notification scans from the notification center while a status/group tab is selected.
4. Open `Reports`, select the `Restaurant Ops` tab, and verify each report opens the correct source module or CSV export.
5. Confirm branch and food-safety review-ready cards open source modules rather than performing review from the dashboard.
6. Confirm restaurant-operations notification scan creates source-linked review reminders for branch and food-safety review-ready records.

Acceptance evidence:

- Dashboard cards and reports do not replace detailed source records.
- Incident and maintenance shortcuts route to separate modules.
- Branch checklist and food-safety review indicators remain visibility-only and route to source records.
- Notification scan redirects preserve current inbox tab/status.
- Restaurant-operations notification reminders do not review branch checklists or food-safety logs automatically.

## Exit Rule

Critical defects must be resolved. High-severity defects require an approved workaround and explicit release acceptance. No unresolved defect may compromise data integrity, location/project scope, approvals, inventory, payment, legal documents, or employee privacy.
