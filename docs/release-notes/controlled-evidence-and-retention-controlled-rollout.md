# OGFI ERP Release Notes — Controlled Evidence And Retention

**Release date:** Controlled rollout; production activation pending hosted verification and owner signoff
**Audience:** Finance and workforce users, project-requirement owners, authorized reviewers, ERP Administrators, legal/compliance users, auditors, and support staff
**Affected locations / roles:** Users with supported source-record authority; confidential-register viewers and legal-hold placers with active company scope

## What changed

- Supported records now provide an `Upload Evidence` dialog for private PDF, JPG/JPEG, PNG, WebP, and plain-text files up to 25 MB.
- Uploaded files remain unavailable during safety checks. The record shows user-facing states including `Safety check in progress`, `Available`, `File rejected`, `Processing failed`, `Upload expired`, `Not yet verified`, and `Archived`.
- Downloads are available only for clean, available files and are re-authorized against the linked source record at request time.
- Authorized users can archive an optional evidence link with a reason. Archiving retains the stored evidence for audit and does not delete file bytes.
- `Admin` → `Evidence Retention` adds a confidential, company-scoped, metadata-only preservation register.
- Separately authorized users with current privileged MFA assurance can place a preservation-only legal hold using an authority, case or instruction reference, and reason.

## What you need to do

- Upload only an allowed file type within the 25 MB limit and wait for `Available` before downloading it.
- Continue any source approval, posting, payment, close, inventory, or project action separately; an upload does not perform those actions.
- Contact an administrator for a storage-limit message, and contact support if scanning remains unchanged after refreshing later or repeated processing fails.
- Administrators must assign confidential register and hold-placement permissions only to approved users with active company scope.
- Legal-hold placers must refresh privileged MFA assurance when prompted.

## Important notes

- This is a controlled rollout, not production go-live approval. Hosted isolation, capacity, scanning, backup/restore, retention, monitoring, and release evidence must still pass the applicable activation gates.
- For the initial hosted deployment, evidence storage is operated privately on the same Hostinger VPS under service isolation. Users need no separate cloud-storage account.
- The retention workspace never exposes file bytes, storage paths, object keys, or checksums.
- Hold release and physical purge are not available in this release.
- Legal holds prevent normal archival or disposal. Evidence that was already physically purged cannot be placed on hold.
- All sensitive upload, scan, download, archive, hold, and denial actions preserve audit history.

## Learn more

- [Uploading Supporting Documents Or Photo Evidence](../knowledge-base/troubleshooting/how-to-attach-supporting-documents-or-photo-evidence.md)
- [Managing Evidence Retention And Placing A Legal Hold](../knowledge-base/administration/managing-evidence-retention-and-legal-holds.md)
- [Controlled Evidence And Retention Training](../training/controlled-evidence-and-retention-training.md)

## Support

Give the ERP support owner the source record number or evidence record ID, company/location, time of the issue, and visible status. Do not send confidential evidence through an unapproved support channel.
