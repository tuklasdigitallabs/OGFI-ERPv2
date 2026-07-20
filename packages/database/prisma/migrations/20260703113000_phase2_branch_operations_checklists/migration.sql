CREATE TABLE "BranchOperationalChecklist" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "businessDate" TIMESTAMP(3) NOT NULL,
  "shiftType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "checklistName" TEXT NOT NULL,
  "openedByUserId" UUID,
  "submittedByUserId" UUID,
  "submittedAt" TIMESTAMP(3),
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "exceptionCount" INTEGER NOT NULL DEFAULT 0,
  "completionPercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BranchOperationalChecklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BranchOperationalChecklistLine" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "checklistId" UUID NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "area" TEXT NOT NULL,
  "checkName" TEXT NOT NULL,
  "expectedResult" TEXT NOT NULL,
  "result" TEXT NOT NULL DEFAULT 'PENDING',
  "severity" TEXT NOT NULL DEFAULT 'NORMAL',
  "evidenceReference" TEXT,
  "notes" TEXT,
  "completedByUserId" UUID,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchOperationalChecklistLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchOperationalChecklist_companyId_locationId_businessDate_shiftType_key"
  ON "BranchOperationalChecklist"("companyId", "locationId", "businessDate", "shiftType");

CREATE INDEX "BranchOperationalChecklist_tenantId_companyId_brandId_locationId_businessDate_status_idx"
  ON "BranchOperationalChecklist"("tenantId", "companyId", "brandId", "locationId", "businessDate", "status");

CREATE UNIQUE INDEX "BranchOperationalChecklistLine_checklistId_lineNo_key"
  ON "BranchOperationalChecklistLine"("checklistId", "lineNo");

CREATE INDEX "BranchOperationalChecklistLine_tenantId_companyId_brandId_locationId_idx"
  ON "BranchOperationalChecklistLine"("tenantId", "companyId", "brandId", "locationId");

CREATE INDEX "BranchOperationalChecklistLine_result_severity_idx"
  ON "BranchOperationalChecklistLine"("result", "severity");

ALTER TABLE "BranchOperationalChecklist" ADD CONSTRAINT "BranchOperationalChecklist_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchOperationalChecklist" ADD CONSTRAINT "BranchOperationalChecklist_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchOperationalChecklist" ADD CONSTRAINT "BranchOperationalChecklist_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchOperationalChecklist" ADD CONSTRAINT "BranchOperationalChecklist_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchOperationalChecklistLine" ADD CONSTRAINT "BranchOperationalChecklistLine_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchOperationalChecklistLine" ADD CONSTRAINT "BranchOperationalChecklistLine_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchOperationalChecklistLine" ADD CONSTRAINT "BranchOperationalChecklistLine_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchOperationalChecklistLine" ADD CONSTRAINT "BranchOperationalChecklistLine_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchOperationalChecklistLine" ADD CONSTRAINT "BranchOperationalChecklistLine_checklistId_fkey"
  FOREIGN KEY ("checklistId") REFERENCES "BranchOperationalChecklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
