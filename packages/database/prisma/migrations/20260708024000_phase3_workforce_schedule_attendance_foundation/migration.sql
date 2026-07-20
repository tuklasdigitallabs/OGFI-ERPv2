CREATE TYPE "WorkforceScheduleStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'IN_PROGRESS', 'CLOSED', 'RETURNED_FOR_REVISION', 'REJECTED', 'CANCELLED');
CREATE TYPE "WorkforceShiftType" AS ENUM ('OPENING', 'MID', 'CLOSING', 'SPLIT', 'OVERNIGHT', 'SPECIAL_EVENT');
CREATE TYPE "WorkforceScheduleLineStatus" AS ENUM ('PLANNED', 'ASSIGNED', 'GAP', 'COVERED', 'CANCELLED');
CREATE TYPE "AttendanceImportBatchStatus" AS ENUM ('DRAFT', 'IMPORTED', 'VALIDATING', 'REVIEW_READY', 'EXCEPTION_LIST', 'REJECTED', 'VOIDED');
CREATE TYPE "AttendanceImportLineStatus" AS ENUM ('ACCEPTED', 'DUPLICATE', 'UNMATCHED_EMPLOYEE', 'INVALID_TIME', 'LOCATION_MISMATCH', 'LEAVE_CONFLICT', 'OVERTIME_CONFLICT', 'VOIDED');

CREATE TABLE "WorkforceSchedule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "departmentId" UUID,
  "costCenterId" UUID,
  "publicReference" TEXT NOT NULL,
  "scheduleDate" TIMESTAMP(3) NOT NULL,
  "shiftType" "WorkforceShiftType" NOT NULL,
  "status" "WorkforceScheduleStatus" NOT NULL DEFAULT 'DRAFT',
  "plannedHeadcount" INTEGER NOT NULL DEFAULT 0,
  "assignedHeadcount" INTEGER NOT NULL DEFAULT 0,
  "coverageGapCount" INTEGER NOT NULL DEFAULT 0,
  "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "reason" TEXT,
  "evidenceReference" TEXT,
  "idempotencyKey" TEXT,
  "sourceEventKey" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "submittedByUserId" UUID,
  "approvedByUserId" UUID,
  "publishedByUserId" UUID,
  "cancelledByUserId" UUID,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkforceSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkforceScheduleLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "workforceScheduleId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "brandId" UUID,
  "departmentId" UUID,
  "costCenterId" UUID,
  "employeeId" UUID,
  "lineNumber" INTEGER NOT NULL,
  "stationCode" TEXT NOT NULL,
  "roleLabel" TEXT NOT NULL,
  "plannedStartAt" TIMESTAMP(3) NOT NULL,
  "plannedEndAt" TIMESTAMP(3) NOT NULL,
  "plannedMinutes" INTEGER NOT NULL,
  "status" "WorkforceScheduleLineStatus" NOT NULL DEFAULT 'PLANNED',
  "coverageGapReason" TEXT,
  "evidenceReference" TEXT,
  "createdByUserId" UUID NOT NULL,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkforceScheduleLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceImportBatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "locationId" UUID NOT NULL,
  "publicReference" TEXT NOT NULL,
  "businessDate" TIMESTAMP(3) NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "sourceFileReference" TEXT,
  "sourceTimezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
  "status" "AttendanceImportBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "exceptionCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "validationSummary" JSONB,
  "evidenceReference" TEXT,
  "rejectionReason" TEXT,
  "voidReason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "reviewedByUserId" UUID,
  "voidedByUserId" UUID,
  "importedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceImportLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "attendanceImportBatchId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "brandId" UUID,
  "employeeId" UUID,
  "sourceRowNumber" INTEGER NOT NULL,
  "employeeCodeRaw" TEXT,
  "employeeNameRaw" TEXT,
  "punchInAt" TIMESTAMP(3),
  "punchOutAt" TIMESTAMP(3),
  "workMinutes" INTEGER NOT NULL DEFAULT 0,
  "status" "AttendanceImportLineStatus" NOT NULL DEFAULT 'ACCEPTED',
  "exceptionCode" TEXT,
  "exceptionMessage" TEXT,
  "sourcePayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceImportLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkforceSchedule_companyId_publicReference_key" ON "WorkforceSchedule"("companyId", "publicReference");
