# Project Task Workflow

## Purpose

Define controlled creation, assignment, execution, review, and completion of project tasks.

## Task lifecycle

Backlog → Planned → In Progress → Waiting for Approval / For Review → Completed

Alternative outcomes: Blocked, Cancelled, Reopened.

## Workflow

1. Project Manager or authorized Contributor creates a task within a permitted project.
2. Task includes title, status, priority, owner, assignees, due date, and project context. Templates may require additional fields.
3. Assignee receives notification and can begin work.
4. Assignee updates task status, checklist items, comments, evidence, and linked-record context according to permission.
5. If work cannot continue, assignee marks task Blocked and provides reason, blocker owner when known, severity, and next review date.
6. If review is required, task moves to For Review or Waiting for Approval. The reviewer is notified.
7. An authorized user marks task Completed. System records actor/time and retains completion evidence.
8. If a completed task must be reopened, an authorized user states reason; activity history preserves both events.

## Source-record links

A task may link to one or more ERP records. Link actions are read-only references from the project tracker. Opening a linked record is governed by the source module’s authorization. No task status transition may post inventory, approve money, send a PO, receive stock, or mutate a linked record.

## Validation

- Blocked status requires blocker reason.
- Completed status requires completion action by an authorized contributor/owner, records timestamp, and is blocked until required checklist items are complete.
- Cancelled status requires reason by authorized role.
- Tasks cannot be moved to a status not enabled for the project template/configuration.
- Due date changes are logged; overdue tasks remain visibly overdue until resolved.
