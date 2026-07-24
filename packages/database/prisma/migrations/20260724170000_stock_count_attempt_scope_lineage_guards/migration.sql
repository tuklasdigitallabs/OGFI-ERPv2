-- DEC-0098: make current-attempt and count-variance source lineage
-- enforceable at the database boundary. Count Variance generation remains
-- feature-disabled until the recovery and production evidence gates close.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "StockAdjustment"
     WHERE "sourceStockCountAttemptId" IS NOT NULL
     GROUP BY "sourceStockCountAttemptId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate StockAdjustment attempt source lineage exists';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM "StockAdjustmentLine"
     WHERE "sourceStockCountAttemptLineId" IS NOT NULL
     GROUP BY "sourceStockCountAttemptLineId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate StockAdjustmentLine attempt source lineage exists';
  END IF;
END;
$$;

DROP INDEX IF EXISTS "StockAdjustment_sourceStockCountSessionId_key";
DROP INDEX IF EXISTS "StockAdjustmentLine_sourceStockCountLineId_key";

CREATE UNIQUE INDEX "StockAdjustment_sourceStockCountAttemptId_key"
  ON "StockAdjustment"("sourceStockCountAttemptId")
  WHERE "sourceStockCountAttemptId" IS NOT NULL;

CREATE UNIQUE INDEX "StockAdjustmentLine_sourceStockCountAttemptLineId_key"
  ON "StockAdjustmentLine"("sourceStockCountAttemptLineId")
  WHERE "sourceStockCountAttemptLineId" IS NOT NULL;

CREATE OR REPLACE FUNCTION "validate_stock_count_session_attempt_scope"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_row RECORD;
BEGIN
  IF NEW."currentAttemptId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a."stockCountSessionId", a."tenantId", a."companyId", a."inventoryLocationId"
    INTO attempt_row
    FROM "StockCountAttempt" a
   WHERE a.id = NEW."currentAttemptId";

  IF NOT FOUND
     OR attempt_row."stockCountSessionId" IS DISTINCT FROM NEW.id
     OR attempt_row."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR attempt_row."companyId" IS DISTINCT FROM NEW."companyId"
     OR attempt_row."inventoryLocationId" IS DISTINCT FROM NEW."inventoryLocationId" THEN
    RAISE EXCEPTION 'Stock count current attempt scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "validate_stock_count_attempt_scope"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_row RECORD;
BEGIN
  SELECT sc."tenantId", sc."companyId", sc."inventoryLocationId"
    INTO session_row
    FROM "StockCountSession" sc
   WHERE sc.id = NEW."stockCountSessionId";

  IF NOT FOUND
     OR session_row."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR session_row."companyId" IS DISTINCT FROM NEW."companyId"
     OR session_row."inventoryLocationId" IS DISTINCT FROM NEW."inventoryLocationId" THEN
    RAISE EXCEPTION 'Stock count attempt scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "validate_stock_adjustment_attempt_lineage"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_row RECORD;
BEGIN
  IF NEW."sourceStockCountAttemptId" IS NULL THEN
    IF NEW."sourceStockCountAttemptLineId" IS NOT NULL THEN
      RAISE EXCEPTION 'Attempt-line lineage requires an attempt header' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT a."stockCountSessionId", a."tenantId", a."companyId", a."inventoryLocationId"
    INTO attempt_row
    FROM "StockCountAttempt" a
   WHERE a.id = NEW."sourceStockCountAttemptId";
  IF NOT FOUND
     OR NEW."sourceStockCountSessionId" IS DISTINCT FROM attempt_row."stockCountSessionId"
     OR NEW."sourceDocumentType" IS DISTINCT FROM 'StockCountSession'
     OR NEW."sourceDocumentId" IS DISTINCT FROM attempt_row."stockCountSessionId"
     OR NEW."adjustmentType" IS DISTINCT FROM 'COUNT_VARIANCE'
     OR NEW."tenantId" IS DISTINCT FROM attempt_row."tenantId"
     OR NEW."companyId" IS DISTINCT FROM attempt_row."companyId"
     OR NEW."inventoryLocationId" IS DISTINCT FROM attempt_row."inventoryLocationId" THEN
    RAISE EXCEPTION 'Stock adjustment attempt lineage mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "validate_stock_adjustment_attempt_line_scope"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line_row RECORD; adjustment_row RECORD;
