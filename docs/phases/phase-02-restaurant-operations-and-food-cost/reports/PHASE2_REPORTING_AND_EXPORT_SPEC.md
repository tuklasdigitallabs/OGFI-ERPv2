# Phase II — Reporting and Export Specification

**Status:** Planned reporting framework

## Required Report Families

- Food Cost by Branch and Menu Item
- Theoretical vs Actual Variance
- Recipe Cost Change Impact
- Open Incidents and Corrective Actions
- Maintenance SLA and Downtime
- Food Safety Compliance Exception Report

## Standard Requirements

Every report must define:

- Target roles and location/project scope
- Default period and permitted filters
- Required columns, totals, groupings and drill-downs
- Export format: CSV, XLSX and/or PDF where justified
- Source record and reconciliation rules
- Treatment of cancelled, reversed, pending and draft records
- Permission controls and confidential-data restrictions
- Export started, completed, denied, and failed events must be audited for Restaurant Ops CSV exports.

## Build Gate

No dashboard or report may invent a calculation that conflicts with transaction records, approved inventory valuation, approved budget model, recipe version, project budget or payroll/attendance source of truth.

## Implemented Source Rules

### Food Cost Analysis

- Recipe costing reports distinguish recipe lifecycle status (`ACTIVE`, `INACTIVE`, `ARCHIVED`) from the selected costing-version status (`PUBLISHED`, `DRAFT`, `SUPERSEDED`, or equivalent version state).
- Recipe costing search, status filters, and CSV exports use recipe lifecycle status for the main recipe filter while retaining the selected version status as separate trace evidence.
- Recipe costing must use supplier price history effective on the selected recipe version date where available, so historical versions are not silently recalculated using future supplier prices.
- Recipe line costing must convert ingredient quantities into the supplier price UOM before multiplying by unit price; when the required item-specific conversion is missing, the affected line cost remains pending instead of assuming equivalence.
- Recipe costing views and exports must expose costing readiness, including costed line count and pending cost line count, so missing supplier price or UOM evidence is visible before managers rely on plate-cost totals.
- Theoretical cost is derived from posted sales import lines, published recipe/menu item cost basis, and active menu pricing.
- Actual cost is currently summarized at the selected branch and business-date level from posted outbound inventory ledger movements only: wastage out, adjustment out, and count variance out.
- Menu item rows remain theoretical-only until a controlled source links actual ingredient consumption to menu item sales or production records.
- Variance is calculated only where ledger-derived actual cost exists; no report may allocate branch-level actual cost across menu items by assumption.
- CSV exports must include the actual-cost source and movement count so reviewers can distinguish ledger-derived values from pending menu-level actuals.
- Food-cost drilldowns and CSV exports preserve selected business date, sales-row filters, and actual-ledger evidence filters.
- Food-cost business-date filters and Restaurant Ops action dates use strict `YYYY-MM-DD` calendar-date parsing; malformed dates such as impossible month/day combinations must not be silently normalized.
- The food-cost drilldown shows filtered sales totals and filtered ledger-evidence totals when filters are active, so reviewers can distinguish the visible subset from full-date totals.
- Food-cost CSV exports include filtered sales row count, quantity sold, net sales, theoretical cost, theoretical food-cost percentage, actual evidence row count, actual quantity, and actual cost for the exported filter set.
- Food-cost analysis views and CSV exports must summarize row health counts for within-target, above-target, missing-cost, and awaiting-actuals menu rows.
- While `DEC-0062` remains open, Operational Dashboard Food Cost summaries and Food Cost exception notifications are deliberately withheld. The current analysis mixes unresolved business-date, valuation-completeness, and status semantics, so it must not be promoted into numeric cards, health counts, queues, source-health claims, or new reminders. Authorized users may open the independently scoped Food Cost Analysis source workspace. Dashboard and notification activation requires all three definitions to be confirmed and parity-tested; the dashboard must then use a bounded authoritative source projection rather than recomputing definitions.
- Recipe revision workbook exports are planning exports only. They may include existing source lines, planned line fields, new ingredient and link-only sub-recipe template rows, and change-note columns, but they must not import, apply, or mutate recipe, menu-price, inventory, POS, finance, or approval-source records.
- Recipe revision workbook exports must be permissioned with recipe-costing export access, preserve recipe and selected-version context, and audit export started/completed/denied/failed events.

### Branch Operations and Food Safety

