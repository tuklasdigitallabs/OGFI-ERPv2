# OGFI ERP — Phase I Local End-to-End Functional Verification Runbook

**Audience:** UAT coordinator, system administrator, purchasing, warehouse, branch operations, inventory control, and assigned approvers  
**Environment:** Local Docker environment at `http://localhost:3001`  
**Scope:** Supplier and Item setup through purchasing, receiving, inventory, transfers, wastage, stock counts, stock adjustments, reporting, and audit verification  
**Status:** Local rehearsal only; not formal UAT, release evidence, or a production GO decision  

## Objective

Prove that the Phase I inventory-control chain preserves authorization, segregation of duties, evidence, audit history, and immutable inventory movements from purchasing through store operations.

The test must demonstrate that:

- Only assigned users can act within the selected Company and Location.
- A requester cannot approve their own controlled request.
- Drafting and approval do not change stock unless the workflow explicitly reaches its posting boundary.
- A posting action creates the intended inventory movement exactly once.
- Receiving discrepancies, transfer discrepancies, wastage, count variances, and adjustments retain their reasons and evidence.
- Stock Balances, Movement Ledger, physical count, and audit history can be reconciled.

## Preconditions

### Local environment

From Git Bash in the repository:

```bash
cd "$HOME/Documents/OGFI ERP - V2"
docker context use desktop-linux

grep -E '^(APP_ENV|APP_URL|AUTH_MODE)=' .env

POSTGRES_PORT=55433 WEB_PORT=3001 \
docker compose -p ogfi-clean --env-file .env up -d --no-build postgres web

curl http://localhost:3001/health
```

Confirm that `.env` reports `APP_URL=http://localhost:3001` before starting this stack. Do not print or overwrite unrelated secrets. The candidate image must already have passed the full local build gate before using `up --no-build`.

The health endpoint must return HTTP `200` with `"status":"ok"`. Use `http://localhost:3001` in the browser. Port `3000` shown by Next.js is the web container's internal port.

Monitor application errors in a separate terminal when testing:

```bash
docker logs -f ogfi-clean-web-1
```

Do not rebuild merely to restart the environment. Rebuild only after source changes and only after the required local build gate is clean.

### Approval Worklist admission boundary

The ordinary `http://localhost:3001` development stack intentionally keeps the Approval Inbox unavailable. Do not enable the bounded worklist by editing the ordinary `.env`, and never set `APPROVAL_ROUTING_V1_ENABLED=true` as a workaround.

The seven-family **Inventory Control UAT Approval Worklist** is admitted only by the reviewed, ephemeral hardened-UAT orchestrator. That lane uses an optimized immutable candidate, a genuine trusted local HTTPS edge at `https://127.0.0.1:3443`, Nginx → Caddy → application proxying, a private nonce-bound disposable PostgreSQL database, per-run secrets, secret scanning, and verified teardown. Its exact application identity keeps global routing false while setting `NODE_ENV=production`, `APP_ENV=uat`, `CI=true`, `AUTH_MODE=local`, `AUTH_HARDENED_UAT_RUNTIME_ENABLED=true`, and `BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED=true`.

The current repository location under `/mnt/c` cannot prove the required POSIX lifecycle controls. A local preflight must use a clean checkout stored in the WSL Linux filesystem, such as under `/home`, and still earns no hosted release or formal-UAT credit. Until the exact hosted `bounded-uat` lane passes, mark approval-dependent scenarios `Not Run — activation dependency`; do not seek a legacy queue or direct-link bypass.

### Test data and actors

Use unique references such as `UAT-YYYYMMDD-01` so every document, ledger movement, and audit event can be traced.

Prepare separate named users for these responsibilities:

- Requester
- Purchasing user
- Approver
- Receiving user
- Warehouse dispatcher
- Branch receiver
- Inventory reviewer or poster

Do not use one super-administrator for the entire transaction chain. The test must preserve segregation of duties and prove that self-approval is denied.

