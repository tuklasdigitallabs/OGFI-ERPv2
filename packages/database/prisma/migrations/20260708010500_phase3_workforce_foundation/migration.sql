CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED', 'LEAVE_OF_ABSENCE');
CREATE TYPE "EmployeeEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERN');
CREATE TYPE "EmployeeAssignmentType" AS ENUM ('PRIMARY', 'SECONDMENT', 'PROJECT_COVERAGE', 'TEMPORARY');
CREATE TYPE "EmployeeAssignmentStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "EmployeeLeaveType" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'EMERGENCY', 'MATERNITY', 'PATERNITY', 'OTHER');
CREATE TYPE "EmployeeLeaveStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION', 'CANCELLED', 'TAKEN');
CREATE TYPE "EmployeeOvertimeType" AS ENUM ('REGULAR', 'WEEKEND', 'HOLIDAY', 'NIGHT_SHIFT', 'EMERGENCY');
CREATE TYPE "EmployeeOvertimeStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "EmployeeTrainingStatus" AS ENUM ('PLANNED', 'COMPLETED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "EmployeeDocumentType" AS ENUM ('ID_DOCUMENT', 'LICENSE', 'HEALTH_CERT', 'FOOD_HANDLER_CERT', 'SAFETY_TRAINING', 'OTHER');
CREATE TYPE "EmployeeDocumentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'REPLACED', 'LOST');

CREATE TABLE "Employee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID,
    "employeeCode" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "preferredName" TEXT,
    "jobTitle" TEXT,
    "emailPersonal" TEXT,
    "phoneNumber" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "employmentType" "EmployeeEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" TIMESTAMP(3) NOT NULL,
    "separationDate" TIMESTAMP(3),
    "homeLocationId" UUID,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Employee_code_required_check" CHECK (length(trim("employeeCode")) > 0),
    CONSTRAINT "Employee_name_required_check" CHECK (length(trim("legalName")) > 0),
    CONSTRAINT "Employee_hire_separation_check" CHECK ("separationDate" IS NULL OR "separationDate" >= "hireDate")
);

CREATE TABLE "EmployeeAssignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "brandId" UUID,
    "departmentId" UUID,
    "costCenterId" UUID,
    "assignmentType" "EmployeeAssignmentType" NOT NULL DEFAULT 'PRIMARY',
    "status" "EmployeeAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "roleLabel" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmployeeAssignment_effective_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE TABLE "EmployeeLeaveRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "locationId" UUID,
    "leaveType" "EmployeeLeaveType" NOT NULL,
    "status" "EmployeeLeaveStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "reason" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "requestedMinutes" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "sourceEventKey" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decisionAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLeaveRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmployeeLeaveRequest_dates_check" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "EmployeeLeaveRequest_minutes_check" CHECK ("requestedMinutes" > 0),
    CONSTRAINT "EmployeeLeaveRequest_reason_required_check" CHECK (length(trim("reason")) > 0),
    CONSTRAINT "EmployeeLeaveRequest_no_self_approval_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "requestedByUserId"),
    CONSTRAINT "EmployeeLeaveRequest_approved_actor_check" CHECK ("status" <> 'APPROVED' OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL))
);

CREATE TABLE "EmployeeOvertimeRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "locationId" UUID,
    "overtimeType" "EmployeeOvertimeType" NOT NULL,
    "status" "EmployeeOvertimeStatus" NOT NULL DEFAULT 'DRAFT',
    "workedStartAt" TIMESTAMP(3) NOT NULL,
    "workedEndAt" TIMESTAMP(3) NOT NULL,
    "requestedMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "idempotencyKey" TEXT,
    "sourceEventKey" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeOvertimeRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmployeeOvertimeRecord_times_check" CHECK ("workedEndAt" > "workedStartAt"),
    CONSTRAINT "EmployeeOvertimeRecord_minutes_check" CHECK ("requestedMinutes" > 0),
    CONSTRAINT "EmployeeOvertimeRecord_reason_required_check" CHECK (length(trim("reason")) > 0),
    CONSTRAINT "EmployeeOvertimeRecord_no_self_approval_check" CHECK ("approvedByUserId" IS NULL OR "approvedByUserId" <> "requestedByUserId"),
    CONSTRAINT "EmployeeOvertimeRecord_approved_actor_check" CHECK ("status" <> 'APPROVED' OR ("approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL))
);

CREATE TABLE "EmployeeTrainingRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "trainingCode" TEXT NOT NULL,
    "trainingName" TEXT NOT NULL,
    "provider" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" "EmployeeTrainingStatus" NOT NULL DEFAULT 'PLANNED',
    "attachmentId" UUID,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "requiredForScope" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTrainingRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmployeeTrainingRecord_code_required_check" CHECK (length(trim("trainingCode")) > 0),
    CONSTRAINT "EmployeeTrainingRecord_name_required_check" CHECK (length(trim("trainingName")) > 0),
    CONSTRAINT "EmployeeTrainingRecord_completion_check" CHECK ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL)
);

CREATE TABLE "EmployeeComplianceDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "documentType" "EmployeeDocumentType" NOT NULL,
    "documentNumber" TEXT,
    "status" "EmployeeDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3),
    "expiryAt" TIMESTAMP(3),
    "issuedBy" TEXT,
    "attachmentId" UUID,
    "isMandatoryForRole" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeComplianceDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmployeeComplianceDocument_issue_expiry_check" CHECK ("expiryAt" IS NULL OR "issuedAt" IS NULL OR "expiryAt" >= "issuedAt")
);

