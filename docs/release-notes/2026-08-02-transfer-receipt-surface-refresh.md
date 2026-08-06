# Transfer receipt posting now refreshes the authoritative detail surface

## What changed

After a destination user posts a warehouse transfer receipt, the transfer detail workspace refreshes from the server and shows the committed status, receipt event, quantities, and audit history. The receipt action remains idempotent and continues to post accepted stock through the inventory ledger only once.

## Operator impact

Keep the receipt workspace open until the action completes. Confirm the resulting `RECEIVED`, `PARTIALLY_RECEIVED`, or `DISPUTED` status and the posted receipt event before treating the handoff as complete. Rejected, damaged, and short quantities remain non-posting discrepancy records.

## Validation status

The current local browser/UAT validation uses a seeded PostgreSQL stack with all 149 migrations. Receiving responsive and draft-receipt checks passed **2/2**, and the transfer receive/reverse browser flow passed **1/1 in 8.0s** with exactly one receipt movement and one linked reversal movement. The receipt and reversal surfaces now use authenticated POST route boundaries, await the HTTP response, then perform a full navigation to the authoritative detail state before the task is considered complete. Production-authenticated browser, hosted recovery, formal UAT, and owner signoff remain release gates.
