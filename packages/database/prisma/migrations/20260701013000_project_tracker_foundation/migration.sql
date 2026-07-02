CREATE TYPE "ProjectTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "ProjectMemberRole" AS ENUM ('SPONSOR', 'MANAGER', 'CONTRIBUTOR', 'VIEWER', 'ADMINISTRATOR');

ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_id_tenantId_companyId_key" UNIQUE ("id", "tenantId", "companyId");

ALTER TABLE "Location"
  ADD CONSTRAINT "Location_id_tenantId_companyId_key" UNIQUE ("id", "tenantId", "companyId");

ALTER TABLE "Department"
  ADD CONSTRAINT "Department_id_tenantId_companyId_key" UNIQUE ("id", "tenantId", "companyId");

ALTER TABLE "CostCenter"
  ADD CONSTRAINT "CostCenter_id_tenantId_companyId_key" UNIQUE ("id", "tenantId", "companyId");

CREATE TABLE "ProjectTemplate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "projectType" TEXT NOT NULL,
  "status" "ProjectTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "isRestrictedDefault" BOOLEAN NOT NULL DEFAULT false,
  "configJson" JSONB NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectTemplate_code_check" CHECK (length(trim("code")) >= 2),
  CONSTRAINT "ProjectTemplate_name_check" CHECK (length(trim("name")) >= 2),
  CONSTRAINT "ProjectTemplate_projectType_check" CHECK (length(trim("projectType")) >= 2)
);

CREATE TABLE "Project" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "templateId" UUID,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "projectType" TEXT NOT NULL,
  "brandId" UUID,
  "locationId" UUID,
  "departmentId" UUID,
  "costCenterId" UUID,
  "sponsorUserId" UUID NOT NULL,
  "managerUserId" UUID NOT NULL,
  "isRestricted" BOOLEAN NOT NULL DEFAULT false,
  "startAt" TIMESTAMP(3),
  "targetEndAt" TIMESTAMP(3),
  "actualEndAt" TIMESTAMP(3),
  "description" TEXT,
  "templateSnapshotJson" JSONB,
  "projectConfigJson" JSONB,
  "archivedAt" TIMESTAMP(3),
  "archivedByUserId" UUID,
  "archiveReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" UUID NOT NULL,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Project_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Project_code_check" CHECK (length(trim("code")) >= 2),
  CONSTRAINT "Project_name_check" CHECK (length(trim("name")) >= 2),
  CONSTRAINT "Project_projectType_check" CHECK (length(trim("projectType")) >= 2),
  CONSTRAINT "Project_archive_fields_check"
    CHECK (
      ("archivedAt" IS NULL AND "archivedByUserId" IS NULL AND "archiveReason" IS NULL)
      OR ("archivedAt" IS NOT NULL AND "archivedByUserId" IS NOT NULL AND "archiveReason" IS NOT NULL AND length(trim("archiveReason")) >= 5)
    ),
  CONSTRAINT "Project_date_order_check"
    CHECK (
      ("startAt" IS NULL OR "targetEndAt" IS NULL OR "startAt" <= "targetEndAt")
      AND ("actualEndAt" IS NULL OR "startAt" IS NULL OR "startAt" <= "actualEndAt")
    )
);

CREATE TABLE "ProjectMember" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "projectRole" "ProjectMemberRole" NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "addedByUserId" UUID NOT NULL,
  "removedAt" TIMESTAMP(3),
  "removedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectMember_removed_fields_check"
    CHECK (
      ("status" = 'ACTIVE' AND "removedAt" IS NULL AND "removedByUserId" IS NULL)
      OR ("status" <> 'ACTIVE' AND "removedAt" IS NOT NULL AND "removedByUserId" IS NOT NULL)
    )
);

CREATE TABLE "ProjectActivityEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestId" TEXT,
  "correlationId" TEXT,
  "reason" TEXT,
  "beforeData" JSONB,
  "afterData" JSONB,
  "metadata" JSONB,

  CONSTRAINT "ProjectActivityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectActivityEvent_eventType_check" CHECK (length(trim("eventType")) >= 2),
  CONSTRAINT "ProjectActivityEvent_entityType_check" CHECK (length(trim("entityType")) >= 2)
);

