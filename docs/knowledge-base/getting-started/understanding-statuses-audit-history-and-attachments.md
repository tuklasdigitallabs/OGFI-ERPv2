# Understanding Statuses, Audit History, And Attachments

**Audience / required role:** All users  
**Applies to:** Source records, approvals, inventory transactions, project tracker tasks, evidence references, and audit history  
**Related phase/module:** Phase I and Phase 1.5 / Controls and Traceability  
**Last verified against:** implemented status fields, audit events, approval decisions, comments, evidence-reference fields, and attachment metadata boundaries

## Purpose

Use this article to understand how ERP records show progress, accountability, and evidence.

Statuses tell you where a record is in the workflow. Audit history records important actions. Evidence references and attachment metadata help authorized users find supporting documents without replacing the source record.

## Statuses

Common statuses include:

- `DRAFT`
- `SUBMITTED`
- `PENDING_APPROVAL`
- `APPROVED`
- `RETURNED`
- `REJECTED`
- `CANCELLED`
- `POSTED`
- `REVERSED`
- `CLOSED`

Each module may use additional workflow-specific statuses. Always read the record detail page for the next action.

## Audit History

Audit history records important actions such as create, submit, approve, return, reject, cancel, comment, receive, dispatch, post, reverse, export, and configuration changes.

Audit history usually includes:

- Actor
- Action
- Timestamp
- Source record
- Status before and after
- Remarks or reason where applicable

## Attachments And Evidence

Current operational workflows often capture evidence references, such as photo IDs, supplier email references, delivery receipt references, or document numbers. Some project features use attachment metadata links. Access to evidence follows the same source-record and project visibility rules.

## Important Controls And Warnings

- Do not treat comments as approvals.
- Do not treat a task status as an operational transaction status.
- Do not edit posted records directly; use approved reversal or correction workflows.
- Do not share attachment links or exported evidence with unauthorized users.
- Missing status changes should be investigated through the source record, not recreated in another module.

## Related Articles

- How to attach supporting documents or photo evidence
- How to export a report
- Understanding Purchase Order statuses
- Understanding Stock Adjustments
