-- Goods Receipt full-document reversal metadata and movement-link hardening.
-- Additive only: this migration creates no inventory movements and changes no balances.

ALTER TABLE "GoodsReceipt"
  ADD COLUMN "reversedByUserId" UUID,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT;

ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_reversedByUserId_fkey"
  FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GoodsReceipt_tenantId_companyId_status_reversedAt_idx"
  ON "GoodsReceipt"("tenantId", "companyId", "status", "reversedAt");

CREATE INDEX "GoodsReceipt_reversedByUserId_idx"
  ON "GoodsReceipt"("reversedByUserId");

ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_status_check"
    CHECK (
      "status" IN (
        'DRAFT',
        'POSTING',
        'POSTED',
        'POSTED_WITH_DISCREPANCY',
        'REVERSING',
        'REVERSED',
        'CANCELLED',
        'REJECTED'
      )
    );

ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_posted_fields_check"
    CHECK (
      "status" NOT IN ('POSTED', 'POSTED_WITH_DISCREPANCY', 'REVERSING', 'REVERSED')
      OR "postedAt" IS NOT NULL
    );

ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_reversed_fields_check"
    CHECK (
      "status" <> 'REVERSED'
      OR (
        "reversedAt" IS NOT NULL
        AND "reversedByUserId" IS NOT NULL
        AND "reversalReason" IS NOT NULL
        AND length(trim("reversalReason")) >= 5
      )
    );

CREATE UNIQUE INDEX "GoodsReceiptLine_postedMovementId_key"
  ON "GoodsReceiptLine"("postedMovementId");

ALTER TABLE "GoodsReceiptLine"
  ADD CONSTRAINT "GoodsReceiptLine_postedMovementId_fkey"
  FOREIGN KEY ("postedMovementId") REFERENCES "InventoryMovement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
