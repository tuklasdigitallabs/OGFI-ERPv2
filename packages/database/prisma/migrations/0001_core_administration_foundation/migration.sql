-- Initial Phase I Core Administration foundation.
-- Generated review baseline; run `pnpm db:migrate` after dependencies are installed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "LocationType" AS ENUM ('BRANCH', 'WAREHOUSE', 'COMMISSARY', 'CENTRAL_KITCHEN', 'HEAD_OFFICE', 'PROJECT_SITE', 'TEMPORARY_SITE');
CREATE TYPE "ScopeType" AS ENUM ('COMPANY', 'BRAND', 'LOCATION', 'DEPARTMENT', 'PROJECT');
CREATE TYPE "AccessLevel" AS ENUM ('VIEW', 'OPERATE', 'APPROVE', 'MANAGE');
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED');
CREATE TYPE "ApprovalStepStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'SKIPPED');

CREATE TABLE "Tenant" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "defaultTimezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
  "themeConfig" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Company" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "legalName" TEXT NOT NULL,
  "tradingName" TEXT,
  "taxIdentifier" TEXT,
  "currencyCode" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Brand" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Brand_companyId_code_key" UNIQUE ("companyId", "code")
);

CREATE TABLE "Location" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "brandId" UUID REFERENCES "Brand"("id"),
  "locationType" "LocationType" NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Location_companyId_code_key" UNIQUE ("companyId", "code")
);

CREATE TABLE "Department" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "Department_companyId_code_key" UNIQUE ("companyId", "code")
);

CREATE TABLE "CostCenter" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "departmentId" UUID REFERENCES "Department"("id"),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "CostCenter_companyId_code_key" UNIQUE ("companyId", "code")
);

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_tenantId_email_key" UNIQUE ("tenantId", "email")
);

CREATE TABLE "Role" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID REFERENCES "Tenant"("id"),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "systemRole" BOOLEAN NOT NULL DEFAULT false,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "Role_tenantId_code_key" UNIQUE ("tenantId", "code")
);

CREATE TABLE "Permission" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID REFERENCES "Tenant"("id"),
  "code" TEXT NOT NULL UNIQUE,
  "module" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "description" TEXT
);

CREATE TABLE "RolePermission" (
  "roleId" UUID NOT NULL REFERENCES "Role"("id"),
  "permissionId" UUID NOT NULL REFERENCES "Permission"("id"),
  PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "UserRoleAssignment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id"),
  "roleId" UUID NOT NULL REFERENCES "Role"("id"),
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE "UserScopeAssignment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id"),
  "scopeType" "ScopeType" NOT NULL,
  "scopeId" UUID NOT NULL,
  "accessLevel" "AccessLevel" NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE "PurchaseRequest" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "publicReference" TEXT NOT NULL,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "brandId" UUID REFERENCES "Brand"("id"),
  "requestLocationId" UUID NOT NULL REFERENCES "Location"("id"),
  "requesterUserId" UUID NOT NULL REFERENCES "User"("id"),
  "departmentId" UUID REFERENCES "Department"("id"),
  "costCenterId" UUID REFERENCES "CostCenter"("id"),
  "requiredDate" TIMESTAMP(3) NOT NULL,
  "urgency" TEXT NOT NULL,
  "justification" TEXT NOT NULL,
  "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "currentApprovalStep" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseRequest_companyId_publicReference_key" UNIQUE ("companyId", "publicReference")
);

CREATE TABLE "PurchaseRequestLine" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchaseRequestId" UUID NOT NULL REFERENCES "PurchaseRequest"("id"),
  "lineNumber" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "requestedQty" DECIMAL(18, 6) NOT NULL,
  "uomCode" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "notes" TEXT,
  CONSTRAINT "PurchaseRequestLine_purchaseRequestId_lineNumber_key" UNIQUE ("purchaseRequestId", "lineNumber")
);

CREATE TABLE "ApprovalRule" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID REFERENCES "Company"("id"),
  "transactionType" TEXT NOT NULL,
  "scopeFilters" JSONB,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ApprovalRuleStep" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "approvalRuleId" UUID NOT NULL REFERENCES "ApprovalRule"("id"),
  "stepOrder" INTEGER NOT NULL,
  "approverType" TEXT NOT NULL,
  "roleId" UUID,
  "userId" UUID,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "escalationHours" INTEGER,
  CONSTRAINT "ApprovalRuleStep_approvalRuleId_stepOrder_key" UNIQUE ("approvalRuleId", "stepOrder")
);

CREATE TABLE "ApprovalInstance" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID NOT NULL REFERENCES "Company"("id"),
  "documentType" TEXT NOT NULL,
  "documentId" UUID NOT NULL,
  "approvalRuleId" UUID NOT NULL REFERENCES "ApprovalRule"("id"),
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "currentStepOrder" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ApprovalInstanceStep" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "approvalInstanceId" UUID NOT NULL REFERENCES "ApprovalInstance"("id"),
  "stepOrder" INTEGER NOT NULL,
  "assignedUserId" UUID,
  "assignedRoleId" UUID,
  "status" "ApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
  "actedAt" TIMESTAMP(3),
  "remarks" TEXT,
  "delegatedFromUserId" UUID,
  CONSTRAINT "ApprovalInstanceStep_approvalInstanceId_stepOrder_key" UNIQUE ("approvalInstanceId", "stepOrder")
);

CREATE TABLE "Attachment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "storageProvider" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT,
  "uploadedByUserId" UUID,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AuditEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id"),
  "companyId" UUID REFERENCES "Company"("id"),
  "actorUserId" UUID REFERENCES "User"("id"),
  "eventType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestId" TEXT,
  "ipAddress" TEXT,
  "beforeData" JSONB,
  "afterData" JSONB,
  "metadata" JSONB
);

CREATE INDEX "Company_tenantId_status_idx" ON "Company"("tenantId", "status");
CREATE INDEX "Brand_tenantId_companyId_status_idx" ON "Brand"("tenantId", "companyId", "status");
CREATE INDEX "Location_tenantId_companyId_status_idx" ON "Location"("tenantId", "companyId", "status");
CREATE INDEX "UserScopeAssignment_userId_scopeType_scopeId_status_idx" ON "UserScopeAssignment"("userId", "scopeType", "scopeId", "status");
CREATE INDEX "PurchaseRequest_tenantId_companyId_status_idx" ON "PurchaseRequest"("tenantId", "companyId", "status");
CREATE INDEX "PurchaseRequest_tenantId_requestLocationId_status_idx" ON "PurchaseRequest"("tenantId", "requestLocationId", "status");
CREATE INDEX "ApprovalInstance_tenantId_documentType_documentId_idx" ON "ApprovalInstance"("tenantId", "documentType", "documentId");
CREATE INDEX "AuditEvent_tenantId_entityType_entityId_occurredAt_idx" ON "AuditEvent"("tenantId", "entityType", "entityId", "occurredAt");
