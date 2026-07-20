# How To Export A Report

**Audience / required role:** Managers, purchasing users, warehouse users, finance, auditors, project users, and administrators with export access  
**Applies to:** Scoped list pages, report catalog, project reports, and admin audit export  
**Related phase/module:** Phase I / Reports and Exports  
**Last verified against:** implemented scoped CSV exports, export authorization, export metadata, and export audit logging

## Purpose

Use this article when you need a CSV export from a permitted source record list or report.

Exports follow the same source-record permissions and scope as the screen. If you cannot view the source records, you should not expect them to appear in the export.

## Before You Start

- Confirm the ERP header location and scope.
- Open the source module or `Reports`.
- Apply the filters you want before exporting.
- Confirm your role includes export access for that report or module.

## Navigation Paths

Common export paths include:

- `Reports -> Export CSV`
- `Purchase Requests -> Export CSV`
- `Purchase Orders -> Export CSV`
- `Receiving -> Export CSV`
- `Inventory -> Export CSV`
- `Inventory Ledger -> Export CSV`
- `Transfers -> Export CSV`
- `Stock Counts -> Export CSV`
- `Wastage -> Export CSV`
- `Adjustments -> Export CSV`
- `Projects -> Export CSV`
- `Admin -> Audit Events -> Export CSV`

## Steps

1. Open the source page or `Reports`.
2. Confirm the active company, brand, and location context.
3. Apply search, status, date, or other available filters.
4. Select `Export CSV`.
5. Open the downloaded CSV in your spreadsheet tool.
6. Check the export metadata rows before using the data.

## CSV Metadata Rows

Operational CSV exports include a metadata block before the data rows. Review it for:

- export filename
- generated-at UTC timestamp
- report ID
- company, brand, location, and location type
- scope-filter requirement, showing whether scope filters are required
- reporting trust-gate label and mode
- trust-gate source decision, normally `DEC-0036`
- whether the trust-gate setting is overridden

Some exports add extra context, such as Purchase Order filter values, recipe ID, or a release-readiness scope note.

## Expected Result

- The CSV contains only records the user is authorized to export.
- Active filters and selected scope are preserved by the export route where supported.
- The CSV metadata shows the selected scope and DEC-0036 trust-gate context.
- Operational exports write audit events for denied, started, and completed export attempts.
- Project exports use project visibility and do not expose protected source-record payloads.
- Admin audit export requires core administration permission.

## Important Controls And Warnings

- Do not share exported files with users who lack access to the source records.
- Exports are not a replacement for source records, approvals, receiving, transfer, posting, or audit history.
- Project exports summarize project/task data and safe linked-record indicators; they do not duplicate operational records.
- If `Export CSV` is not visible, the user likely lacks export permission for that source.
- All-company or all-location exports are only for authorized users and reports.

## What To Check

- The exported rows match the filter and scope you expected.
- Sensitive fields are present only when your role is allowed to see them.
- The report ID, filename, generated timestamp, selected scope, and trust-gate source decision are present.
- If the export is denied, ask an administrator to review permissions and scope instead of using another user's account.

## Related Articles

- Why can't I see my branch, warehouse, or request?
- Why can't I approve this request?
- Viewing current stock balances
- Viewing inventory movement history
