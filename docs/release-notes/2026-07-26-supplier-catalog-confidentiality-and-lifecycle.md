# OGFI ERP Release Notes — Supplier Catalog confidentiality and lifecycle checkpoint

**Release date:** July 26, 2026

**Audience:** System Administrators and company administrators who manage Suppliers and Supplier Item links

## What changed

- Supplier payment terms and the latest catalog reference unit price, currency, and effective date now require the additional `Supplier confidential access` permission.
- Without that clearance, protected values are omitted and the workspace shows **Restricted**. Confidential inputs are unavailable, but an otherwise valid Supplier or Supplier Item link can still be created without confidential values.
- The confidential permission is not standalone authority. Existing Supplier workspace authority and selected-company scope remain required for every read or action.
- `CONFIGURED_ADMIN` does not receive this sensitive permission by default or recommendation.
- The Catalog now presents the same filtered, paged result set as a desktop table and responsive mobile cards. Filters, list pages, lookup pages, and selected-action context remain in the URL.
- Supplier creation and Supplier/link deactivation use focused task modes. Inactive records remain as read-only history.
- Supplier and link deactivation recheck the exact company-scoped record and active status. When concurrent attempts target the same record, only one succeeds and records the deactivation audit entry.
- Supplier deactivation now serializes with accreditation updates and new Supplier Item links, preventing a stale writer from restoring accreditation or adding a link after the Supplier becomes inactive.
- Create-link and link-deactivation tasks keep entered drafts on safe server rejection, show the error inside the open task, announce pending progress, prevent duplicate submission, and restore context focus after confirmed success. Success confirmation comes from the completed server action, not a URL parameter.
- Reference-price effective dates now reject malformed or impossible calendar dates.
- Ordinary drafts and selected Item/UOM context survive same-tab lookup navigation for the same user. Confidential price/date values are not stored in the browser and must be rechecked after changing lookup results.

## What you need to do

1. Review roles that genuinely need confidential Supplier commercial values through the normal controlled access process.
2. Do not grant `Supplier confidential access` merely because a user administers Suppliers or sees **Restricted**.
3. Users without the clearance can continue with ordinary Supplier or link data where the task is otherwise authorized; the confidential inputs are not available and no confidential value is required.
4. On a stale or already-completed deactivation, refresh the Supplier Catalog and review the retained status before retrying.
5. On mobile, use the Catalog cards; the current filtered page is the same as the desktop table.

## Important notes

- This checkpoint does not change Supplier eligibility, accreditation policy, Purchase Orders, receiving, inventory, payments, Finance, or approval rules.
- Supplier and Supplier Item link actions remain company-scoped and audited. Deactivation retains history and creates no inventory movement or direct financial posting.
- The permission addition does not identify or prescribe ordinary grant recipients. Only the existing superuser all-permission seed behavior can include it automatically.
- Supplier Master Data, the wider Master Data workspace, Workspace 3, and Phase I remain incomplete and **NO-GO** for production completion.
- Disposable-PostgreSQL permission/concurrency/query-plan evidence, authenticated responsive-browser evidence, hosted migration/recovery evidence, and UAT remain open. This note claims none of that external validation.

## Training impact

Administrator training must cover the difference between ordinary Supplier authority and confidential clearance, the **Restricted** state, least-privilege grant review, creating ordinary links without confidential values, responsive Catalog navigation, and refresh-review guidance after a stale or concurrent deactivation.

## Learn more

- [Managing Suppliers and Supplier Catalog Links](../knowledge-base/administration/managing-suppliers.md)

## Support

If the refreshed record does not explain an access or lifecycle message, report the selected company, Supplier code, Item and purchase UOM when applicable, action attempted, and time observed through the normal OGFI ERP support channel. Do not include confidential terms or prices in the support description unless the approved support channel is authorized for them.