For an Opening Inventory pilot, configure five distinct eligible users:

- Opening preparer
- Opening submitter
- Operations reviewer
- Accounting reviewer
- Command requester

Privileged users must complete MFA when the application requests fresh assurance. Every actor must have the required permission plus explicit Company and Location scope.

### Evidence record

For every scenario, record:

| Field | Required evidence |
| --- | --- |
| Test reference | Unique UAT reference |
| Actor | Named user and responsibility |
| Scope | Company, Brand when applicable, and Location |
| Source record | Document number or public reference |
| Before state | Status and stock balance before action |
| Action | Exact action selected |
| After state | Status and stock balance after action |
| Audit evidence | Audit event or activity reference |
| Result | Pass, Fail, or Blocked with defect reference |

## Scenario 1 — Organization and access scope

1. Sign in as an authorized administrator and open **Administration → Organization Scope**.
2. Verify the selected Company, Brand, Department, warehouse, and branch records.
3. Select a record and confirm that its applicable detail or edit action becomes available.
4. Make a harmless UAT-labelled change where authorized, enter the required change reason, and save it.
5. Confirm that the modal closes, the result appears as a toast, and an audit entry retains the before and after values.
6. Confirm that deactivation or archival is offered instead of hard deletion where applicable.
7. Switch between an assigned warehouse and branch and confirm that the page updates without a blank screen.
8. Test an adjacent, unassigned scope using a suitably restricted user and confirm that the record or action is unavailable without disclosing protected details.

**Pass criteria:** Company and Location scope is enforced by the server, changes require reasons and audit history, and switching scope does not leave a blank or stale page.

## Scenario 2 — Supplier Register and catalog

1. Open **Suppliers**.
2. Click anywhere on one Supplier row or card. Confirm that it becomes selected and **Open supplier** becomes enabled.
3. Click the same record again and confirm that it is deselected.
4. Select a different Supplier and choose **Open supplier**.
5. Confirm that the selected Supplier—not the first Supplier in the register—opens in the focused overlay.
6. Review **Overview**, **Catalog**, **Accreditation & lifecycle**, and **Audit**.
7. In **Catalog**, search by Item, Supplier SKU, and Supplier item name. Test link-status and Item Category filters and page controls.
8. Create a test Supplier with a unique code such as `UAT-SUP-001`, the required identity fields, and a creation reason.
9. Link an active Item and valid purchase UOM to the Supplier. Add only confidential values that the current user is authorized to manage.
10. Close the focused task and confirm that the register retains its filters, page, and selection context as designed.
11. Deactivate only the UAT Supplier or UAT catalog link, provide a reason of at least five characters, and verify the audit result.

**Pass criteria:** Selection controls the opened Supplier, catalog search and pagination work, unauthorized confidential fields are not disclosed, and create/deactivate actions close with user-safe toast feedback.

## Scenario 3 — Items, categories, and UOMs

1. Open **Items** and search for a high-risk pilot Item.
2. Verify its Item code, name, Category, base UOM, purchase UOM, conversion, and lifecycle status.
3. Confirm that its Supplier relationship uses an active Supplier and a valid purchase UOM.
4. If authorized, create a uniquely coded UAT Item and required UOM conversion.
5. Attempt to reuse an existing Item or UOM code and confirm that duplicate-code validation rejects the change without creating another record.
6. Confirm that the valid Item can be selected in purchasing, receiving, transfers, counts, wastage, and adjustments where its scope and status allow it.

**Pass criteria:** The same controlled Item and UOM identity is used consistently throughout the transaction chain.

## Scenario 4 — Opening Inventory pilot baseline

Execute configuration and cohort preparation only when the release owner has explicitly authorized this local gated exercise. Do not request activation otherwise. This scenario is not required merely to exercise purchasing against existing seeded balances.

### Configure and seal the pilot revision

