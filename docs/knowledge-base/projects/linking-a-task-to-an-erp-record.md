# Linking A Task To An ERP Record

**Audience / required role:** Project contributors, project managers, and authorized source-record users  
**Applies to:** Project task links to ERP source records  
**Related phase/module:** Phase 1.5 / Source-Record Links  
**Last verified against:** implemented project record links, source-summary adapters, redacted linked-record indicators, link archive reason, and source authorization checks

## Purpose

Use this article to link a project task to an ERP source record such as a Purchase Request, Purchase Order, Goods Receipt, Transfer, Supplier, Inventory Movement, Inventory Balance, Approval, Wastage Report, or Stock Adjustment.

Links help the team follow related work. They do not copy or control the linked ERP record.

## Before You Start

- You must be able to mutate the task.
- You must be authorized to view the source record before creating the link.
- You need the source record UUID.
- Use the correct source record type.

## Navigation Path

`My Work`

## Steps

1. Open `My Work`.
2. Open the task detail.
3. In `ERP source links`, choose the source record type.
4. Enter the source record UUID.
5. Enter a display label.
6. Save the link.
7. Use `Open` only when the source summary provides an authorized link.
8. Remove an incorrect link by entering an archive reason.

## Expected Result

- Authorized users see a safe source summary with status, scope label, primary date, and link where available.
- Users without source-record permission see a restricted linked-record indicator.
- Removing a link archives the link with a reason.
- Source records are not changed by link creation, task completion, blocker changes, or link archive.
- Project link reads re-check source-record visibility at read time, so a user's view can change if their source-module access changes.

## Important Controls And Warnings

- Project links store source type and source ID only.
- Restricted summaries must not expose source record ID, status, amount, remarks, attachment details, or open link.
- Do not paste operational payloads into task comments to bypass source authorization.
- Completing a task never approves a PR/PO, receives stock, posts inventory, closes a PO, or changes an approval state.
- If you cannot link a source record, check your source-module permission and selected location scope.

## Related Articles

- Understanding Projects, Tasks, and Your Access
- Why Can't I See This Project or Linked Record?
- Viewing and Completing Your Assigned Tasks