CREATE UNIQUE INDEX "ProjectTemplate_companyId_code_key"
  ON "ProjectTemplate"("companyId", "code");

CREATE INDEX "ProjectTemplate_tenantId_companyId_status_idx"
  ON "ProjectTemplate"("tenantId", "companyId", "status");

CREATE UNIQUE INDEX "Project_companyId_code_key"
  ON "Project"("companyId", "code");

CREATE INDEX "Project_tenantId_companyId_status_idx"
  ON "Project"("tenantId", "companyId", "status");

CREATE INDEX "Project_tenantId_companyId_isRestricted_idx"
  ON "Project"("tenantId", "companyId", "isRestricted");

CREATE INDEX "Project_tenantId_companyId_brandId_status_idx"
  ON "Project"("tenantId", "companyId", "brandId", "status");

CREATE INDEX "Project_tenantId_companyId_locationId_status_idx"
  ON "Project"("tenantId", "companyId", "locationId", "status");

CREATE INDEX "Project_tenantId_companyId_departmentId_status_idx"
  ON "Project"("tenantId", "companyId", "departmentId", "status");

CREATE INDEX "Project_tenantId_companyId_costCenterId_status_idx"
  ON "Project"("tenantId", "companyId", "costCenterId", "status");

CREATE INDEX "Project_managerUserId_status_idx"
  ON "Project"("managerUserId", "status");

CREATE INDEX "Project_sponsorUserId_status_idx"
  ON "Project"("sponsorUserId", "status");

CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key"
  ON "ProjectMember"("projectId", "userId");

CREATE INDEX "ProjectMember_tenantId_companyId_status_idx"
  ON "ProjectMember"("tenantId", "companyId", "status");

CREATE INDEX "ProjectMember_tenantId_companyId_userId_status_idx"
  ON "ProjectMember"("tenantId", "companyId", "userId", "status");

CREATE INDEX "ProjectMember_projectId_projectRole_status_idx"
  ON "ProjectMember"("projectId", "projectRole", "status");

CREATE INDEX "ProjectActivityEvent_tenantId_companyId_projectId_occurredAt_idx"
  ON "ProjectActivityEvent"("tenantId", "companyId", "projectId", "occurredAt");

CREATE INDEX "ProjectActivityEvent_tenantId_entityType_entityId_occurredAt_idx"
  ON "ProjectActivityEvent"("tenantId", "entityType", "entityId", "occurredAt");

CREATE INDEX "ProjectActivityEvent_actorUserId_occurredAt_idx"
  ON "ProjectActivityEvent"("actorUserId", "occurredAt");

ALTER TABLE "ProjectTemplate"
  ADD CONSTRAINT "ProjectTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectTemplate"
  ADD CONSTRAINT "ProjectTemplate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectTemplate"
  ADD CONSTRAINT "ProjectTemplate_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectTemplate"
  ADD CONSTRAINT "ProjectTemplate_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_brandId_tenantId_companyId_fkey"
  FOREIGN KEY ("brandId", "tenantId", "companyId") REFERENCES "Brand"("id", "tenantId", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_locationId_tenantId_companyId_fkey"
  FOREIGN KEY ("locationId", "tenantId", "companyId") REFERENCES "Location"("id", "tenantId", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_departmentId_tenantId_companyId_fkey"
  FOREIGN KEY ("departmentId", "tenantId", "companyId") REFERENCES "Department"("id", "tenantId", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_costCenterId_tenantId_companyId_fkey"
  FOREIGN KEY ("costCenterId", "tenantId", "companyId") REFERENCES "CostCenter"("id", "tenantId", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_sponsorUserId_fkey"
  FOREIGN KEY ("sponsorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_managerUserId_fkey"
  FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_archivedByUserId_fkey"
  FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_addedByUserId_fkey"
  FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_removedByUserId_fkey"
  FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectActivityEvent"
  ADD CONSTRAINT "ProjectActivityEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectActivityEvent"
  ADD CONSTRAINT "ProjectActivityEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectActivityEvent"
  ADD CONSTRAINT "ProjectActivityEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectActivityEvent"
  ADD CONSTRAINT "ProjectActivityEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