1. Open **Inventory → Opening Inventory → Setup Center** and confirm the selected Company.
2. Review the **Revision queue**, then select **Create configuration draft** and enter the draft purpose.
3. Under **Endpoints**, select the exact warehouse and branch inventory locations and assign only their explicit capabilities: **Transfer source**, **Transfer destination**, **Count location**, and/or **Opening-stock location**. Enter the endpoint change reason and save.
4. Under **Items**, select the exact high-risk pilot Items. Enter the catalog change reason and save.
5. Under **Named users**, assign five distinct eligible users for the Opening Inventory responsibilities. Enter the named-user change reason and save.
6. Under **Routes**, bind one eligible approval rule for each displayed family. For `PurchaseRequest`, use the standard non-emergency `DEFAULT` route resolved through `purchase_request_approval_rule_v1`. Enter the route-binding reason and save.
7. Under **Readiness**, select **Validate readiness** and confirm that exactly eight families are evaluated: `PurchaseRequest`, `QuotationRecommendation`, `PurchaseOrder`, `InventoryTransfer`, `StockCountAttemptReview`, `WastageReport`, `StockAdjustment`, and `OpeningInventoryCutover`.
8. Resolve every `Blocked` result in its authoritative source, then validate again. Do not treat `Ready at cutoff` as permanent authority.
9. Sign in as the separate authorized sealer with fresh MFA. Verify all memberships, routes, readiness snapshots, lineage, and activity.
10. Enter the seal reason and select **Seal immutable revision**.
11. Record the sealed revision number and immutable SHA-256 digest.
12. Confirm that the sealed revision cannot be edited or deleted. Create a successor draft for any correction.

### Create and process the cohort

1. Create and complete a reviewed `OPENING` stock-count attempt for each selected Location.
2. Open **Inventory → Opening Inventory** and select **Create opening cohort**.
3. Select the eligible sealed revision and enter the effective cutover time. Confirm that the new cohort is `DRAFT` and has no stock effect.
4. Open **Prepare Opening Inventory**, select the reviewed `OPENING` attempt, add controlled cohort evidence, and enter a valuation unit cost for every positive-count line.
5. Use **Show incomplete lines** and resolve every missing valuation. Retain zero-count lines as coverage evidence.
6. Select **Prepare immutable location batch** and verify the resulting evidence, valuation, and cutover digests.
7. After every required location batch is ready, an authorized preparer selects **Seal prepared cohort**.
8. The assigned submitter selects **Submit for Operations & Accounting**. Confirm the location batch becomes `PENDING APPROVAL` and inventory remains unchanged.
9. Complete Operations review first and Accounting review second using independent eligible users.
10. Only when separately authorized for the gated local exercise, request cohort Freeze, Location Stage, and cohort Activate from the displayed current action in that order. A request creates an immutable command and does not itself perform the operation.
11. Review **Activity** for the command lifecycle. Do not submit a duplicate request while a matching command is pending, claimed, or retrying.
12. Verify the Movement Ledger only after successful controlled activation. Freeze, Stage, drafting, sealing, and approval must not post stock.

**Pass criteria:** The cohort is pinned to one immutable sealed revision and digest; all approvals are independent; only controlled activation can create the eligible opening movements exactly once.

## Scenario 5 — Purchase Request and approval

1. Sign in as the Requester and select the intended branch Location.
2. Open **Purchase Requests** and create a draft request.
3. Enter the required date, urgency, business justification, Item, quantity, valid UOM, estimated unit cost when available, and line purpose.
4. For emergency urgency, enter the emergency reason and evidence required by policy.
5. Open the draft detail, verify the requester and scope, and select **Submit for Approval**.
6. Record the Purchase Request number and confirm that submission does not change inventory.
7. Attempt self-approval with the Requester and confirm it is denied.
8. Sign in as the assigned Approver and open **Approvals**. Use the bounded worklist only when its hardened local configuration is enabled. If the Approval Inbox is unavailable, record `Not Run — activation dependency`; do not seek a bypass.
9. Find the request in the **Inventory Control UAT Approval Worklist** or current Approval Inbox, open it, and verify requester, Location, date, quantity, UOM, justification, evidence, policy flags, and current step.
10. Approve the request. Separately test return or rejection on another UAT request and provide the required remarks.

