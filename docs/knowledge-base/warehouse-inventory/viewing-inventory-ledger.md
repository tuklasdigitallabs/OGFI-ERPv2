# Viewing Inventory Movement History

**Audience / required role:** Warehouse, storekeeping, branch management, operations, finance review, or audit users with inventory-ledger view access  
**Applies to:** Current assigned location  
**Related phase/module:** Phase I / Inventory  
**Last verified against:** `inventory-ui-spec.md`, `SECURITY_AND_AUDIT_MODEL.md`, and implemented inventory ledger inquiry

## Purpose

Use this article to trace posted inventory movements for the location selected in the ERP header. The Inventory Ledger is read-only and shows source-linked movement history, such as receipt movements created from posted Receiving Reports.

## Before you begin

- Your role must include `inventory.ledger.view`.
- You must switch the header location to the location you want to review.
- Ledger rows appear only after a controlled workflow posts an inventory movement.

## Navigation path

`Inventory → Movement Ledger`

## Steps

1. Open `Inventory`.
2. Select `Movement Ledger`.
3. Confirm the posting context in the header.
4. Search by item, item code, lot, or source reference.
5. Optionally filter by movement type.
6. Review movement date, item, location, movement type, source document, entered quantity, in/out quantity, posted-by user, lot, expiry, and reason.

[Screenshot placeholder: Inventory Ledger page showing recent source-linked movements and movement-type filter.]

## Expected result

- The page shows recent movement rows only for your current authorized location.
- Inbound movements show positive base quantity deltas.
- The in/out display separates positive and negative base-UOM movement quantities for faster audit review.
- Outbound or reversal workflows, when released, will show negative or reversal movement types.

## Important controls and warnings

- The ledger is the source-of-truth movement trail. Do not edit posted ledger rows.
- Balance corrections must be made through controlled workflows such as receiving correction, transfer, count variance, wastage, adjustment, or reversal when those workflows are released.
- The current inquiry shows the latest 100 matching rows; broader export/reporting is future work.

## What happens next

Use Stock Balances to view current on-hand quantities. Use the ledger when you need to trace why a balance changed.

## Related articles

- Viewing Stock Balances
- Receiving Issued Purchase Orders
