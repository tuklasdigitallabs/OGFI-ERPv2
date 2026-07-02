-- Opening inventory balances are a controlled cutover stock-adjustment slice.
-- Additive only: this migration creates no movements and changes no balances.

ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'OPENING_BALANCE_IN';

ALTER TABLE "StockAdjustment"
  DROP CONSTRAINT IF EXISTS "StockAdjustment_adjustmentType_check";

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_adjustmentType_check"
  CHECK ("adjustmentType" IN ('INCREASE', 'DECREASE', 'COUNT_VARIANCE', 'OPENING_BALANCE'));