BEGIN
  IF NEW."sourceStockCountAttemptLineId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT al."stockCountAttemptId", al."tenantId", al."companyId", al."inventoryLocationId",
         al."itemId", al."uomId", al."lotKey"
    INTO line_row
    FROM "StockCountAttemptLine" al
   WHERE al.id = NEW."sourceStockCountAttemptLineId";
  SELECT sa."sourceStockCountAttemptId", sa."tenantId", sa."companyId", sa."inventoryLocationId"
    INTO adjustment_row
    FROM "StockAdjustment" sa
   WHERE sa.id = NEW."stockAdjustmentId";

  IF NOT FOUND
     OR line_row."stockCountAttemptId" IS DISTINCT FROM adjustment_row."sourceStockCountAttemptId"
     OR NEW."tenantId" IS DISTINCT FROM line_row."tenantId"
     OR NEW."companyId" IS DISTINCT FROM line_row."companyId"
     OR NEW."inventoryLocationId" IS DISTINCT FROM line_row."inventoryLocationId"
     OR NEW."itemId" IS DISTINCT FROM line_row."itemId"
     OR NEW."uomId" IS DISTINCT FROM line_row."uomId"
     OR NEW."lotKey" IS DISTINCT FROM line_row."lotKey" THEN
    RAISE EXCEPTION 'Stock adjustment attempt-line lineage mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "StockCountSession_current_attempt_scope_trg"
  BEFORE INSERT OR UPDATE OF "currentAttemptId", "tenantId", "companyId", "inventoryLocationId"
  ON "StockCountSession"
  FOR EACH ROW EXECUTE FUNCTION "validate_stock_count_session_attempt_scope"();
ALTER TABLE "StockCountSession" ENABLE ALWAYS TRIGGER "StockCountSession_current_attempt_scope_trg";

CREATE TRIGGER "StockCountAttempt_scope_trg"
  BEFORE INSERT OR UPDATE OF "stockCountSessionId", "tenantId", "companyId", "inventoryLocationId"
  ON "StockCountAttempt"
  FOR EACH ROW EXECUTE FUNCTION "validate_stock_count_attempt_scope"();
ALTER TABLE "StockCountAttempt" ENABLE ALWAYS TRIGGER "StockCountAttempt_scope_trg";

CREATE TRIGGER "StockAdjustment_attempt_lineage_trg"
  BEFORE INSERT OR UPDATE OF "sourceStockCountAttemptId", "sourceStockCountSessionId", "sourceDocumentType", "sourceDocumentId", "adjustmentType", "tenantId", "companyId", "inventoryLocationId"
  ON "StockAdjustment"
  FOR EACH ROW EXECUTE FUNCTION "validate_stock_adjustment_attempt_lineage"();
ALTER TABLE "StockAdjustment" ENABLE ALWAYS TRIGGER "StockAdjustment_attempt_lineage_trg";

CREATE TRIGGER "StockAdjustmentLine_attempt_lineage_trg"
  BEFORE INSERT OR UPDATE OF "sourceStockCountAttemptLineId", "stockAdjustmentId", "tenantId", "companyId", "inventoryLocationId", "itemId", "uomId", "lotKey"
  ON "StockAdjustmentLine"
  FOR EACH ROW EXECUTE FUNCTION "validate_stock_adjustment_attempt_line_scope"();
ALTER TABLE "StockAdjustmentLine" ENABLE ALWAYS TRIGGER "StockAdjustmentLine_attempt_lineage_trg";

REVOKE ALL ON FUNCTION "validate_stock_count_session_attempt_scope"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_stock_count_attempt_scope"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_stock_adjustment_attempt_lineage"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "validate_stock_adjustment_attempt_line_scope"() FROM PUBLIC;
