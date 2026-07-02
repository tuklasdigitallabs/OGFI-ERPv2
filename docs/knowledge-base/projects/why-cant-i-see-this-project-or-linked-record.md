# Why Can't I See This Project Or Linked Record?

**Audience / required role:** Project users, project managers, administrators, and support teams  
**Applies to:** Project visibility, restricted projects, tasks, linked ERP records, and project reports  
**Related phase/module:** Phase 1.5 / Project Authorization and Source-Record Links  
**Last verified against:** implemented project access, restricted membership, source-summary redaction, current-location source authorization, project exports, and direct-link denial behavior

## Purpose

Use this article when a project, task, linked ERP record, or project report row is missing or redacted.

Project access and source-record access are separate. You may be allowed to see a project task but not the linked Purchase Order, receiving record, inventory balance, approval, or wastage report.

## Common Reasons

- The project is restricted and you are not a member.
- The project is unrestricted, but you still do not have matching company, location, project, ownership, membership, or manage-level access.
- Your project role is viewer-only or does not allow mutation.
- Your company, brand, location, department, or project scope does not match.
- The project or task is archived or cancelled.
- The linked ERP record belongs to a source module/location you cannot access.
- Your selected ERP header location does not match the source record scope.
- The link was archived with a reason.
- Project exports are filtered by visibility and source-record authorization.
- The source record summary was rechecked and redacted because your source-module access changed.

## What To Check

1. Confirm you are signed in under the correct account.
2. Confirm the active location in the ERP header.
3. Open `Projects` and confirm the project is visible.
4. Ask a project manager to verify your project membership.
5. Ask an administrator to verify your source-module permission and scope.
6. If a linked record is redacted, open the source module directly only if you are authorized.

## Important Controls And Warnings

- Do not ask another user to export or screenshot restricted source records for you.
- Do not paste source-record payloads into project comments to bypass redaction.
- Direct URLs are still checked by service-layer authorization.
- Project membership never grants authority over linked operational records.
- A restricted linked-record indicator means the link exists, not that you have permission to open the source record.

## Related Articles

- Understanding Projects, Tasks, and Your Access
- Linking a Task to an ERP Record
- Why Can't I See My Branch, Warehouse, Or Request?
