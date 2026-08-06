# Configuring Wastage Reason Codes

**Audience / required role:** Authorized Core Administrator with selected-company `Manage` scope
**Applies to:** The selected company; codes do not apply across companies
**Related phase/module:** Phase I / Core Administration / Wastage
**Last verified against:** implemented Reason Codes workspace and `DEC-0268`

## Purpose

Configure which active Wastage reason codes users may select. Each Wastage code
must have both an eligible wastage event/type and eligible inventory classes.

## Before you begin

- Select the company whose Wastage codes you are reviewing.
- Confirm the intended Wastage event/type and the inventory classes used by the
  affected items. Do not use the legacy applicability field for Wastage.
- Use the Operations or Inventory Control owner's approved mapping for that
  company. Evidence, approval, and threshold policies are separate controls.

## Navigation path

`Admin → Reason Codes → Wastage`

## Steps

1. Select the `Wastage` workflow tab and use the status or search filters to
   find the company-scoped code.
2. Open the code detail and confirm its status, Wastage event types, and
   Inventory classes.
3. To create a Wastage code, select `Create Reason Code`, choose `Wastage`, and
   enter the code and label.
4. Enter one or more comma-separated values in both `Wastage event types` and
   `Inventory classes`. Use only approved values for the selected company.
5. Set evidence required, sort order, and notes only where the approved company
   configuration requires them, then save.
6. To correct an existing Wastage code, open its detail, select `Edit Reason
   Code`, update both applicability lists as needed, enter the required reason
   for the change, and save.
7. If an old code has no safe mapping, leave it unavailable for new Wastage
   entry until its event/type and item-class mapping is reviewed and configured.
   Do not broaden its applicability to make it selectable.

## Expected result

The active company-scoped code is available in a Wastage Report only when it
matches the selected wastage type and every selected item's inventory class.
The Reason Code detail shows the configured values, and creation or changes are
recorded in the audit trail.

## Important controls and warnings

- Wastage eligibility is an intersection: both the event/type and inventory
  class must match. Empty, invalid, inactive, or ambiguous mappings are not
  available for new reports.
- The user-facing Wastage form filters options for convenience, but the server
  revalidates the active company code and both applicability dimensions. Do not
  rely on a previously open browser tab after changing configuration.
- Existing historical Wastage records retain their recorded reason and audit
  history. Updating a code does not reclassify history.
- Deactivation preserves historical references. It is not a deletion or a way
  to change posted Wastage records.

## What happens next

Warehouse and branch users see only the active reason codes configured for the
selected Wastage type and item classes. If a code is unavailable unexpectedly,
review the selected company, code status, event/type mapping, and inventory-class
mapping before changing it.

## Related articles

- Logging Wastage
- Managing User Access And Controlled Scopes
