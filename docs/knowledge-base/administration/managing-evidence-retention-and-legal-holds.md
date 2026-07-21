# Managing Evidence Retention And Placing A Legal Hold

**Audience / required role:** ERP Administrators or other explicitly configured users with `View evidence retention register`; placing a hold also requires `Place evidence legal holds` and current privileged MFA assurance
**Applies to:** Confidential evidence metadata for the company currently selected in the ERP
**Related phase/module:** Administration / Evidence Governance
**Last verified against:** implemented `/admin/evidence-retention` page, permission catalog, company-scope checks, legal-hold service, privileged-MFA guard, and audit events (2026-07-21)

## Purpose

Review the company evidence preservation register and, when separately authorized, place a preservation-only legal hold. This workspace is metadata-only: it does not display or download file bytes.

## Before you begin

- Select the company whose evidence you are authorized to review.
- You need the sensitive `View evidence retention register` permission and an active company scope assignment.
- To place a hold, you also need `Place evidence legal holds`, current privileged MFA assurance, and a valid legal, compliance, or authorized-office instruction.
- Have the authority name, case or instruction reference, and preservation reason ready.

## Navigation path

`Admin` → `Evidence Retention`

Direct route: `/admin/evidence-retention`

## Steps

1. Open `Admin` → `Evidence Retention`. The navigation item is marked `Confidential`.
2. Confirm the heading `Company-scoped evidence preservation register` and verify that you are working in the correct company.
3. Review the availability, upload, scan, and physical-state badges; file type, size, and date; source lineage; retention class; and retain-until date.
4. Select `Show legal holds only` when you need the held-record view. Use `Previous` and `Next` to move through pages.
5. If the record is not already held or purged and you have placement authority, select `Place Legal Hold`.
6. Enter `Authority`, `Case or instruction reference`, and `Preservation reason`.
7. If your assurance is not current, select `Refresh MFA assurance`, complete the security check, and return to this workspace.
8. Select `Confirm Legal Hold`.

## Expected result

The page shows `Legal hold placed`, the record displays `LEGAL HOLD`, and the preservation action is recorded in audit history. The hold prevents normal archival or disposal. It does not change the linked source record, approval status, inventory, or financial balances.

## Important controls and warnings

- Register access is company-scoped and confidential. Ordinary source-record view access does not permit users to enumerate this register.
- Users with register view permission but without legal-hold placement permission see a view-only explanation.
- The register shows metadata and source lineage only. It never exposes file bytes, storage paths, object keys, or checksums.
- `QUARANTINED` means evidence is unavailable. `PENDING` or `UPLOADING` means processing is not complete; `CLEAN` with `AVAILABLE` means safety checks passed. `REJECTED`, `FAILED`, `TIMED OUT`, `MISSING`, or `PURGED` requires support or preservation review and never authorizes download.
- A hold cannot be placed after evidence bytes have already been purged.
- Hold release and physical purge are not available in this release. Do not promise either action or attempt to bypass the workspace.
- A legal hold is preservation-only and is not approval, payment authorization, inventory posting, or source-record status change.
- Placing a hold is concurrency-protected and audited with the actor, company, authority, case reference, reason, time, and preservation state.

## What happens next

The evidence remains preserved under the active legal hold. If the wrong record was selected, the instruction changed, or release/disposal is requested, stop and escalate to the authorized legal/compliance and ERP support owners; this workspace cannot release a hold or purge evidence.

## Related articles

- [Uploading Supporting Documents Or Photo Evidence](../troubleshooting/how-to-attach-supporting-documents-or-photo-evidence.md)
- [Managing Privileged MFA Evidence](./managing-privileged-mfa-evidence.md)
- [Session Invalidation And Reauthentication](./session-invalidation-and-reauthentication.md)
- [Managing User Access And Controlled Scopes](./managing-user-access-and-controlled-scopes.md)
