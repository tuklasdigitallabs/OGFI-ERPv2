CREATE TABLE "WastagePolicy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL DEFAULT 'v1',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "inventoryLocationId" UUID,
  "wastageType" TEXT,
  "reasonCode" TEXT,
  "minimumEstimatedCost" DECIMAL(18,6),
  "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
  "repeatLookbackDays" INTEGER NOT NULL DEFAULT 30,
  "repeatItemLocationCount" INTEGER NOT NULL DEFAULT 3,
  "repeatReporterCount" INTEGER NOT NULL DEFAULT 5,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WastagePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WastagePolicy_minimum_estimated_cost_check" CHECK ("minimumEstimatedCost" IS NULL OR "minimumEstimatedCost" >= 0),
  CONSTRAINT "WastagePolicy_repeat_threshold_check" CHECK ("repeatLookbackDays" > 0 AND "repeatItemLocationCount" > 0 AND "repeatReporterCount" > 0)
);

ALTER TABLE "WastageReport"
  ADD COLUMN "policyFlags" JSONB,
  ADD COLUMN "policySnapshot" JSONB,
  ADD COLUMN "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "evidenceSatisfied" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "WastagePolicy_tenantId_companyId_isActive_priority_idx"
  ON "WastagePolicy"("tenantId", "companyId", "isActive", "priority");

CREATE INDEX "WastagePolicy_tenantId_companyId_inventoryLocationId_wastageType_reasonCode_idx"
  ON "WastagePolicy"("tenantId", "companyId", "inventoryLocationId", "wastageType", "reasonCode");

CREATE INDEX "WastageLine_tenantId_companyId_inventoryLocationId_itemId_createdAt_idx"
  ON "WastageLine"("tenantId", "companyId", "inventoryLocationId", "itemId", "createdAt");

ALTER TABLE "WastagePolicy"
  ADD CONSTRAINT "WastagePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastagePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WastagePolicy_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
