# Understanding Statuses, Audit History, And Attachments

**Audience / required role:** All users  
**Applies to:** Source records, approvals, inventory transactions, project tracker tasks, evidence references, and audit history  
**Related phase/module:** Phase I and Phase 1.5 / Controls and Traceability  
**Last verified against:** implemented status fields, approval decisions, comments, evidence-reference fields, attachment metadata boundaries, and database append-only guards for protected history; production activation remains subject to the release gate

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

Three protected types of history are append-only:

- `AuditEvent` records important actions and decisions on ERP records.
- `ProjectActivityEvent` records project and task activity.
- `InventoryMovement` records posted stock increases, decreases, and reversals in the inventory ledger.

Append-only means an existing history row cannot be edited, deleted, or cleared in bulk. If information is wrong, an authorized user must use the applicable correction or reversal workflow. The ERP then adds new history while retaining the original entry. The available correction path depends on the record type and its current status.

## Attachments And Evidence

Current operational workflows often capture evidence references, such as photo IDs, supplier email references, delivery receipt references, or document numbers. Some project features use attachment metadata links. Access to evidence follows the same source-record and project visibility rules.

## Important Controls And Warnings

- Do not treat comments as approvals.
- Do not treat a task status as an operational transaction status.
- Do not edit posted records directly; use approved reversal or correction workflows.
- Do not ask an administrator to delete or rewrite audit, project-activity, or inventory-movement history to hide or correct an error.
- An inventory reversal creates a linked movement; it does not overwrite or remove the original movement. The applicable workflow may require permission, reason, evidence, and approval.
- A correction does not erase the earlier action. Review the complete sequence of original and corrective entries when investigating a record.
- Do not share attachment links or exported evidence with unauthorized users.
- Missing status changes should be investigated through the source record, not recreated in another module.

## Related Articles

- How to attach supporting documents or photo evidence
- How to export a report
- Understanding Purchase Order statuses
- Understanding Stock Adjustments
