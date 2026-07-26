# Training Module — Phase I Administrator Setup Guide

**Audience:** System administrators and authorized implementation leads  
**Duration:** 60-90 minutes  
**Prerequisites:** Core administration permission, user/role/scope setup access, approval-rule visibility, release-readiness access, master-data access, reports, and audit export access as assigned  
**Related knowledge-base articles:** Signing in and selecting your location; Managing user access and controlled scopes; Managing privileged MFA evidence; Managing Evidence Retention And Placing A Legal Hold; Session invalidation and reauthentication; Managing break-glass access; Managing Release Readiness Gates; Why can't I see my branch, warehouse, or request?; Why can't I approve this request?; Uploading supporting documents or photo evidence; How to export a report

## Learning objectives

By the end of this module, participants can:

- Verify users, roles, permissions, and scope assignments.
- Confirm branch and warehouse visibility without over-granting access.
- Check approval assignment and self-approval blockers.
- Review audit events and export permitted audit data.
- Support evidence-reference practices without bypassing source-record controls.
- Distinguish confidential evidence-register view access from privileged legal-hold placement.
- Distinguish Supplier workspace authority from the additional `Supplier confidential access` clearance.
- Review release-readiness gates, security counters, and external-security proof references without treating the ERP page as release approval.

## Demonstration flow

1. Sign in as an administrator.
2. Open administration views for companies, roles, permissions, approval rules, and audit events.
   In Role Detail, use the permission search and Sensitive / Overrides / Recommended Drift filters; explain that paging does not remove enabled permissions outside the visible page when a controlled save is submitted.
3. Confirm a user's active role assignment and active location scope.
4. Explain why role controls capability and scope controls location visibility.
5. Review an approval rule and identify assigned user or role steps.
6. Open audit events and filter by action, entity, actor, request ID, or date range.
7. Open **Admin > MFA Enrollment** and explain that ERP-side MFA evidence does not replace external provider MFA.
8. Open **Admin > Session Invalidation** and identify records still pending external provider completion.
9. Open **Admin > Break-Glass Access** and explain the bounded queue filters, selected-record action sheet, request, separate approval, expiry, revocation, and post-review controls.
10. Open **Admin > Session Invalidation** and demonstrate status/search/UTC date filters, tenant-wide versus selected-company labels, and completion only from a selected pending record with separate provider evidence.
11. Open **Admin > MFA Enrollment** and demonstrate effective-population search/status filters, exact company totals, bounded target options, and selected-record Verify/Revoke actions. Reiterate that the register does not replace runtime MFA or external-provider enforcement.
10. Open **Admin > Admin Settings**, use category/search/pagination to find a policy, and review recommended versus overridden DEC-0036 defaults.
11. In **Purchasing controls**, explain the recommended approval bands: standard approval from PHP 10,000, high-value review from PHP 50,000, senior/executive review from PHP 200,000, emergency cap PHP 5,000, and 3 quotes from PHP 50,000 estimated request value when quotation comparison is required.
12. In **Security and continuity**, explain the readable retention and backup/restore summaries, then show that raw JSON remains editable only through a reasoned audited override.
13. In **Reporting trust gates**, explain that exports carry scope and trust-gate metadata and that changing policy values does not grant report access.
14. Open **Admin > Release Readiness** and review UAT, deployment, enablement, security, and GO / NO-GO tabs.
15. In the security tab, identify the live counters for MFA gaps, pending provider invalidation, break-glass review, and pending controlled access.
16. Explain the final external-security proof targets required before GO / NO-GO:
    - `external-security/mfa-provider-enrollment-and-runtime-proof.*`
    - `external-security/idp-session-invalidation-proof.*`
    - `external-security/vault-or-artifact-storage-index.*`
    - `external-security/break-glass-review-and-revocation-proof.*`
17. Export permitted audit events and the readiness register as CSV. Confirm the CSV metadata includes report ID, selected scope, trust-gate mode, and `DEC-0036`.
18. Open **Admin > Evidence Retention**, confirm the company-scoped metadata-only boundary, and compare view-only access with the separately authorized `Place Legal Hold` action.
19. Explain the current privileged-MFA requirement and the preservation-only boundary: no hold release or physical purge is available.

## Practice exercise

Troubleshoot a user who cannot see a warehouse and cannot approve a Purchase Request. Identify whether the issue is role permission, scope assignment, approval-step assignment, source-record status, or self-approval.