CREATE UNIQUE INDEX "WorkforceSchedule_tenantId_companyId_sourceEventKey_key" ON "WorkforceSchedule"("tenantId", "companyId", "sourceEventKey");
CREATE UNIQUE INDEX "WorkforceSchedule_tenantId_companyId_idempotencyKey_key" ON "WorkforceSchedule"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "WorkforceSchedule_tenantId_companyId_locationId_scheduleDate_status_idx" ON "WorkforceSchedule"("tenantId", "companyId", "locationId", "scheduleDate", "status");
CREATE INDEX "WorkforceSchedule_tenantId_companyId_brandId_scheduleDate_status_idx" ON "WorkforceSchedule"("tenantId", "companyId", "brandId", "scheduleDate", "status");

CREATE UNIQUE INDEX "WorkforceScheduleLine_workforceScheduleId_lineNumber_key" ON "WorkforceScheduleLine"("workforceScheduleId", "lineNumber");
CREATE INDEX "WorkforceScheduleLine_tenantId_companyId_workforceScheduleId_status_idx" ON "WorkforceScheduleLine"("tenantId", "companyId", "workforceScheduleId", "status");
CREATE INDEX "WorkforceScheduleLine_tenantId_companyId_locationId_plannedStartAt_status_idx" ON "WorkforceScheduleLine"("tenantId", "companyId", "locationId", "plannedStartAt", "status");
CREATE INDEX "WorkforceScheduleLine_tenantId_companyId_employeeId_plannedStartAt_idx" ON "WorkforceScheduleLine"("tenantId", "companyId", "employeeId", "plannedStartAt");

CREATE UNIQUE INDEX "AttendanceImportBatch_companyId_publicReference_key" ON "AttendanceImportBatch"("companyId", "publicReference");
CREATE UNIQUE INDEX "AttendanceImportBatch_tenantId_companyId_idempotencyKey_key" ON "AttendanceImportBatch"("tenantId", "companyId", "idempotencyKey");
CREATE INDEX "AttendanceImportBatch_tenantId_companyId_locationId_businessDate_status_idx" ON "AttendanceImportBatch"("tenantId", "companyId", "locationId", "businessDate", "status");
CREATE INDEX "AttendanceImportBatch_tenantId_companyId_brandId_businessDate_status_idx" ON "AttendanceImportBatch"("tenantId", "companyId", "brandId", "businessDate", "status");

CREATE UNIQUE INDEX "AttendanceImportLine_attendanceImportBatchId_sourceRowNumber_key" ON "AttendanceImportLine"("attendanceImportBatchId", "sourceRowNumber");
CREATE INDEX "AttendanceImportLine_tenantId_companyId_attendanceImportBatchId_status_idx" ON "AttendanceImportLine"("tenantId", "companyId", "attendanceImportBatchId", "status");
CREATE INDEX "AttendanceImportLine_tenantId_companyId_locationId_punchInAt_status_idx" ON "AttendanceImportLine"("tenantId", "companyId", "locationId", "punchInAt", "status");
CREATE INDEX "AttendanceImportLine_tenantId_companyId_employeeId_punchInAt_idx" ON "AttendanceImportLine"("tenantId", "companyId", "employeeId", "punchInAt");

ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceSchedule" ADD CONSTRAINT "WorkforceSchedule_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_workforceScheduleId_fkey" FOREIGN KEY ("workforceScheduleId") REFERENCES "WorkforceSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceScheduleLine" ADD CONSTRAINT "WorkforceScheduleLine_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceImportBatch" ADD CONSTRAINT "AttendanceImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportBatch" ADD CONSTRAINT "AttendanceImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportBatch" ADD CONSTRAINT "AttendanceImportBatch_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportBatch" ADD CONSTRAINT "AttendanceImportBatch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportBatch" ADD CONSTRAINT "AttendanceImportBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportBatch" ADD CONSTRAINT "AttendanceImportBatch_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportBatch" ADD CONSTRAINT "AttendanceImportBatch_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceImportLine" ADD CONSTRAINT "AttendanceImportLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportLine" ADD CONSTRAINT "AttendanceImportLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportLine" ADD CONSTRAINT "AttendanceImportLine_attendanceImportBatchId_fkey" FOREIGN KEY ("attendanceImportBatchId") REFERENCES "AttendanceImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportLine" ADD CONSTRAINT "AttendanceImportLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportLine" ADD CONSTRAINT "AttendanceImportLine_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceImportLine" ADD CONSTRAINT "AttendanceImportLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
