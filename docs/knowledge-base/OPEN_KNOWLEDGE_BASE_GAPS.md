# Knowledge Base — Open Gaps and Conflicts

Use this log only for user-facing documentation gaps, unclear behavior, or conflicts between approved specifications and implemented behavior.

## Entry format

| Date | Feature / article | Gap or conflict | Source checked | Impacted audience | Owner | Status |
|---|---|---|---|---|---|---|
| YYYY-MM-DD | Example: Receiving a supplier delivery | The approved UI spec does not state how rejected quantity affects the next action. | receiving-transfer-workflow.md; receiving-ui-spec.md | Storekeeper, Purchasing | Parent agent | Open |

## Open items

| 2026-06-29 | Understanding stock adjustments and why some require approval | Resolved by `warehouse-inventory/understanding-stock-adjustments.md` after `DEC-0023` implementation. Article now explains non-posting approval, separate authorized posting, reversal, and unreleased actions. | `DEC-0019-STOCK-ADJUSTMENT-FOUNDATION-BEFORE-POSTING.md`; `ERP_DATA_DICTIONARY.md`; `wastage-stock-adjustment-workflow.md`; `wastage-adjustments-ui-spec.md`; implemented Stock Adjustment service/tests | Branch managers, warehouse users, Operations, Finance | Dunong | Resolved |