**Pass criteria:** Only the current eligible approver can decide the request, self-approval is denied, status history is retained, and no stock movement exists.

## Scenario 6 — Supplier quotes and quotation comparison

1. Sign in as Purchasing and open the approved Purchase Request.
2. Record a Supplier quotation with its reference, dates, commercial fields, quoted quantities, UOMs, prices, availability, lead time, notes, and reason.
3. Record at least two quotations when comparison is required by policy.
4. Complete the quotation comparison or recommendation using the available scoped controls.
5. Verify that comparable totals and recommendation evidence are retained.
6. Submit the recommendation through approval when its configured route requires it.

**Pass criteria:** Quotations remain linked to the correct Supplier and Purchase Request, confidential commercial values are scope-protected, and recommendation approval does not change inventory.

## Scenario 7 — Purchase Order

1. Create a draft Purchase Order from the approved sourcing result.
2. Verify Supplier, Company, receiving Location, Item, UOM, quantity, price, totals, and source Purchase Request.
3. Submit the Purchase Order and complete any required approval with a separate user.
4. Issue the Purchase Order and record the document number.
5. Confirm that draft, approval, and issue do not create an inventory movement.
6. Attempt an invalid or stale transition and confirm it is rejected without changing the document.

**Pass criteria:** The issued order preserves source lineage and approval history and has no stock effect before receipt posting.

## Scenario 8 — Purchase Order receiving

1. Sign in as the assigned Receiver and open **Receiving**.
2. Select **Create Draft Receipt** and choose the issued Purchase Order.
3. Enter the Supplier delivery reference.
4. Exercise one coherent partial-receipt case: either ordered `10`, delivered `7`, accepted `7`, and short `3`; or delivered `10`, accepted `7`, with rejected or damaged quantity `3`. Follow the form's quantity validation.
5. Add lot or expiry information when required.
6. Add the required discrepancy reason and evidence reference.
7. Save the draft and confirm that it does not affect inventory.
8. Open the draft and select **Post Receipt** once.
9. Confirm that accepted quantity increases usable stock, rejected or damaged quantity does not, and outstanding quantity keeps the Purchase Order open.
10. Refresh or retry the posting boundary and confirm that stock is not duplicated.

**Pass criteria:** One receipt posting produces one accepted-quantity movement, discrepancy evidence is retained, and the Purchase Order status reflects its outstanding quantity.

## Scenario 9 — Stock Balance, Movement Ledger, and variance

1. Open **Inventory → Stock Balances** and select the same posting Location.
2. Search for the received Item and record its on-hand quantity, UOM, lot, storage Location, and balance version.
3. Open **Movement Ledger** and search by Item, Purchase Order, or receipt reference.
4. Confirm one posted movement for the accepted quantity with the correct actor, source document, lot, expiry, reason, and timestamp.
5. Open **Ledger Variance** and compare the cached balance with the ledger-derived total.
6. Open the ledger trace for any variance and export the scoped diagnostic evidence when needed.

**Pass criteria:** Cached and ledger-derived quantities reconcile, or a variance is visibly blocked and traceable rather than silently hidden.

## Scenario 10 — Warehouse-to-branch transfer

1. Open **Inventory → Transfers**.
2. Create a Transfer Request from the Main Warehouse to the branch for less than the available warehouse quantity.
3. Verify source, destination, Item, quantity, transfer type, purpose, required-by date, and handling note.
4. Submit and complete any required approval with an independent eligible approver.
5. Use three independent actors after request creation: approver, source dispatcher, and destination receiver. The approver may not dispatch or receive, and the dispatcher may not receive.
6. Sign in as the authorized warehouse dispatcher, open the request, and select **Dispatch Stock** once.
7. Verify the source-side effect and immutable dispatch movement.
8. Sign in as the destination receiver, open the dispatched transfer, and record accepted, rejected, damaged, or short quantities.
9. Enter the discrepancy reason and evidence for any non-accepted quantity, then select **Post Receipt**.
10. Confirm that destination stock increases only by the accepted quantity and that retrying cannot duplicate inventory.
11. Confirm that a user outside the source scope cannot dispatch and a user outside the destination scope cannot receive.

