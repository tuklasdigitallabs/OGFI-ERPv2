# Reviewing Workforce Readiness

**Audience / required role:** HR, workforce managers, branch managers, schedule reviewers, and attendance reviewers with scoped workforce access  
**Applies to:** Current company, brand, location, employee, assignment, schedule, and attendance-import scope  
**Related phase/module:** Phase 3 / Workforce Operations  
**Last verified against:** implemented employee registry, assignment maintenance, leave/overtime/schedule/attendance approval foundations, workforce report preview, evidence metadata, privacy redaction, and no-payroll controls

## Purpose

Use Workforce Operations to review employee records, assignments, schedule coverage, attendance-import exceptions, and readiness issues. The current workflow is a controlled workforce foundation. It does not compute payroll, export payroll, control attendance devices, create payment requests, or post finance journals.

## Prerequisites

- Your role must include workforce view or management access for the selected scope.
- Your ERP header must show the correct company, brand, and location.
- Employee and assignment records must exist before scheduling and request workflows are meaningful.
- Schedule and attendance-import rows must exist before report preview issue labels appear.
- Evidence references or evidence metadata links should be prepared when submitting, approving, publishing, reviewing, or voiding controlled workforce records.

## Navigation Path

`Work Mgmt` or `Restaurant Ops` → `Workforce Operations`

## Steps

1. Open `Workforce Operations`.
2. Review the guardrail banner. It confirms payroll, payment, attendance-device authority, and finance posting are outside this workspace.
3. Review the metric cards for active employees, active assignments, pending leave/overtime, readiness issues, schedule gaps, and attendance exceptions.
4. In `Workforce Report Preview`, review each schedule or attendance-import row.
5. Check `Issues`.
6. Read the issue labels under the badge. Schedule rows can show coverage gaps and the affected stations. Attendance import rows can show attendance exceptions and duplicate rows.
7. Open the related schedule or attendance action section when follow-up is needed.
8. Add evidence metadata links where allowed, but keep actual binary files in the approved evidence repository until production upload/download controls are implemented.
9. Export workforce reports when a reviewer needs a scoped evidence pack.

## Expected Result

- Clean rows show `CLEAN` and no readiness issue flagged.
- Rows needing review show `NEEDS REVIEW` with issue labels explaining the reason.
- Schedule issue labels identify staffing gaps and gap stations when available.
- Attendance issue labels identify exception counts and duplicate rows.
- Exports include issue summaries for review.

## Important Controls And Warnings

- Workforce rows are scoped by company, brand, location, department, and role permissions.
- Confidential names are redacted for users without workforce management visibility.
- Schedule approval, publication, leave, overtime, and attendance-import review are controlled actions with reason/evidence and audit requirements.
- Publishing a schedule with open coverage gaps requires a waiver reason and evidence reference.
- Attendance imports are evidence records. They do not become the attendance-device source of truth in this foundation slice.
- The workspace does not calculate wages, statutory deductions, payroll, payment requests, or finance journals.
- Evidence metadata links do not upload binary files yet. Production binary upload, download, scanning, retention, and download audit remain deferred by `P3-BLOCK-002`.
- Full employee transfer workflow and document retention remain deferred by `P3-BLOCK-007`.

## Related Records Or Next Action

- Use schedule actions to submit, approve, reject, publish, or cancel scoped schedules.
- Use attendance import actions to review or void import batches.
- Use Release Readiness UAT evidence when proving Phase 3 workforce controlled-foundation scenarios.
- Escalate missing document retention or transfer workflow questions to the Phase 3 deferred blocker review.

## Related Articles

- Reviewing Bank And Cash Readiness
- Managing Release Readiness Gates
- Understanding statuses, audit history, and attachments
- Why can't I see my branch, warehouse, or request?
