# Understanding Report Trust Notices

**Audience / required role:** Report users, managers, auditors, project users, and administrators  
**Applies to:** Operational Reports, CSV exports, dashboard/report interpretation  
**Last verified against:** DEC-0036 report trust notices and source-record scoped report catalog

## Purpose

Report trust notices explain whether a report is reading authoritative ERP source records or whether the data requires extra caution before it is used for decisions.

## Common Notices

| Notice | Meaning |
|---|---|
| `Source-record scoped` | The report opens or exports permitted ERP source records for the selected company/location scope. It does not approve, post, reverse, or replace the workflow record. |
| `POS/import trust-gated` | The report depends on imported sales or external source data. Treat it as analysis-only until the import source, completeness, duplicates, and reconciliation are validated. |

## What To Check

1. Confirm the selected company, brand, and location context.
2. Confirm you have permission to open the related source records.
3. Review any trust warning before using totals for operational decisions.
4. For imported sales/POS analysis, confirm the import batch has been validated and posted before treating KPIs as authoritative.
5. Use the source record for approvals, receiving, inventory posting, reversals, and audit review.

## Controls

- Report cards show DEC-0036 trust notices.
- CSV exports preserve server-side permissions and selected operating scope.
- Operational CSV metadata includes report ID, company, brand, location, scope-filter requirement, trust-gate mode, trust-gate source decision, and override status.
- Export attempts write audit history.
- Project exports use safe summaries and redaction where users lack linked source-record access.

Reports are visibility tools. They do not replace purchasing, receiving, inventory, project, or audit source records.
