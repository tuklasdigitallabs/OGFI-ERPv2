# Adding Comments, Checklists, And Evidence

**Audience / required role:** Project contributors, project managers, task owners, and authorized viewers  
**Applies to:** Task detail, checklist items, comments, and attachment metadata links  
**Related phase/module:** Phase 1.5 / Task Collaboration and Evidence  
**Last verified against:** implemented task checklist items, required checklist gate, comments, attachment metadata links, controlled project-requirement upload linkage, attachment archive reason, activity history, and project visibility controls (2026-07-21)

## Purpose

Use this article to add task progress notes, checklist items, completion support, and evidence metadata.

Comments and evidence help explain project work. They do not replace controlled ERP source records, approval remarks, receiving evidence, or inventory posting records.

## Before You Start

- You must have access to the project and task.
- You need task mutation access to add checklist items, comments, or attachment metadata.
- Attachment metadata must already exist and be valid for the same project context before it can be linked to a task.

## Navigation Path

`My Work`

## Steps

1. Open `My Work`.
2. Open the task detail.
3. In `Checklist`, mark items done or add a new item where permitted.
4. Mark required checklist items before completing the task.
5. In `Comments`, add operational project context.
6. In `Attachments`, choose the evidence purpose.
7. Enter the attachment metadata UUID and optional caption.
8. Archive an attachment link with a reason if it no longer applies.

## Expected Result

- Checklist updates are reflected in task completion counts.
- Required checklist items must be done before task completion.
- Comments show author and body on the task. Comments are add-only in this slice.
- Attachment metadata links show filename, purpose, type, size, caption, and creator where visible.
- Archive actions preserve reason and activity history.
- A project-level evidence requirement can hold evidence without an artificial task. A task-bound evidence requirement is linked only to its own task. The ERP enforces both contexts; uploading evidence does not submit or approve the requirement.

## Important Controls And Warnings

- Do not paste confidential PR, PO, receiving, inventory, approval, finance, or supplier details into project comments for users who lack source access.
- Project attachment metadata does not guarantee binary file upload/download is available for every operational workflow.
- Evidence metadata supports project coordination only.
- Use source-module evidence fields for controlled operational evidence.
- Do not describe this task screen as a free file-upload surface; it links existing attachment metadata.
- Where a project-requirement upload control is available, wait until the file is verified, scanned clean, durable, and marked `Available` before submitting the requirement. A quarantined, rejected, archived, or wrong-type file cannot satisfy it.

## Related Articles

- Viewing and Completing Your Assigned Tasks
- How To Attach Supporting Documents Or Photo Evidence
- Linking a Task to an ERP Record
