# Organization Scope record selection

**Release date:** 2026-08-03

**Audience:** Authorized ERP administrators
**Affected locations / roles:** Core Administration users with `Administer tenant-wide roles` authority and active `MANAGE` scope for the selected company

## What changed

- Companies, Brands, Departments, and Locations now use `Open … details` to select one record before its contextual actions are available.
- The selected-detail panel is read-only and provides `Edit …` and `View audit history`. Per-card edit actions have been removed.
- The selected record keeps the current register context in the address bar. Changing the Organization Scope tab, filters, or page clears the selection.

## What you need to do

Open the required record first, review its details, then select the contextual edit action when a permitted descriptive correction is needed.

## Important notes

- The server rechecks selected-company authorization for the detail and edit actions. An unavailable selection is shown safely without disclosing record details.
- Edit reasons and before/after values remain in Audit Trail. No approval, inventory, or financial effect is created.
- Protected ownership, codes, relationships, and Location type cannot be changed from this edit form.

## Learn more

- [Reviewing And Editing Organization Scope Records](../knowledge-base/administration/reviewing-and-editing-organization-scope-records.md)
- [Phase I Administrator Setup Guide](../training/phase-i-administrator-setup-guide.md)

## Support

Use the approved OGFI ERP support channel. Include the selected company, Organization Scope tab, action attempted, and the on-screen message. Do not include confidential record contents.
