# Reviewing And Editing Organization Scope Records

**Audience / required role:** ERP administrators with Core Administration access, `Administer tenant-wide roles` authority, and active `MANAGE` scope for the selected company

**Applies to:** Companies, Brands, Departments, and Locations in the selected company

**Related phase/module:** Phase I Core Administration — Organization Scope
**Last verified against:** `DEC-0269`; implemented Core Administration Organization Scope page, selected-detail panel, and audited organization update routes

## Purpose

Use Organization Scope to review one Company, Brand, Department, or Location at a time, then make an approved descriptive correction from its selected details. Selecting a record keeps the current authorized register context available while you review it.

## Before you begin

- Confirm that the correct company is selected. Brands, Departments, and Locations are limited to that selected company; this workspace is not a tenant-wide company directory.
- You need the Core Administration and selected-company authority shown above. A copied or saved link does not grant access.
- Know the reason for the correction. Every available edit requires a reason of at least five characters.
- This is a descriptive-edit workflow only. It does not change user scope assignments, approvals, inventory, financial records, or a record's lifecycle status.

## Navigation path

`Admin → Core Administration → Organization Scope → Companies / Summary, Brands, Departments, or Locations`

## Steps

1. Select the Organization Scope tab and open the register you need.
2. For Brands, Departments, or Locations, use the available filters and page controls to find the record. Filters and paging remain within the selected company.
3. Select `Open company details`, `Open brand details`, `Open department details`, or `Open location details` on the required record.
4. Review the read-only selected-detail panel. Confirm the name, code, company, status, and any displayed related context before making a correction.
5. To review recorded changes, select `View audit history`. The Audit Trail opens with the selected record filter applied.
6. To change an available descriptive field, select `Edit Company`, `Edit Brand`, `Edit Department`, or `Edit Location` from the selected-detail panel.
7. Update only the fields shown in the short form, enter the required reason, then select `Save changes`.
8. Review the confirmation and the refreshed selected details. If the save is rejected, correct the displayed issue and retry; the form stays open with the entered values available.

[Screenshot placeholder: Core Administration Organization Scope selected-detail panel with the Edit and View audit history actions.]

## Expected result

The selected record remains read-only until you open its contextual edit form. A successful edit refreshes the record and register context, records the reason and before/after values in Audit Trail, and does not create an approval, inventory movement, or financial posting.

## Important controls and warnings

- Changing the Organization Scope sub-tab, filters, or page clears the selected record. Open the record again in the new register context.
- If a selected record is malformed, unavailable, outside the selected company, deleted, or no longer authorized, the workspace shows `Selected record unavailable` without revealing why. Select `Close selection`, confirm the company and filters, and request the correct authority if needed.
- Codes, tenant/company ownership, and organizational relationships are protected. Company edit also keeps its code and tenant/company relationships immutable; Brand and Department edit keeps company and code immutable; Location edit keeps code, company, brand, and location type immutable.
- Selecting a record does not create an audit event. A saved edit is auditable and retains its required reason and before/after values.
- Use User Access—not Organization Scope—to grant, revoke, or review a user's company or location scope.

## What happens next

Continue in the selected register, or use the filtered Audit Trail to verify the recorded correction. If the needed change is to a protected field, lifecycle state, user assignment, approval policy, inventory, or financial record, do not use this form; follow the owning controlled workflow.

## Related articles

- [Managing User Access And Controlled Scopes](./managing-user-access-and-controlled-scopes.md)
- [Reviewing User Access Audit](./reviewing-user-access-audit.md)
- [Why can't I see my branch, warehouse, or request?](../troubleshooting/why-cant-i-see-my-branch-warehouse-or-request.md)
