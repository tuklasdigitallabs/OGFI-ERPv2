CREATE TYPE "ProjectRiskStatus" AS ENUM (
  'OPEN',
  'MITIGATING',
  'MITIGATED',
  'ACCEPTED',
  'REALIZED',
  'CLOSED',
  'CANCELLED'
);

CREATE TYPE "ProjectRiskRating" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TABLE "ProjectRisk" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "taskId" UUID,
  "milestoneId" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "likelihood" "ProjectRiskRating" NOT NULL,
  "impact" "ProjectRiskRating" NOT NULL,
  "severity" "ProjectRiskRating" NOT NULL,
  "status" "ProjectRiskStatus" NOT NULL DEFAULT 'OPEN',
  "ownerUserId" UUID NOT NULL,
  "targetMitigationDate" DATE,
  "mitigationPlan" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" UUID,
  "resolutionNote" TEXT,
  "evidenceReference" TEXT,
  "lastReopenedAt" TIMESTAMP(3),
  "lastReopenReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectRisk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectRisk_title_check" CHECK (length(trim("title")) >= 2),
  CONSTRAINT "ProjectRisk_category_check" CHECK (length(trim("category")) >= 2),
  CONSTRAINT "ProjectRisk_context_check" CHECK ("taskId" IS NULL OR "milestoneId" IS NULL),
  CONSTRAINT "ProjectRisk_terminal_fields_check"
    CHECK (
      (
        "status" NOT IN ('MITIGATED', 'ACCEPTED', 'REALIZED', 'CLOSED', 'CANCELLED')
      )
      OR (
        "resolvedAt" IS NOT NULL
        AND "resolvedByUserId" IS NOT NULL
        AND "resolutionNote" IS NOT NULL
        AND length(trim("resolutionNote")) >= 5
      )
    )
);

CREATE UNIQUE INDEX "ProjectRisk_id_tenantId_companyId_projectId_key"
  ON "ProjectRisk"("id", "tenantId", "companyId", "projectId");

CREATE INDEX "ProjectRisk_tenantId_companyId_projectId_status_idx"
  ON "ProjectRisk"("tenantId", "companyId", "projectId", "status");

CREATE INDEX "ProjectRisk_tenantId_companyId_projectId_taskId_idx"
  ON "ProjectRisk"("tenantId", "companyId", "projectId", "taskId");

CREATE INDEX "ProjectRisk_tenantId_companyId_projectId_milestoneId_idx"
  ON "ProjectRisk"("tenantId", "companyId", "projectId", "milestoneId");

CREATE INDEX "ProjectRisk_tenantId_companyId_ownerUserId_status_idx"
  ON "ProjectRisk"("tenantId", "companyId", "ownerUserId", "status");

CREATE INDEX "ProjectRisk_tenantId_companyId_severity_status_idx"
  ON "ProjectRisk"("tenantId", "companyId", "severity", "status");

CREATE INDEX "ProjectRisk_tenantId_companyId_targetMitigationDate_status_idx"
  ON "ProjectRisk"("tenantId", "companyId", "targetMitigationDate", "status");

ALTER TABLE "ProjectRisk"
  ADD CONSTRAINT "ProjectRisk_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRisk_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRisk_projectId_tenantId_companyId_fkey" FOREIGN KEY ("projectId", "tenantId", "companyId") REFERENCES "Project"("id", "tenantId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRisk_taskId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("taskId", "tenantId", "companyId", "projectId") REFERENCES "ProjectTask"("id", "tenantId", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRisk_milestoneId_tenantId_companyId_projectId_fkey" FOREIGN KEY ("milestoneId", "tenantId", "companyId", "projectId") REFERENCES "ProjectMilestone"("id", "tenantId", "companyId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRisk_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRisk_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRisk_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectRisk_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