Then review a release-readiness security tab with one unresolved item. Decide whether the correct next step is to record ERP evidence, complete an external provider action, collect an external-security proof reference, or keep the gate blocked.

On the Core Administration home, use the URL-backed workspace tabs to open only
the register you need. Inactive sections are not loaded in the current view;
switch tabs when you need Users, Roles, Organization, Approval Rules, or Audit.

In Item Master, use the URL-backed Items, Categories, UOMs, and Conversions
tabs. The active register is the only register loaded, and its selected-record
controls remain scoped to the selected company. Do not interpret an inactive
tab's absent count as zero data.

In the Items tab, open `Create Item`. Demonstrate that Category, Base UOM,
Purchase UOM, and Issue UOM have independent search and page controls. Select an
active Category and required Base UOM; leave Purchase or Issue UOM at the explicit
`None` choice when no separate unit applies. Show the lookup retry and no-match
recovery guidance, then explain that a stale parent must be re-selected after the
catalog refresh. Confirm that a rejected save retains the draft and that a
successful save names the new Item while posting no stock movement. The current
build requires Core Administrator access plus selected-company `MANAGE`; broader
role-based Item Master access remains an unresolved policy gate.

Next, choose `Open item details` for an Active Item. Verify the company, Item,
status, current Category and UOMs, item type, and operational-control summary.
Correct only the Item name, enter a reason, and save. Explain that Category, item
type, all UOMs, and inventory/expiry/lot/receiving-inspection controls are
read-only and are rejected server-side until the governed owner-approval and
impact-review workflow exists. Open the authoritative Item-filtered Admin Audit
history in its new tab, then return to the preserved register context. Demonstrate
the stale-change guidance: return to the refreshed register, reopen the Item, and
review current details before deciding whether to retry.

Open an inactive or archived Item and confirm that it is read-only. On an Active
Item, review the `Deactivation unavailable` explanation and disabled action.
Explain that no request was recorded: Warehouse/Purchasing review, on-hand stock
and open procurement/inventory transaction checks, and a replacement plan where
required must be supported before Item deactivation can be released.

In **Suppliers**, explain that the current workspace still requires Core
Administrator authority and selected-company `MANAGE` scope. Demonstrate the
additional `Supplier confidential access` permission separately: it permits
payment terms and latest reference-price details only after the ordinary Supplier
and company gates pass. It is sensitive and is neither a default nor recommended
grant for `CONFIGURED_ADMIN`. Never grant it merely to clear a **Restricted**
label.

Compare the same Supplier Catalog with and without confidential clearance. The
uncleared view must show **Restricted** for payment terms and latest reference unit
price, currency, and effective date, and must not expose the confidential inputs.
Show that the user can still create an otherwise valid Supplier or Supplier Item
link by leaving confidential values blank. Do not place confidential values in a
reason, contact, or other ordinary field.

Open the focused Supplier creation task, then a selected active Supplier's focused
link-creation task. In the link task, page and search the active Item and purchase-
UOM options, verify the exact selected Supplier/Item/UOM binding, and explain that
creating the link is audited master-data work with no approval, Purchase Order,
inventory movement, payment, or direct financial posting.

Demonstrate a safe rejected link action. Confirm that every entered field remains
in the open task, the error receives focus, and the user can correct and retry.
While a request is pending, verify that close, cancel, and submit are unavailable
and progress is announced. On success, verify the trusted confirmation, automatic
close, and restored Catalog focus. Explain that a `success` URL value is never
proof that a mutation occurred.
Demonstrate that ordinary fields and selected Item/UOM values survive a lookup
search or page change. Explain that confidential price/date values are deliberately
not stored in the browser and must be rechecked after lookup navigation.

Review the same filtered Catalog on a desktop-sized screen and a narrow screen.
Confirm that the table and responsive cards represent the same server-paged result
set, that mobile does not require horizontal table scrolling, and that the URL
preserves the Supplier section, filters, pages, and selected task context.

Use the selected Supplier or item-link deactivation task. Verify the Supplier and,
for a link, the Item and purchase UOM before submitting the required reason. The
server preserves history and rechecks the exact tenant, company, Supplier/link
binding and active status. Explain concurrent handling in user terms: if another
administrator completes the same deactivation first, refresh and review the
retained inactive record; only the first valid action records the deactivation
audit entry.