**Pass criteria:** Dispatch and receipt form one traceable transfer without creating or losing duplicate stock.

## Scenario 11 — Wastage

1. Select the branch Location and open **Wastage**.
2. Select the inventory Location, Item, wasted quantity, estimated unit cost, and wastage type.
3. Confirm that compatible F&B reason codes appear, then select the appropriate reason.
4. Enter the evidence reference and any applicable lot, expiry, or notes.
5. Create the draft and submit it for approval.
6. Complete approval with an independent eligible user and confirm that approval alone does not reduce stock.
7. Use the separate **Post Wastage** action once.
8. Confirm exactly one `WASTAGE_OUT` movement and the corresponding balance reduction.
9. Test missing reason, missing required evidence, incompatible reason/type, insufficient stock, and repeated posting. Each must fail without changing inventory.

**Pass criteria:** Wastage is reasoned, evidenced, independently approved when required, and posted exactly once at the explicit posting boundary.

## Scenario 12 — Stock count and variance review

1. Open **Inventory → Stock Counts**.
2. Schedule a count for the selected Location, choose the count type and date, and enable blind count when required.
3. Open the count and select **Start Count**.
4. Enter quantities for every snapshot line and deliberately create one controlled variance.
5. Save the entries and select **Submit for Review**.
6. Review the attempt with an independent eligible user and record review notes.
7. Confirm that the variance, source snapshot, count attempt, evidence, actor, and history remain visible.
8. Confirm that review alone does not silently overwrite the stock balance.
9. Stop after preserving and reviewing the variance. Do not create a corrective adjustment from this count; count-variance correction and recount recovery are not currently released.

**Pass criteria:** The immutable count attempt preserves the variance and review history; stock changes only through the approved posting path.

## Scenario 13 — Stock adjustment and reversal

1. Open **Inventory → Adjustments**.
2. Select the Location, Item, and adjustment type `INCREASE` or `DECREASE`.
3. Enter quantity, reason code, reason description, and evidence reference.
4. Create and submit the adjustment.
5. Complete approval with another eligible user and confirm that approval alone has no stock effect.
6. An authorized inventory poster selects **Post Adjustment** once.
7. Verify exactly one movement with the correct signed quantity and source reference.
8. If reversal is available for the test record, enter a reversal reason and verify that reversal creates an auditable counter-movement rather than deleting history.

**Pass criteria:** The adjustment and any reversal preserve authorization, evidence, audit history, and exactly-once ledger behavior.

## Scenario 14 — Final theft-control reconciliation

For one high-risk Item and one Location, calculate:

```text
Opening quantity
+ accepted purchase receipts
+ accepted inbound transfers
- outbound transfer dispatches
- posted wastage
+/- posted stock adjustments
= expected current on-hand quantity
```

Compare the expected quantity with:

- Stock Balances
- Movement Ledger
- Latest physical Stock Count
- Ledger Variance
- Transaction and Admin audit history

A deliberate unresolved count variance from Scenario 12 is expected to remain visible and must be reported separately. Do not classify it as a ledger-integrity defect unless the cached and ledger-derived balances disagree or an expected posted movement is missing or duplicated.

Also verify the operational controls for every posted transaction:

- Correct Company and Location
- Named actor and timestamps
- Required reason and evidence
- Status and next action
- Approval and segregation history
- Immutable source and movement references
- No duplicate movement after refresh or retry

**Pass criteria:** All five sources reconcile. Any unexplained mismatch is a blocking UAT defect and must not be corrected by editing a balance directly.

## Negative-control checklist

Run at least one controlled negative test for each applicable workflow:

