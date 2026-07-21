# Uploading Supporting Documents Or Photo Evidence

**Audience / required role:** Users who can update the supported source record; project-requirement owners who meet the project access checks; authorized reviewers and support administrators
**Applies to:** The current company and the exact finance, workforce, or project-requirement record shown on screen
**Related phase/module:** Shared controlled evidence uploads
**Last verified against:** implemented `Upload Evidence` dialog, controlled-evidence list, upload authorization, scan lifecycle, download authorization, and archive controls (2026-07-21)

## Purpose

Upload a private supporting file to an authorized record and understand when it can be downloaded, archived, or used as evidence.

## Before you begin

- Open the correct source record in the correct company, brand, location, department, or project scope.
- You must have the current source-record authority required to add evidence. View access alone normally does not allow upload.
- Prepare a non-empty PDF, JPG/JPEG, PNG, WebP, or plain-text file no larger than 25 MB.
- Do not put confidential documents in comments or paste private links into broad discussions.

## Navigation path

`Supported source record` → `Controlled evidence` → `Upload Evidence`

## Steps

1. Open the record that the evidence supports.
2. In its controlled-evidence area, select `Upload Evidence`.
3. Choose the evidence file. On supported mobile devices, the chooser may also offer the camera.
4. Review any `required for` notice shown by the record, then add a clear `Caption` if helpful.
5. Select the upload action and leave the dialog open while the file is prepared and uploaded.
6. When `Upload received` appears, close the dialog if needed and refresh the record later to check the result.
7. Wait for `Available` before attempting a download. `Safety check in progress` means the file remains private and unavailable while scanning runs.

## Expected result

The file appears on the same source record. A clean file shows `Available` and a `Download` action. Uploading evidence does not approve, post, pay, close, or otherwise change the source record, inventory, or financial balances.

## Important controls and warnings

- Every upload starts unavailable. Only a clean safety result for the exact uploaded file makes it `Available`.
- `File rejected` means the file cannot be downloaded; upload a different file or contact support. `Processing failed` means retry or contact support. `Upload expired` means upload the file again. `Not yet verified` remains unavailable.
- Download access is checked again against the live source-record permission and company, brand, location, department, project-membership, and restricted-project rules. A copied link does not grant access.
- `Archive Evidence Link` removes the active link from the source record; it does not delete the stored file. A reason is required and the action is audited.
- A link marked required for an action cannot be archived. Evidence under a legal hold cannot be archived.
- Upload, scan outcome, download, archive, and denied actions are recorded in the audit history. File bytes are not written into the audit log.
- Keep external evidence references accurate where a workflow still requests them separately.

## If the upload needs attention

1. For a type or size message, choose one of the listed file types and keep it at 25 MB or less.
2. For an interrupted upload, check your connection and retry. The selected file remains in the dialog when possible.
3. For an expired upload window, choose Retry or start the upload again.
4. For a storage-limit message, stop retrying and contact an administrator.
5. For a permission message, refresh the page and confirm your current company and source-record scope. Ask an administrator to review access if it still fails.
6. If `Safety check in progress` remains unchanged after refreshing later, or `Processing failed` continues after retry, give support the source record number, time of attempt, visible status, and your company/location. Do not send the confidential file through an unapproved support channel.

## What happens next

An authorized user can download the file only after it becomes `Available`. Reviewers continue the source workflow separately. Administrators with the dedicated confidential-register permission can review its retention metadata, but that workspace does not expose file bytes.

## Related articles

- [Managing Evidence Retention And Placing A Legal Hold](../administration/managing-evidence-retention-and-legal-holds.md)
- [Understanding Statuses, Audit History, And Attachments](../getting-started/understanding-statuses-audit-history-and-attachments.md)
- [Why Can't I See My Branch, Warehouse, Or Request?](./why-cant-i-see-my-branch-warehouse-or-request.md)
