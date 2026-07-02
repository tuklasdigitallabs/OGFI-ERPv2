-- Stock Adjustment approval/posting/reversal metadata.
-- Additive only: this migration creates no inventory movements and changes no balances.

ALTER TABLE "StockAdjustment"
  ADD COLUMN "postedByUserId" UUID,
  ADD COLUMN "reversedByUserId" UUID,
  ADD COLUMN "postedAt" TIMESTAMP(3),
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT;

ALTER TABLE "StockAdjustment"
  DROP CONSTRAINT IF EXISTS "StockAdjustment_status_check";

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_status_check"
    CHECK (
      "status" IN (
        'DRAFT',
        'SUBMITTED',
        'PENDING_APPROVAL',
        'APPROVED',
        'POSTING',
        'POSTED',
        'REVERSING',
        'REVERSED',
        'RETURNED',
        'REJECTED',
        'CANCELLED'
      )
    );

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_posted_fields_check"
    CHECK (
      "status" NOT IN ('POSTED', 'REVERSING', 'REVERSED')
      OR (
        "postedAt" IS NOT NULL
        AND "postedByUserId" IS NOT NULL
      )
    );

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_reversed_fields_check"
    CHECK (
      "status" <> 'REVERSED'
      OR (
        "reversedAt" IS NOT NULL
        AND "reversedByUserId" IS NOT NULL
        AND "reversalReason" IS NOT NULL
        AND length(trim("reversalReason")) >= 5
      )
    );

CREATE INDEX "StockAdjustment_postedByUserId_idx" ON "StockAdjustment"("postedByUserId");
CREATE INDEX "StockAdjustment_reversedByUserId_idx" ON "StockAdjustment"("reversedByUserId");

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_postedByUserId_fkey"
  FOREIGN KEY ("postedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_reversedByUserId_fkey"
  FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