- Wrong Company or Location scope
- Missing permission
- Self-approval attempt
- Missing required reason or evidence
- Duplicate code
- Invalid status transition
- Stale record version
- Repeated submit, post, dispatch, or receipt request
- Insufficient stock
- Adjacent-location detail URL

The expected result is a user-safe denial with no unauthorized mutation, no inventory change, and no disclosure of protected record details.

## Common errors and recovery

- **Application opens on the wrong port:** Use `http://localhost:3001`. Port `3000` is internal to the web container.
- **Action fails without a useful page change:** Check `docker logs --tail=150 ogfi-clean-web-1`, record the safe error, and do not repeat a posting action until its current status is confirmed.
- **Approval Inbox is unavailable in the ordinary local stack:** This is the expected fail-closed state. Do not change the ordinary `.env` to bypass it. Use only the separately admitted hardened bounded-UAT lane.
- **A bounded worklist item is unavailable:** Verify that another named user owns the active approval step and has current Company and Location scope.
- **MFA or assurance is stale:** Refresh MFA assurance using the account-security workflow, then reopen the current record.
- **Reason code is absent:** Verify the selected action type, Item class, reason-code lifecycle, and applicability configuration. Do not substitute free text for a required controlled reason code.
- **Opening readiness is blocked:** Correct the authoritative endpoint, Item, named-user, permission, or approval-route record and validate the draft again.
- **Command is pending or retrying:** Do not submit another matching command. Follow its immutable lifecycle in **Activity**.
- **Inventory does not reconcile:** Stop testing the affected Item and Location, capture the ledger trace and document references, and raise a blocking defect. Never directly edit the balance.

## Completion check

The local functional-verification run is complete only when:

- Every mandatory executable scenario passes. A default-off or release-gated scenario may be marked `Not Run` only when the release owner excludes it before execution.
- Any unresolved blocking defect keeps the run incomplete.
- Desktop and mobile task paths are usable for the affected roles.
- Every controlled denial produces no unauthorized mutation.
- Every expected inventory effect appears exactly once in the Movement Ledger.
- Stock Balance, ledger, count, and audit evidence reconcile.
- Test records, screenshots, exports, and defect references are retained in the UAT evidence package.

Completing this runbook does not replace hosted CI lanes, clean secret scans, deployment and teardown receipts, recovery rehearsal, formal human signoff, or the release owner's GO decision.

## Related knowledge-base articles

- [Managing Suppliers and Supplier Catalog Links](../knowledge-base/administration/managing-suppliers.md)
- [Preparing and Sealing an Inventory Pilot Configuration](../knowledge-base/administration/preparing-and-sealing-an-inventory-pilot-configuration.md)
- [Creating a Purchase Request](../knowledge-base/purchasing/creating-a-purchase-request.md)
- [Reviewing and Approving a Purchase Request](../knowledge-base/purchasing/reviewing-and-approving-a-purchase-request.md)
- [Recording Supplier Quotes](../knowledge-base/purchasing/recording-supplier-quotes.md)
- [Receiving Issued Purchase Orders](../knowledge-base/purchasing/receiving-issued-purchase-orders.md)
- [Creating Transfer Requests](../knowledge-base/warehouse-inventory/creating-transfer-requests.md)
- [Dispatching Warehouse Transfers](../knowledge-base/warehouse-inventory/dispatching-warehouse-transfers.md)
- [Receiving Warehouse Transfers](../knowledge-base/warehouse-inventory/receiving-warehouse-transfers.md)
- [Logging Wastage](../knowledge-base/warehouse-inventory/logging-wastage.md)
- [Running Stock Counts](../knowledge-base/warehouse-inventory/running-stock-counts.md)
- [Understanding Stock Adjustments](../knowledge-base/warehouse-inventory/understanding-stock-adjustments.md)
- [Using the Opening Inventory Cutover Pilot](../knowledge-base/warehouse-inventory/using-the-opening-inventory-cutover-pilot.md)
