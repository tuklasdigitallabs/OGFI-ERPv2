-- Wastage reason-code applicability has two independent dimensions:
-- the operational wastage event and the inventory class of every affected item.
-- The legacy appliesTo field remains available for non-wastage workflows and
-- historical reference; existing WASTAGE rows require an explicit admin mapping.

ALTER TABLE "OperationalReasonCode"
  ADD COLUMN "wastageTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "inventoryClasses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "OperationalReasonCode_tenantId_companyId_workflow_status_idx"
  ON "OperationalReasonCode"("tenantId", "companyId", "workflow", "status");

COMMENT ON COLUMN "OperationalReasonCode"."wastageTypes" IS
  'Explicit WASTAGE event types for which this reason code may be selected. Empty means not configured and is fail-closed.';
COMMENT ON COLUMN "OperationalReasonCode"."inventoryClasses" IS
  'Explicit normalized item inventory classes for which this WASTAGE reason code may be selected. Empty means not configured and is fail-closed.';

-- Confirmed F&B baseline mappings. Only these named legacy codes are migrated;
-- all other historical rows remain deliberately unmapped for administrator review.
UPDATE "OperationalReasonCode"
SET
  "wastageTypes" = CASE "code"
    WHEN 'SPOILAGE_EXPIRY' THEN ARRAY['SPOILAGE_EXPIRY']::TEXT[]
    WHEN 'PREP_TRIM_LOSS' THEN ARRAY['PREPARATION_LOSS']::TEXT[]
    WHEN 'KITCHEN_ERROR' THEN ARRAY['PREPARATION_LOSS']::TEXT[]
    WHEN 'DAMAGED_PACKAGING' THEN ARRAY['DAMAGE']::TEXT[]
  END,
  "inventoryClasses" = CASE "code"
    WHEN 'SPOILAGE_EXPIRY' THEN ARRAY['FOOD']::TEXT[]
    WHEN 'PREP_TRIM_LOSS' THEN ARRAY['FOOD']::TEXT[]
    WHEN 'KITCHEN_ERROR' THEN ARRAY['FOOD']::TEXT[]
    WHEN 'DAMAGED_PACKAGING' THEN ARRAY['FOOD', 'PACKAGING']::TEXT[]
  END
WHERE "workflow" = 'WASTAGE'
  AND "code" IN (
    'SPOILAGE_EXPIRY',
    'PREP_TRIM_LOSS',
    'KITCHEN_ERROR',
    'DAMAGED_PACKAGING'
  );
