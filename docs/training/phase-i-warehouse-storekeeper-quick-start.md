# Training Module — Phase I Warehouse And Storekeeper Quick Start

**Audience:** Warehouse staff, storekeepers, and inventory custodians  
**Duration:** 60 minutes  
**Prerequisites:** Active warehouse or branch inventory scope, transfer, receiving, stock count, wastage, inventory ledger, and evidence-reference access as assigned  
**Related knowledge-base articles:** Understanding the Inventory Control Pilot; Viewing current stock balances; Viewing inventory movement history; Creating a transfer request; Dispatching warehouse transfers; Receiving warehouse transfers; Running stock counts; Logging wastage; Understanding Stock Adjustments

## Learning objectives

By the end of this module, participants can:

- Confirm the correct inventory location before posting.
- View stock balances and inventory ledger history.
- Dispatch a transfer from the authorized source location.
- Receive a transfer at the destination location.
- Run and submit a stock count.
- Log wastage and understand when Stock Adjustment is required.
- Distinguish Inventory Control Pilot work from visible `Deferred` workflows without treating a label as permission or production approval.
- Explain the conditional pilot approval route without treating its local implementation as enabled UAT or production behavior.

## Demonstration flow

1. Sign in and confirm the assigned warehouse or branch location.
2. Confirm the `Inventory Control Pilot` header badge and explain that authorized deferred destinations remain visible but outside the pilot release scope.
3. Open `Inventory -> Stock Balances` and search for an item.
4. Open `Inventory Ledger` and trace a posted source movement.
5. Open `Transfers` and explain the current default-off path: a submitted request becomes `REQUESTED` before controlled source dispatch. Explain the conditional future pilot route: an admitted transfer becomes `PENDING_APPROVAL`, waits in Approval Inbox, and becomes `REQUESTED` only after final approval.
6. Switch to the destination location and receive the dispatched transfer.
7. Schedule, start, enter, and submit a stock count. Explain that the conditional future pilot route sends an admitted count to an independent, approve-only Approval Inbox review; direct page review is not an alternative route. If an authorized cancellation is needed while that review is pending, demonstrate the required reason and confirm that the session, immutable attempt, and pending approval close together without changing count evidence or posting stock.
8. Log a wastage report with reason and evidence reference.
9. Review a Stock Adjustment and explain approval, posting, and reversal boundaries.

## Practice exercise

Process a warehouse-to-branch transfer from request through dispatch and destination receipt. Record a short or damaged quantity with evidence reference, then confirm that only accepted quantity increases destination stock.

Discuss the separation controls before the exercise: a transfer requester cannot approve that transfer; a transfer approver cannot dispatch or receive it; and a count creator, assigned counter, or count-line entrant cannot approve that count. These are server-enforced controls, not screen-visibility rules.

## Mobile pilot check

During pilot training, repeat the critical warehouse/storekeeper actions on a phone-sized viewport or assigned mobile device:

- confirm the selected warehouse or branch inventory location is visible before posting;
- search stock balances and open ledger history without table overlap;
- dispatch a transfer from the authorized source location;
- receive a transfer at the destination location and preserve accepted, rejected, damaged, and short quantities;
- enter stock count, wastage, and adjustment evidence without losing the item or line context;
- capture denied states for unauthorized source/destination, posting, reversal, export, or approval attempts.

If a mobile action is confusing or cramped, record it in the pilot defect log with device/browser, screenshot, source record ID, and the workflow step.

## Common errors and recovery

- Dispatching from the wrong location: switch to the source location first.
- Receiving from the wrong location: switch to the destination location first.
- Expecting transfer request submission to move stock: stock changes only after dispatch and receipt posting.
- Treating a pending pilot approval as dispatch authority: a pilot-admitted transfer is dispatchable only after final approval changes it to `REQUESTED`.
- Treating count approval as a stock correction: approval records reviewed count evidence only; it creates no inventory movement, balance update, or Stock Adjustment.
- Trying to use count return, rejection, or direct-page review for an admitted pilot count: the conditional pilot route is approve-only. Follow the authorized cancellation or escalation path instead.
- Treating an emergency release disable as permission to bypass approval: it can deny new pilot admissions but cannot downgrade an admitted record to an uncontrolled route.
- Trying to edit posted inventory records: use reversal or approved correction workflow.
- Treating the pilot or `Deferred` label as access authority: confirm the assigned role, location, workflow state, and release decision separately.

## Completion check

- Participant can trace a transfer from request to ledger movements and explain why rejected, damaged, and short quantities do not increase destination stock.
- Participant can explain that the pilot approval behaviors are implemented locally but disabled by default; no production/UAT use begins without an authorized activation and release decision.
