# Knowledge Base — Open Gaps and Conflicts

Use this log only for user-facing documentation gaps, unclear behavior, or conflicts between approved specifications and implemented behavior.

## Entry format

| Date | Feature / article | Gap or conflict | Source checked | Impacted audience | Owner | Status |
|---|---|---|---|---|---|---|
| YYYY-MM-DD | Example: Receiving a supplier delivery | The approved UI spec does not state how rejected quantity affects the next action. | receiving-transfer-workflow.md; receiving-ui-spec.md | Storekeeper, Purchasing | Parent agent | Open |

## Open items

| 2026-07-21 | Managing user access and controlled scopes | Resolved: Core Administration helper text now states that role administration requires `Administer tenant-wide roles` plus company Manage scope, and initial-role onboarding explains selected-location company eligibility. | `DEC-0043-TENANT-ROLE-ADMINISTRATION-BOUNDARY.md`; `ERP_ROLES_AND_PERMISSIONS.md`; `SECURITY_AND_AUDIT_MODEL.md`; implemented Core Admin service, pages, and authorization tests | Configured administrators, configured super users, support administrators | Parent agent / Frontend / QA | Resolved |
| 2026-06-29 | Understanding stock adjustments and why some require approval | Resolved by `warehouse-inventory/understanding-stock-adjustments.md` after `DEC-0023` implementation. Article now explains non-posting approval, separate authorized posting, reversal, and unreleased actions. | `DEC-0019-STOCK-ADJUSTMENT-FOUNDATION-BEFORE-POSTING.md`; `ERP_DATA_DICTIONARY.md`; `wastage-stock-adjustment-workflow.md`; `wastage-adjustments-ui-spec.md`; implemented Stock Adjustment service/tests | Branch managers, warehouse users, Operations, Finance | Dunong | Resolved |
