# One Gourmet / Anything Karubi — SM North EDSA UAT Brief

**Status:** Scope preparation; human tests not started. No candidate admission or operational posting authorization.

## Confirmed by the user

- Company: One Gourmet.
- Brand/business named by user: Anything Karubi. Exact ERP brand and item records still need matching; no individual SKU has been selected.
- Destination branch: SM North EDSA.
- Source warehouse selected by the user: One Gourmet Main Warehouse (`OGF-MAIN-WH`). Setup configuration identifies its inventory storage as One Gourmet Main Warehouse Cold and Dry Storage (`OGF-MAIN-WH-STOCK`); live candidate record matching remains pending.
- Branch staff request inventory; the manager approves according to the configured route.
- Purchasing physically receives supplier deliveries at the warehouse, then inventory is transferred to the requesting branch.
- Inventory is physically counted at both warehouse and branch.
- Availability: as soon as possible; no fixed test appointment yet.

## Preparation still needed

| Input | Status |
|---|---|
| Exact warehouse record and linked company/location | Main Warehouse selected (`OGF-MAIN-WH`); verify the company/location and inventory-storage records in the test candidate before execution |
| Named branch requester and manager approver | Role descriptions supplied; names/account mapping pending |
| Named Purchasing warehouse receiver and authorized transfer dispatcher | Purchasing receipt responsibility confirmed; dispatcher/account mapping pending |
| Named person confirming physical receipt at SM North EDSA | Pending; supplier receiving at the warehouse does not identify the branch recipient |
| Warehouse and branch counters; independent discrepancy reviewer | Both count sites confirmed; names and independent review assignment pending |
| Coordinator and test session | ASAP requested; coordinator pending |
| Exact SKU, UOM, lot/expiry requirements, and synthetic test quantities | Pending master-data selection; do not assume all Anything Karubi items are in scope |
| Candidate identity, URL, named credentials/MFA, live permissions/scopes and approval routes | Must be verified before human execution; no credentials belong in this document |

These are test logistics, not new role grants or approval policy. A person may hold multiple operational roles; prohibited self-approval and required independent review must remain enforced.

## First connected test journey

Execute only after the exact candidate and this bounded scope are admitted. Use controlled synthetic documents and stock; retain the existing operational source of truth.

1. Record starting warehouse and branch quantities for the selected item and lot. Check physical observations separately from ledger/cache agreement.
2. At the warehouse, Purchasing receives against an approved PO. Verify delivered quantities are fully classified, only accepted stock posts, and partial receipts preserve outstanding PO quantities.
3. Branch staff request stock. Verify warehouse availability is checked and available stock follows the Transfer Request route. Verify configured manager approval and requester self-approval denial.
4. The authorized warehouse dispatcher dispatches the approved quantity and draft-selected lot/expiry. Verify the warehouse movement, in-transit state and retry protection.
5. The named branch recipient physically verifies delivery and confirms receipt at SM North EDSA. Verify the destination movement, retained lot identity and retry protection.
6. Conduct blind counts at both locations using the assigned accounts. Attempt expected-quantity access through balances, adjustments, ledger, links and exports; verify confidentiality. Have the eligible independent reviewer assess discrepancies.
7. Trace PO receipt, transfer, physical observations and inventory movements together. Do not treat a matching ledger/cache as proof that physical stock is correct.

Run shortage/discrepancy, missing-evidence, duplicate-action and combined-role negative cases from the [adversarial supplement](INVENTORY_CONTROL_ADVERSARIAL_UAT_2026-09-07.md). Disabled recount, variance-posting or settlement actions remain **Blocked**, not Passed. Unknown-value classification and qualified evidence remain unresolved admission dependencies for affected loss cases.

## Execution and evidence boundary

The [audit verification register](INVENTORY_CONTROL_PRE_UAT_AUDIT_2026-09-07.md) records automated engineering tests, not execution by these users at these locations. Verify UTC database sessions and exact candidate admission; do not rely on historical population counts or an old baseline. Capture actor, source IDs, expected/actual quantities, approvals, movement IDs, screenshots, reviewer and result using the [existing evidence workbook](../../training/templates/phase-i-uat-evidence-sheet.xlsx).

Use the [local verification runbook](../../training/phase-i-local-end-to-end-uat-runbook.md) for environment constraints. This brief does not certify an existing URL, create accounts, schedule a session, alter live stock, or waive readiness gates.
