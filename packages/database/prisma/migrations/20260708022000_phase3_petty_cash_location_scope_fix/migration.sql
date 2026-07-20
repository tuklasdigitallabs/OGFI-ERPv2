ALTER TABLE "PettyCashRequest" ADD COLUMN IF NOT EXISTS "locationId" UUID;
ALTER TABLE "PettyCashLedgerEntry" ADD COLUMN IF NOT EXISTS "locationId" UUID;
ALTER TABLE "PettyCashLiquidation" ADD COLUMN IF NOT EXISTS "locationId" UUID;
ALTER TABLE "PettyCashLiquidationLine" ADD COLUMN IF NOT EXISTS "locationId" UUID;

UPDATE "PettyCashRequest" request
SET "locationId" = fund."locationId"
FROM "PettyCashFund" fund
WHERE request."pettyCashFundId" = fund."id"
  AND request."locationId" IS NULL;

UPDATE "PettyCashLedgerEntry" entry
SET "locationId" = fund."locationId"
FROM "PettyCashFund" fund
WHERE entry."pettyCashFundId" = fund."id"
  AND entry."locationId" IS NULL;

UPDATE "PettyCashLiquidation" liquidation
SET "locationId" = fund."locationId"
FROM "PettyCashFund" fund
WHERE liquidation."pettyCashFundId" = fund."id"
  AND liquidation."locationId" IS NULL;

UPDATE "PettyCashLiquidationLine" line
SET "locationId" = fund."locationId"
FROM "PettyCashFund" fund
WHERE line."pettyCashFundId" = fund."id"
  AND line."locationId" IS NULL;

ALTER TABLE "PettyCashRequest"
  ADD CONSTRAINT "PettyCashRequest_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PettyCashLedgerEntry"
  ADD CONSTRAINT "PettyCashLedgerEntry_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PettyCashLiquidation"
  ADD CONSTRAINT "PettyCashLiquidation_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PettyCashLiquidationLine"
  ADD CONSTRAINT "PettyCashLiquidationLine_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "PettyCashRequest_location_scope_idx"
  ON "PettyCashRequest"("tenantId", "companyId", "locationId", "status");

CREATE INDEX IF NOT EXISTS "PettyCashLedgerEntry_location_scope_idx"
  ON "PettyCashLedgerEntry"("tenantId", "companyId", "locationId", "postedAt");

CREATE INDEX IF NOT EXISTS "PettyCashLiquidation_location_scope_idx"
  ON "PettyCashLiquidation"("tenantId", "companyId", "locationId", "status");

CREATE INDEX IF NOT EXISTS "PettyCashLiquidationLine_location_scope_idx"
  ON "PettyCashLiquidationLine"("tenantId", "companyId", "locationId");