CREATE UNIQUE INDEX "Employee_tenantId_companyId_employeeCode_key" ON "Employee"("tenantId", "companyId", "employeeCode");
CREATE UNIQUE INDEX "Employee_tenantId_companyId_userId_key" ON "Employee"("tenantId", "companyId", "userId");
CREATE INDEX "Employee_tenantId_companyId_status_idx" ON "Employee"("tenantId", "companyId", "status");
CREATE INDEX "Employee_tenantId_companyId_homeLocationId_status_idx" ON "Employee"("tenantId", "companyId", "homeLocationId", "status");

CREATE INDEX "EmployeeAssignment_tenantId_companyId_employeeId_status_effectiveFrom_idx" ON "EmployeeAssignment"("tenantId", "companyId", "employeeId", "status", "effectiveFrom");
CREATE INDEX "EmployeeAssignment_tenantId_companyId_locationId_status_effectiveFrom_idx" ON "EmployeeAssignment"("tenantId", "companyId", "locationId", "status", "effectiveFrom");
CREATE UNIQUE INDEX "EmployeeAssignment_one_active_primary_per_employee_idx" ON "EmployeeAssignment"("tenantId", "companyId", "employeeId") WHERE "isPrimary" = true AND "status" = 'ACTIVE';

CREATE INDEX "EmployeeLeaveRequest_tenantId_companyId_employeeId_status_startDate_idx" ON "EmployeeLeaveRequest"("tenantId", "companyId", "employeeId", "status", "startDate");
CREATE INDEX "EmployeeLeaveRequest_tenantId_companyId_locationId_status_startDate_idx" ON "EmployeeLeaveRequest"("tenantId", "companyId", "locationId", "status", "startDate");
CREATE INDEX "EmployeeLeaveRequest_tenantId_companyId_sourceEventKey_idx" ON "EmployeeLeaveRequest"("tenantId", "companyId", "sourceEventKey");
CREATE UNIQUE INDEX "EmployeeLeaveRequest_tenantId_companyId_idempotencyKey_key" ON "EmployeeLeaveRequest"("tenantId", "companyId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

CREATE INDEX "EmployeeOvertimeRecord_tenantId_companyId_employeeId_status_workedStartAt_idx" ON "EmployeeOvertimeRecord"("tenantId", "companyId", "employeeId", "status", "workedStartAt");
CREATE INDEX "EmployeeOvertimeRecord_tenantId_companyId_locationId_status_workedStartAt_idx" ON "EmployeeOvertimeRecord"("tenantId", "companyId", "locationId", "status", "workedStartAt");
CREATE INDEX "EmployeeOvertimeRecord_tenantId_companyId_sourceEventKey_idx" ON "EmployeeOvertimeRecord"("tenantId", "companyId", "sourceEventKey");
CREATE UNIQUE INDEX "EmployeeOvertimeRecord_tenantId_companyId_idempotencyKey_key" ON "EmployeeOvertimeRecord"("tenantId", "companyId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "EmployeeTrainingRecord_tenantId_companyId_employeeId_trainingCode_key" ON "EmployeeTrainingRecord"("tenantId", "companyId", "employeeId", "trainingCode");
CREATE INDEX "EmployeeTrainingRecord_tenantId_companyId_employeeId_status_validUntil_idx" ON "EmployeeTrainingRecord"("tenantId", "companyId", "employeeId", "status", "validUntil");
CREATE INDEX "EmployeeTrainingRecord_tenantId_companyId_status_validUntil_idx" ON "EmployeeTrainingRecord"("tenantId", "companyId", "status", "validUntil");

CREATE INDEX "EmployeeComplianceDocument_tenantId_companyId_employeeId_documentType_status_idx" ON "EmployeeComplianceDocument"("tenantId", "companyId", "employeeId", "documentType", "status");
CREATE INDEX "EmployeeComplianceDocument_tenantId_companyId_status_expiryAt_idx" ON "EmployeeComplianceDocument"("tenantId", "companyId", "status", "expiryAt");
CREATE INDEX "EmployeeComplianceDocument_active_expiry_idx" ON "EmployeeComplianceDocument"("tenantId", "companyId", "expiryAt") WHERE "status" = 'ACTIVE' AND "expiryAt" IS NOT NULL;

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_homeLocationId_fkey" FOREIGN KEY ("homeLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeOvertimeRecord" ADD CONSTRAINT "EmployeeOvertimeRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeOvertimeRecord" ADD CONSTRAINT "EmployeeOvertimeRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeOvertimeRecord" ADD CONSTRAINT "EmployeeOvertimeRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeOvertimeRecord" ADD CONSTRAINT "EmployeeOvertimeRecord_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeOvertimeRecord" ADD CONSTRAINT "EmployeeOvertimeRecord_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeOvertimeRecord" ADD CONSTRAINT "EmployeeOvertimeRecord_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeOvertimeRecord" ADD CONSTRAINT "EmployeeOvertimeRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeOvertimeRecord" ADD CONSTRAINT "EmployeeOvertimeRecord_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeTrainingRecord" ADD CONSTRAINT "EmployeeTrainingRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeTrainingRecord" ADD CONSTRAINT "EmployeeTrainingRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeTrainingRecord" ADD CONSTRAINT "EmployeeTrainingRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeTrainingRecord" ADD CONSTRAINT "EmployeeTrainingRecord_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeTrainingRecord" ADD CONSTRAINT "EmployeeTrainingRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeTrainingRecord" ADD CONSTRAINT "EmployeeTrainingRecord_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeComplianceDocument" ADD CONSTRAINT "EmployeeComplianceDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeComplianceDocument" ADD CONSTRAINT "EmployeeComplianceDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeComplianceDocument" ADD CONSTRAINT "EmployeeComplianceDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeComplianceDocument" ADD CONSTRAINT "EmployeeComplianceDocument_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeComplianceDocument" ADD CONSTRAINT "EmployeeComplianceDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeComplianceDocument" ADD CONSTRAINT "EmployeeComplianceDocument_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