Use the selected Supplier tabs to keep tasks separate: Overview for identity
and next action, Catalog for item links, Accreditation for supplier review, and
Audit to open the authoritative Admin Audit history. The tabs preserve supplier
filters and page context.

From a Supplier's Audit tab, confirm that Admin Audit shows the selected
Supplier Entity ID filter. Paging, export, and View Event must retain that
filter; never rely on a broad entity-type search for one supplier.

In User Access, use the controlled-request TaskSheet for Scope or Role request
creation and review. Verify target user, company, requester, status, evidence,
and reason before submitting; historical or self-requested records are not
reviewable.

In Organization Scope, use the nested Companies / Summary, Brands, Departments,
and Locations tabs. Locations exposes only its bounded active-brand catalog;
switch to Brands to review the full paginated brand register.

## Common errors and recovery

- Granting company-wide access to fix one missing record: assign the smallest correct scope.
- Confusing view permission with approval authority: approval assignment and scope still apply.
- Changing records directly to bypass workflow: use approved workflow actions only.
- Sharing exports broadly: exports inherit source-record sensitivity.
- Marking a security gate ready because the ERP counter looks acceptable but the external MFA, identity-provider, vault, or break-glass proof reference has not been collected.
- Treating GO / NO-GO reports as approval: they are evidence summaries and still need named Release Board decision records.
- Treating evidence-register access as file access or hold authority: the register is metadata-only, and hold placement needs a separate permission plus current privileged MFA assurance.
- Treating an optional Item UOM lookup as an automatic assignment: use the explicit `None` choice unless a separate Purchase or Issue UOM is required.
- Retrying an Item save with a stale Category or UOM: refresh and re-select the unresolved active parent before submitting again.
- Treating the disabled `Deactivate Item` control as a submitted request: no request is recorded; contact the company master-data owner and keep the Item Active.
- Treating `Supplier confidential access` as Supplier authority: it reveals protected commercial fields only after ordinary Supplier authority and selected-company scope pass.
- Granting Supplier confidential clearance to every configured administrator: it is sensitive and is not a default or recommended `CONFIGURED_ADMIN` permission.
- Entering confidential Supplier terms into an ordinary field when the intended input is unavailable: leave the confidential values blank and use the approved access process instead.
- Assuming a stale Supplier or link deactivation partly succeeded: refresh the preserved Catalog context and review the retained status; only one valid concurrent action records the deactivation audit event.
- Trying to change an Item Category, type, UOM, or operational control through the name-correction sheet: these material fields are read-only and server-rejected pending governed owner approval and impact review.
- Retrying a stale Item-name correction without review: return to the refreshed register, reopen the Item, and confirm the correction is still needed.
- Reading a CSV without checking the metadata rows: always confirm the report ID, selected scope, trust-gate mode, and source decision before using the data.
- Deactivating a reason code: open the selected row’s details, confirm the workflow and code, enter the reason, and submit from the action sheet. If another administrator already handled it, refresh and do not retry by creating a replacement code.
- Recovering an account: use Authentication → Recovery, page or filter the bounded queue, open one request, and have a different MFA-assured administrator approve or reject it. First-time identities belong in Activation; approved/rejected history is read-only.

## Completion check

- Participant can diagnose a visibility or approval issue using role, permission, scope, status, assignment, and audit evidence without weakening controls.
- Participant can explain DEC-0036 policy defaults, readable policy summaries, and reasoned overrides in Admin Settings.
- Participant can verify export metadata before sharing or relying on CSV output.
- Participant can create a governed Item with independent bounded selectors, explain optional `None`, recover from lookup or stale-parent errors, and confirm that creation does not post stock.
- Participant can open Item details, perform a reasoned Active Item-name correction, use the authoritative audit handoff, recover from a stale correction, and explain why material changes, inactive/archived edits, and deactivation are unavailable.
- Participant can explain Supplier confidential clearance as additional—not standalone—authority, demonstrate **Restricted** fields, and avoid recommending it to `CONFIGURED_ADMIN` by default.
- Participant can create an ordinary Supplier Item link without confidential values, use the responsive URL-preserved Catalog, verify exact selected-record context, and explain retained history and one-winner deactivation audit behavior.
- Participant can explain which release-readiness evidence belongs in the ERP register and which external-security proof references must remain in the approved provider or evidence repository.
