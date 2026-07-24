-- DEC-0098: additive immutable Stock Count attempt foundation.
-- Existing sessions/lines are preserved as attempt 1; operational services remain
-- on the legacy tables until the reviewed workflow cutover is implemented.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE TABLE "StockCountAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stockCountSessionId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "blindCount" BOOLEAN NOT NULL DEFAULT true,
  "freezeMovements" BOOLEAN NOT NULL DEFAULT false,
  "cutoffAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "reviewNotes" TEXT,
  "reason" TEXT,
  "evidenceReference" TEXT,
  "createdByUserId" UUID NOT NULL,
  "assignedToUserId" UUID,
  "reviewedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockCountAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockCountAttempt_attempt_number_check" CHECK ("attemptNumber" > 0),
  CONSTRAINT "StockCountAttempt_status_check" CHECK ("status" IN ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'RECOUNT_REQUESTED', 'REVIEWED', 'CANCELLED', 'VOIDED_FOR_RECOUNT')),
  CONSTRAINT "StockCountAttempt_session_fkey" FOREIGN KEY ("stockCountSessionId") REFERENCES "StockCountSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttempt_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttempt_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttempt_location_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttempt_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttempt_assignee_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttempt_reviewer_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StockCountAttemptLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stockCountAttemptId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "inventoryLocationId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "uomId" UUID NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "lotKey" TEXT NOT NULL DEFAULT 'NOLOT|NOEXP',
  "lotNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "systemQuantityBaseUom" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "countedQuantityBaseUom" DECIMAL(18,6),
  "varianceQuantityBaseUom" DECIMAL(18,6),
  "notes" TEXT,
  "countedByUserId" UUID,
  "countedAt" TIMESTAMP(3),
  "legacyStockCountLineId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockCountAttemptLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockCountAttemptLine_attempt_fkey" FOREIGN KEY ("stockCountAttemptId") REFERENCES "StockCountAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttemptLine_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttemptLine_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttemptLine_location_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttemptLine_item_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttemptLine_uom_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttemptLine_counter_fkey" FOREIGN KEY ("countedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCountAttemptLine_legacy_fkey" FOREIGN KEY ("legacyStockCountLineId") REFERENCES "StockCountLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "StockCountSession" ADD COLUMN "currentAttemptId" UUID;
ALTER TABLE "StockAdjustment" ADD COLUMN "sourceStockCountAttemptId" UUID;
ALTER TABLE "StockAdjustmentLine" ADD COLUMN "sourceStockCountAttemptLineId" UUID;
CREATE UNIQUE INDEX "StockCountSession_currentAttemptId_key" ON "StockCountSession"("currentAttemptId");

ALTER TABLE "StockCountAttempt"
  ADD CONSTRAINT "StockCountAttempt_session_attempt_number_key" UNIQUE ("stockCountSessionId", "attemptNumber");
ALTER TABLE "StockCountAttemptLine"
  ADD CONSTRAINT "StockCountAttemptLine_legacy_unique" UNIQUE ("legacyStockCountLineId"),
  ADD CONSTRAINT "StockCountAttemptLine_attempt_item_lot_key" UNIQUE ("stockCountAttemptId", "itemId", "lotKey"),
  ADD CONSTRAINT "StockCountAttemptLine_attempt_line_number_key" UNIQUE ("stockCountAttemptId", "lineNumber");
ALTER TABLE "StockCountSession"
  ADD CONSTRAINT "StockCountSession_current_attempt_fkey" FOREIGN KEY ("currentAttemptId") REFERENCES "StockCountAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_source_attempt_fkey" FOREIGN KEY ("sourceStockCountAttemptId") REFERENCES "StockCountAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAdjustmentLine"
  ADD CONSTRAINT "StockAdjustmentLine_source_attempt_line_fkey" FOREIGN KEY ("sourceStockCountAttemptLineId") REFERENCES "StockCountAttemptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "StockCountAttempt_tenant_company_session_status_idx"
  ON "StockCountAttempt"("tenantId", "companyId", "stockCountSessionId", "status");
CREATE INDEX "StockCountAttempt_tenant_company_location_status_idx"
  ON "StockCountAttempt"("tenantId", "companyId", "inventoryLocationId", "status");
CREATE INDEX "StockCountAttemptLine_tenant_company_attempt_item_idx"
  ON "StockCountAttemptLine"("tenantId", "companyId", "stockCountAttemptId", "itemId");
CREATE INDEX "StockCountAttemptLine_location_item_lot_idx"
  ON "StockCountAttemptLine"("inventoryLocationId", "itemId", "lotKey");

-- Lossless attempt-1 backfill. Legacy IDs are retained as the attempt/line IDs
-- so existing audit and source links remain reconstructable.
INSERT INTO "StockCountAttempt" (
  "id", "stockCountSessionId", "tenantId", "companyId", "inventoryLocationId",
  "attemptNumber", "status", "blindCount", "freezeMovements", "cutoffAt",
  "startedAt", "submittedAt", "reviewedAt", "cancelledAt", "cancellationReason",
  "reviewNotes", "createdByUserId", "assignedToUserId", "reviewedByUserId",
  "createdAt", "updatedAt"
)
SELECT "id", "id", "tenantId", "companyId", "inventoryLocationId", 1,
       "status", "blindCount", "freezeMovements", "cutoffAt", "startedAt",
       "submittedAt", "reviewedAt", "cancelledAt", "cancellationReason",
       "reviewNotes", "createdByUserId", "assignedToUserId", "reviewedByUserId",
       "createdAt", "updatedAt"
  FROM "StockCountSession";

INSERT INTO "StockCountAttemptLine" (
  "id", "stockCountAttemptId", "tenantId", "companyId", "inventoryLocationId",
  "itemId", "uomId", "lineNumber", "lotKey", "lotNumber", "expiryDate",
  "systemQuantityBaseUom", "countedQuantityBaseUom", "varianceQuantityBaseUom",
  "notes", "countedByUserId", "countedAt", "legacyStockCountLineId",
  "createdAt", "updatedAt"
)
SELECT l."id", l."stockCountSessionId", l."tenantId", l."companyId",
       l."inventoryLocationId", l."itemId", l."uomId", l."lineNumber",
       l."lotKey", l."lotNumber", l."expiryDate", l."systemQuantityBaseUom",
       l."countedQuantityBaseUom", l."varianceQuantityBaseUom", l."notes",
       l."countedByUserId", l."countedAt", l."id", l."createdAt", l."updatedAt"
  FROM "StockCountLine" l;

UPDATE "StockCountSession" SET "currentAttemptId" = "id";
UPDATE "StockAdjustment" sa
   SET "sourceStockCountAttemptId" = sa."sourceStockCountSessionId"
 WHERE sa."sourceStockCountSessionId" IS NOT NULL;
UPDATE "StockAdjustmentLine" sal
   SET "sourceStockCountAttemptLineId" = sal."sourceStockCountLineId"
 WHERE sal."sourceStockCountLineId" IS NOT NULL;

CREATE OR REPLACE FUNCTION "guard_stock_count_attempt_history"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stock count attempt history is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD."status" = 'SUBMITTED'
     AND NEW."status" IN ('REVIEWED', 'RECOUNT_REQUESTED')
     AND NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."stockCountSessionId" IS NOT DISTINCT FROM OLD."stockCountSessionId"
     AND NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId"
     AND NEW."companyId" IS NOT DISTINCT FROM OLD."companyId"
     AND NEW."inventoryLocationId" IS NOT DISTINCT FROM OLD."inventoryLocationId"
     AND NEW."attemptNumber" IS NOT DISTINCT FROM OLD."attemptNumber"
     AND NEW."blindCount" IS NOT DISTINCT FROM OLD."blindCount"
     AND NEW."freezeMovements" IS NOT DISTINCT FROM OLD."freezeMovements"
     AND NEW."cutoffAt" IS NOT DISTINCT FROM OLD."cutoffAt"
     AND NEW."startedAt" IS NOT DISTINCT FROM OLD."startedAt"
     AND NEW."submittedAt" IS NOT DISTINCT FROM OLD."submittedAt"
     AND NEW."cancelledAt" IS NOT DISTINCT FROM OLD."cancelledAt"
     AND NEW."cancellationReason" IS NOT DISTINCT FROM OLD."cancellationReason"
     AND NEW."reason" IS NOT DISTINCT FROM OLD."reason"
     AND NEW."evidenceReference" IS NOT DISTINCT FROM OLD."evidenceReference"
     AND NEW."createdByUserId" IS NOT DISTINCT FROM OLD."createdByUserId"
     AND NEW."assignedToUserId" IS NOT DISTINCT FROM OLD."assignedToUserId"
     AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
     THEN RETURN NEW;
  END IF;
  IF OLD."status" IN ('SUBMITTED', 'RECOUNT_REQUESTED', 'REVIEWED', 'CANCELLED', 'VOIDED_FOR_RECOUNT')
     AND (NEW.* IS DISTINCT FROM OLD.*) THEN
    RAISE EXCEPTION 'Terminal stock count attempt evidence is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "guard_stock_count_attempt_line_history"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stock count attempt line history is immutable' USING ERRCODE = '55000';
  END IF;
  SELECT "status" INTO parent_status FROM "StockCountAttempt" WHERE "id" = OLD."stockCountAttemptId";
  IF parent_status IN ('SUBMITTED', 'RECOUNT_REQUESTED', 'REVIEWED', 'CANCELLED', 'VOIDED_FOR_RECOUNT')
     AND (NEW.* IS DISTINCT FROM OLD.*) THEN
    RAISE EXCEPTION 'Terminal stock count attempt line evidence is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "StockCountAttempt_history_guard"
  BEFORE UPDATE OR DELETE ON "StockCountAttempt"
  FOR EACH ROW EXECUTE FUNCTION "guard_stock_count_attempt_history"();
CREATE TRIGGER "StockCountAttemptLine_history_guard"
  BEFORE UPDATE OR DELETE ON "StockCountAttemptLine"
  FOR EACH ROW EXECUTE FUNCTION "guard_stock_count_attempt_line_history"();

ALTER TABLE "StockCountAttempt" ENABLE ALWAYS TRIGGER "StockCountAttempt_history_guard";
ALTER TABLE "StockCountAttemptLine" ENABLE ALWAYS TRIGGER "StockCountAttemptLine_history_guard";

COMMIT;
