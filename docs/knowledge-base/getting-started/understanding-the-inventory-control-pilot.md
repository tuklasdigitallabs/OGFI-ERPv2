# Understanding The Inventory Control Pilot

**Who can do this:** Any signed-in user assigned to an approved company and location. The modules and records each user can open still depend on their existing role, permissions, scope, and workflow assignment.
**Applies to:** Inventory Control Pilot environments
**Related phase/module:** Phase I procurement, receiving, and inventory control

## Purpose

Use the pilot label and navigation markers to distinguish the connected inventory-control work being prepared for pilot use from workflows that remain outside the current pilot release scope.

The Inventory Control Pilot is bounded to approved locations, items, users, and workflows. Seeing the pilot label does not mean the pilot, all of Phase I, or the wider ERP is production-ready.

## Prerequisites

- Sign in with your own active account; do not share accounts.
- Confirm that the company, brand, and location shown in the header match the work you intend to review.
- Obtain the role, permission, scope, and workflow assignment required for the source record. Pilot participation does not provide this access automatically.

## Navigation Path

Sign in → check the `Inventory Control Pilot` header badge → review the left navigation

## Steps

1. Confirm the company, brand, and location badges in the page header.
2. Look for the `Inventory Control Pilot` badge. It identifies the active release profile only; it is not a release approval or permission.
3. Use the Procurement, Receiving, Inventory, approval, evidence, audit, and administration destinations assigned to your role for approved pilot work.
4. If a navigation section or destination shows `Deferred`, treat it as outside the current Inventory Control Pilot scope. Deferred areas can include Work Management, Restaurant Operations, Workforce, Marketing, Expansion, and Finance product workflows.
5. Do not assume that every user will see every deferred area. Existing role, permission, company, brand, and location checks continue to determine which navigation destinations appear and which records or actions can be opened.
6. If you already have authority to use a safe working action in a deferred module, follow its existing controls. The `Deferred` marker neither removes nor grants that authority.
7. If an action is disabled, read the displayed reason and follow the approved support or workflow path. Do not use a copied URL or another user's account to bypass the state.
8. Before treating pilot records as the operational stock record, confirm that the authorized release owner has issued a GO decision for the exact release candidate and pilot scope.

## Expected Result

- The header clearly identifies an Inventory Control Pilot environment.
- Authorized deferred sections and destinations remain visible with a `Deferred` marker.
- Existing permissions and scope continue to control navigation, direct-route access, records, actions, approvals, exports, and evidence.
- Users can distinguish pilot-scope work from deferred workflows without interpreting visibility as readiness.

## Controls And Warnings

- `Inventory Control Pilot` is a release-profile label, not a permission, approval, or production-readiness claim.
- `Deferred` means outside the current pilot release scope. It does not mean that records are empty, that a module is complete, or that an existing safe action is unauthorized.
- The pilot must begin with approved test-data or shadow UAT. It becomes the operational stock system of record only after the exact-candidate technical gates, recovery evidence, human UAT, and named GO approval pass.
- Use unique user accounts. Approval, receiving, dispatch, receipt, counting, correction, and posting actions remain attributable and audited.
- A stock variance is an investigation signal, not proof of theft or misconduct. Preserve the source records and follow the authorized investigation process.
- Inventory changes must come from controlled posted workflows and immutable ledger movements. Never attempt to correct stock through a direct balance edit.
- Deferred Finance product workflows do not remove any configured independent Accounting review required for material loss, wastage, or Stock Adjustments.

## What Happens Next

Continue only with the pilot workflows, locations, and items assigned to you. Report a missing label, unexpected destination, incorrect scope, enabled unsafe action, or inaccessible required pilot workflow to the system administrator and pilot release owner. Include the selected company and location, destination, action, and record reference without sharing confidential evidence.

## Related Articles

- [Signing In And Selecting Your Location](signing-in-and-selecting-your-location.md)
- [Understanding The Dashboard, My Tasks, And Notifications](understanding-the-dashboard-my-tasks-and-notifications.md)
- [Understanding Statuses, Audit History, And Attachments](understanding-statuses-audit-history-and-attachments.md)
- [Why Can't I See My Branch, Warehouse, Or Request?](../troubleshooting/why-cant-i-see-my-branch-warehouse-or-request.md)
- [Viewing Inventory Movement History](../warehouse-inventory/viewing-inventory-ledger.md)
