# How To Attach Supporting Documents Or Photo Evidence

**Audience / required role:** Requesters, receiving users, warehouse users, branch managers, approvers, and support administrators  
**Applies to:** Purchase requests, supplier communication, receiving discrepancies, transfers, wastage, stock adjustments, projects, and approval support  
**Related phase/module:** Phase I / Evidence, Audit, and Attachments  
**Last verified against:** implemented evidence-reference fields, discrepancy evidence controls, wastage/adjustment evidence references, and shared attachment metadata design

## Purpose

Use this article when a workflow asks for supporting evidence, supplier communication, discrepancy proof, or photo reference.

In the current operational workflows, many screens collect an evidence reference such as a file name, receipt number, photo reference, supplier email reference, or document ID. Full binary upload/download is part of the shared attachment service direction and is not the controlling evidence behavior on every Phase I operational screen yet.

## Where Evidence Appears Today

- Purchase Order cancellation after supplier issue may require supplier notice evidence or an explanation.
- Receiving discrepancies can require discrepancy reason and evidence reference.
- Transfer receipt lines with rejected, damaged, or short/discrepant quantity require evidence reference.
- Wastage reports can require evidence reference based on policy flags.
- Stock Adjustments collect evidence reference where policy requires it.
- Project tracker attachments use authorized metadata links; source records remain protected by their own permissions.

## How To Enter Evidence References

1. Open the source record or workflow form.
2. Find the evidence, supplier notice, discrepancy evidence, or supporting reference field.
3. Enter a clear reference that another authorized user can locate later.
4. Use a consistent naming convention when referencing files stored outside the ERP, such as date, location, document type, and record number.
5. Save, submit, post, or request approval through the normal workflow.

## Good Evidence Reference Examples

- `2026-06-30-BGC-DR-4481-photo-01`
- `Supplier email from acct@example.com / 2026-06-30 / PO-1024`
- `Receiving photo set RR-2026-004 / freezer damage`
- `Transfer receipt photo TRF-2026-011-short-2kg`
- `Wastage photo WST-2026-008-expired-lot-A17`

## Important Controls And Warnings

- Do not store confidential supplier, finance, or employee documents in comments.
- Do not paste private file links into broad comments unless every viewer is authorized.
- Evidence references do not replace required approval, posting, receiving, reversal, or audit actions.
- Do not use project tasks to expose protected PO, receiving, inventory, approval, or finance attachments to users who lack source-record access.
- Keep original evidence in the approved storage location until the shared attachment service is fully released for that workflow.

## What To Check

- The evidence reference is specific enough for an authorized reviewer to locate.
- The related record shows the correct location, item, quantity, reason, and status.
- Required evidence fields are completed before submission or posting.
- Audit history shows the action that used the evidence reference.

## Related Articles

- Receiving a partial, short, damaged, or rejected delivery
- Receiving a warehouse transfer
- Logging wastage
- Understanding Stock Adjustments
- Why can't I see my branch, warehouse, or request?