- Branch checklist and food-safety list views must support business-date filtering in addition to text, status, shift/log-type filters.
- CSV exports must preserve the same business-date and search filters shown in the list view.
- Evidence references included in searchable lines or readings must be visible in list rows and exported so reviewers can understand why a record matched a search.
- Branch checklist detail and CSV exports show opened-by, submitted-by, reviewed-by, and reviewed-at context when the source record has those actor fields.
- Food-safety detail and CSV exports show recorded-by, reviewed-by, and reviewed-at context when the source log has those actor fields.
- Authorized users may create scoped branch checklist source records with structured lines, result, severity, evidence, and audit history; creation does not mutate inventory, incidents, maintenance, approvals, or finance records.
- Authorized users may create scoped food-safety source logs with structured readings, result, severity, corrective action, evidence, and audit history; creation does not create incidents, post wastage, adjust stock, or review the log.
- Authorized users may review submitted or manager-review branch checklists, recording reviewer, review date, outcome, review note, and audit history.
- Branch checklist review does not post inventory, approve adjustments, close incidents, close maintenance tickets, or resolve exceptions automatically.
- Authorized users may return submitted or manager-review branch checklists for correction and may apply corrections only from `RETURNED`; correction creates `OperationalCorrectionRecord`, audit, and transition history without posting inventory or mutating linked source records.
- Authorized users may close reviewed or exception-open branch checklists by recording a close reason and audit history.
- Branch checklist close does not post inventory, approve adjustments, close incidents, close maintenance tickets, or mutate linked source records.
- Authorized users may review submitted or exception-review food-safety logs, recording reviewer, review date, outcome, review note, and audit history.
- Food-safety review does not create incidents, post wastage, adjust stock, or close compliance actions automatically.
- Authorized users may return submitted or exception-review food-safety logs for correction and may apply corrections only from `RETURNED`; correction creates `OperationalCorrectionRecord`, audit, and transition history without posting inventory, creating wastage, or mutating linked source records.
- Authorized users may close reviewed or exception-open food-safety logs by recording a close reason and audit history.
- Food-safety close does not create incidents, post wastage, adjust stock, or mutate linked source records.
- Dashboards must separately show review-ready branch checklists and food-safety logs without replacing the source review action in those modules.
- Branch checklist and food-safety dashboards and CSV exports must expose source-level status and exception-severity counts so operational health cards use the same definitions as the source modules.
- Restaurant-operations notification scans must include review-ready branch checklists and food-safety logs as source-linked reminders without performing review.

### Maintenance

- Authorized users may create scoped maintenance tickets with structured asset, area, priority, due date, downtime, corrective-action, and evidence-reference fields.
- Maintenance ticket creation rejects target due dates earlier than the requested date so SLA and overdue reports are not polluted by invalid aging data.
- Maintenance ticket creation records audit history and does not approve purchasing, post inventory, mutate incidents, or create finance records.
- Authorized users may correct non-terminal maintenance ticket details with reason/evidence; correction creates `OperationalCorrectionRecord`, before/after audit, and same-status transition history without resolving the linked incident or mutating purchasing, inventory, or finance records.
- Authorized users may complete open, in-progress, or vendor-pending maintenance tickets by recording completion date, downtime, corrective action, and evidence reference.
- Maintenance ticket completion records audit history and does not approve purchasing, post inventory, mutate incidents, or create finance records.
- Authorized users may cancel open, in-progress, or vendor-pending maintenance tickets by recording a cancellation reason and audit history.
- Maintenance ticket cancellation records audit history and does not approve purchasing, post inventory, mutate incidents, or create finance records.
- Authorized users may resolve open, in-progress, or pending-review incident records by recording resolution date, corrective action, and evidence reference.
- Incident creation rejects due dates earlier than the incident date so overdue dashboards and follow-up reports are not polluted by invalid aging data.
- Authorized users may correct non-terminal incident details with reason/evidence; correction creates `OperationalCorrectionRecord`, before/after audit, and same-status transition history without mutating food-safety, maintenance, inventory, approval, purchasing, or finance records.
- Incident resolution records audit history and does not approve food-safety, inventory, maintenance, purchasing, approval, or finance source records.
- Authorized users may cancel open, in-progress, or pending-review incidents by recording a cancellation reason and audit history.
- Incident cancellation records audit history and does not approve food-safety, inventory, maintenance, purchasing, approval, or finance source records.
- Incident and maintenance list views and CSV exports preserve incident/requested date filters alongside text, status, severity, and priority filters.
- Incident and maintenance status filters use the implemented source statuses, including `CANCELLED`; they must not expose unsupported `CLOSED` filters in the restaurant-operations queues.
- Incident detail, maintenance detail, and their CSV exports show reported-by and owner context when the source record has those actor fields.
- Incident detail/list/CSV views expose read-only source record type and source record ID when an incident is linked to an originating checklist, food-safety log, or other source record.
- Maintenance detail/list/CSV views expose read-only source incident ID when a ticket is linked to an incident. Completing the maintenance ticket must not resolve or mutate the linked incident.
- Incident source links and maintenance source incident links must be validated against tenant, company, brand when applicable, and location scope during creation. Invalid or out-of-scope source IDs must be rejected before the destination record is created.
- Incident and maintenance dashboards and CSV exports must expose source-level status/severity or status/priority counts so operational health cards use the same definitions as the source modules.
- Incident and maintenance overdue counts use date-only comparison in the operational timezone, so records due today are not treated as overdue because of the current clock time.
- Restaurant Ops export routes return controlled validation errors where available and audit failed export attempts with a sanitized failure reason.
- Restaurant Ops CSV date filters must reject malformed `YYYY-MM-DD` query values with a controlled `400` response before rows are built, and the failed export audit must store the stable validation reason code.
