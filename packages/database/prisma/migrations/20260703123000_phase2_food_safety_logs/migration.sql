CREATE TABLE "FoodSafetyLog" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "businessDate" TIMESTAMP(3) NOT NULL,
  "logType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "title" TEXT NOT NULL,
  "recordedByUserId" UUID,
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "exceptionCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FoodSafetyLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoodSafetyReading" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "logId" UUID NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "station" TEXT NOT NULL,
  "readingType" TEXT NOT NULL,
  "readingValue" DECIMAL(18,6),
  "readingUom" TEXT,
  "expectedMinValue" DECIMAL(18,6),
  "expectedMaxValue" DECIMAL(18,6),
  "result" TEXT NOT NULL DEFAULT 'PENDING',
  "severity" TEXT NOT NULL DEFAULT 'NORMAL',
  "correctiveAction" TEXT,
  "evidenceReference" TEXT,
  "recordedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FoodSafetyReading_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoodSafetyLog_companyId_locationId_businessDate_logType_key"
  ON "FoodSafetyLog"("companyId", "locationId", "businessDate", "logType");

CREATE INDEX "FoodSafetyLog_tenantId_companyId_brandId_locationId_businessDate_status_idx"
  ON "FoodSafetyLog"("tenantId", "companyId", "brandId", "locationId", "businessDate", "status");

CREATE UNIQUE INDEX "FoodSafetyReading_logId_lineNo_key"
  ON "FoodSafetyReading"("logId", "lineNo");

CREATE INDEX "FoodSafetyReading_tenantId_companyId_brandId_locationId_idx"
  ON "FoodSafetyReading"("tenantId", "companyId", "brandId", "locationId");

CREATE INDEX "FoodSafetyReading_result_severity_idx"
  ON "FoodSafetyReading"("result", "severity");

ALTER TABLE "FoodSafetyLog" ADD CONSTRAINT "FoodSafetyLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoodSafetyLog" ADD CONSTRAINT "FoodSafetyLog_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoodSafetyLog" ADD CONSTRAINT "FoodSafetyLog_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FoodSafetyLog" ADD CONSTRAINT "FoodSafetyLog_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoodSafetyReading" ADD CONSTRAINT "FoodSafetyReading_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoodSafetyReading" ADD CONSTRAINT "FoodSafetyReading_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoodSafetyReading" ADD CONSTRAINT "FoodSafetyReading_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FoodSafetyReading" ADD CONSTRAINT "FoodSafetyReading_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoodSafetyReading" ADD CONSTRAINT "FoodSafetyReading_logId_fkey"
  FOREIGN KEY ("logId") REFERENCES "FoodSafetyLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
