# Assignment and Ownership Workflow

## Purpose

Define who is responsible for work and how accountability changes without creating ambiguous ownership or bypassing approval controls.

## Roles on a work item

| Role | Cardinality | Responsibility |
|---|---:|---|
| Accountable Owner | Exactly one | Ultimately accountable for outcome, status accuracy, escalation, and closure readiness. |
| Primary Assignee | Zero or one | Main executor where a specific executor is useful. |
| Additional Assignees | Zero or more | Participate in execution. |
| Reviewer | Zero or more | Reviews work or evidence before a stage advances. |
| Approver | Zero or more | Grants workflow-specific approval; does not replace formal ERP approval where one exists. |
| Watcher | Zero or more | Receives relevant updates without execution ownership. |

## Creation

1. Authorized user creates a container or work item.
2. System assigns company and applicable scope defaults from the container.
3. Creator assigns an accountable owner before submit/activation where the template requires it.
4. Assignees, reviewer, approver, and watcher roles are added according to template and permission rules.
5. System records creation and assignment events in activity history.

## Reassignment

- Reassignment requires permission on the container and the target user must be eligible for the relevant scope.
- The old and new accountable owner are recorded in activity history.
- A reassignment reason is required for overdue, blocked, approval-waiting, or active high-priority work.
- Reassignment does not silently remove reviewers, approvers, dependencies, attachments, or linked records.

## Completion and review

1. Assignee marks work ready for review or complete according to template transition rules.
2. System validates required fields, checklists, evidence, and prerequisite dependencies.
3. Reviewer or authorized owner accepts/reopens work where review is required.
4. Completion timestamp, actor, evidence state, and final status are logged.
5. Completion never mutates a linked PO, invoice, payment, receiving, inventory, or accounting record.

## Blocked and escalation

A blocked work item requires:

- Blocker reason
- Responsible party
- Date raised
- Expected resolution date where known
- Escalation owner for high-impact templates
- Impact label: schedule, cost, compliance, opening date, campaign date, or operational readiness

## Guardrails

- One accountable owner only.
- Users cannot self-approve a work item where a formal approval rule requires independent approval.
- Watchers cannot change state unless separately assigned a permission-bearing role.
- Assignment visibility must respect restricted-project/campaign rules.
- Removal of a user from a project must preserve historical assignment/audit evidence.
