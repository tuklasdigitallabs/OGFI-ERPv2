# Phase IV — UAT Scenarios

**Status:** Ready for client UAT. Automated service, route, desktop, and mobile smoke coverage is complete; this document records the remaining business-operating evidence.

## Required UAT Coverage

- Happy-path transaction execution
- Rejection, return-for-revision, cancellation and reversal paths
- Role and location/project access boundaries
- Approval delegation, escalation and overdue behavior
- Attachment, photo and document evidence
- Audit log completeness
- Export and reporting reconciliation
- Desktop, tablet and mobile execution where relevant
- Duplicate-submission, network-retry and concurrent-update protection
- Published-playbook revision, copied requirement, and active-project immutability checks
- Project evidence/signoff ownership, independent review, return, and audit-history checks

## Required Sign-Off Roles

- Business owner for the phase
- Finance / Accounting when financial impact exists
- Operations or Branch representative when operational impact exists
- IT / Security owner
- Executive sponsor or delegated release authority

## Exit Rule

Critical defects must be resolved. High-severity defects require an approved workaround and explicit release acceptance. No unresolved defect may compromise data integrity, location/project scope, approvals, inventory, payment, legal documents, or employee privacy.

## Expansion-Specific Evidence To Capture

For each scenario, record the project code, actor, browser/device, timestamp, screen evidence, linked source-document reference where applicable, expected result, actual result, and any observed defect.

1. Create a project using a published Opening Playbook. Confirm that tasks, milestones, checklist lines, evidence requirements, signoff requirements, and reminder defaults are copied into the new project.
2. Confirm the creator cannot assign themselves as both project manager and sponsor. Assign distinct active project members and confirm both assignments appear in activity history.
3. Submit a document, photo, source-record link, and signoff requirement. Confirm only the named owner can submit and only the independent reviewer can accept or return the requirement with a reason.
4. Link a scoped PR, PO, receiving record, transfer, wastage report, or stock adjustment by document number. Confirm the source is visible only when the viewer has source access, and that submitting or accepting the project requirement does not change the source record.
5. Publish a playbook, create a draft revision, add a new checklist/evidence/signoff default, and publish the revision. Confirm projects created from the earlier version remain unchanged.
6. Create a high- or critical-severity punch item. Confirm an independent active project-member reviewer is required and that its creator or owner cannot close it.
