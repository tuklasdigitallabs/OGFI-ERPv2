ALTER TABLE "StockAdjustment"
  DROP CONSTRAINT IF EXISTS "StockAdjustment_adjustmentType_check";

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_adjustmentType_check"
  CHECK ("adjustmentType" IN ('INCREASE', 'DECREASE', 'COUNT_VARIANCE'));

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_count_source_document_check"
  CHECK (
    "sourceStockCountSessionId" IS NULL
    OR (
      "sourceDocumentType" = 'StockCountSession'
      AND "sourceDocumentId" = "sourceStockCountSessionId"
      AND "adjustmentType" = 'COUNT_VARIANCE'
    )
  );

CREATE UNIQUE INDEX "StockAdjustment_sourceStockCountSessionId_key"
  ON "StockAdjustment"("sourceStockCountSessionId")
  WHERE "sourceStockCountSessionId" IS NOT NULL;

CREATE UNIQUE INDEX "StockAdjustmentLine_sourceStockCountLineId_key"
  ON "StockAdjustmentLine"("sourceStockCountLineId")
  WHERE "sourceStockCountLineId" IS NOT NULL;
